/**
 * mntviz/measure.js — Ferramentas de medida: Ruler (régua em mm pelo ppi),
 * RidgeCount (contagem de cristas pelo perfil ao longo de um segmento) e ScaleBar
 * (barra de escala na tela).
 *
 * mm = px / ppi · 25,4. O ppi é o da amostra (500 ou 1.000); sem ele a régua mostra
 * só px. Rotação e espelho da vista não mudam a medida (as coordenadas são da imagem).
 *
 * RidgeCount: o perfil é amostrado a cada 1 px ao longo do segmento, com interpolação
 * bilinear sobre os valores do arquivo (canal R; numa imagem cinza R = G = B), suavizado
 * por uma gaussiana (sigma em px) e as cristas são os mínimos locais (cristas escuras),
 * com proeminência mínima (a do scipy.signal.peak_prominences), sem contar duas vezes
 * um vale partido por um poro e longe das pontas.
 *
 * Uso:
 *   const ruler = new Ruler(viewer, { ppi: 500 });
 *   modes.add(ruler);                      // ativa no modo 'ruler' (tecla L)
 *   ruler.on('measure', m => status(`${m.mm.toFixed(2)} mm`));
 *   const rc = new RidgeCount(viewer, { ppi: 500, source: () => adj.basePixels() });
 *   rc.count({ x: 120, y: 300 }, { x: 260, y: 310 });   // {count, minima, profile, ...}
 */

import { Emitter } from './events.js';
import { svgEl, uprightTransform, insideImage, onViewFrame, stopEvent, viewScale } from './tools.js';

/** Distância em mm a partir de px e ppi. */
export function mmFromPx(px, ppi) { return ppi > 0 ? px / ppi * 25.4 : NaN; }

/**
 * Perfil ao longo de p1 → p2, uma amostra por px (n = floor(comprimento) + 1),
 * bilinear no canal `channel` de um ImageData. Devolve {values, xs, ys, length}.
 */
export function ridgeProfile(img, p1, p2, { channel = 0 } = {}) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);
    const n = Math.max(2, Math.floor(length) + 1);
    const values = new Float64Array(n), xs = new Float64Array(n), ys = new Float64Array(n);
    const W = img.width, H = img.height, d = img.data;
    const at = (x, y) => d[4 * (y * W + x) + channel];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = p1.x + t * dx, y = p1.y + t * dy;
        xs[i] = x; ys[i] = y;
        const cx = Math.min(Math.max(x, 0), W - 1), cy = Math.min(Math.max(y, 0), H - 1);
        const x0 = Math.floor(cx), y0 = Math.floor(cy);
        const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
        const a = cx - x0, b = cy - y0;
        values[i] = (1 - b) * ((1 - a) * at(x0, y0) + a * at(x1, y0)) + b * ((1 - a) * at(x0, y1) + a * at(x1, y1));
    }
    return { values, xs, ys, length };
}

/** Suavização gaussiana (sigma em amostras; bordas replicadas). */
export function smoothProfile(values, sigma = 1.0) {
    const n = values.length;
    if (!(sigma > 0)) return Float64Array.from(values);
    const r = Math.max(1, Math.ceil(3 * sigma));
    const k = new Float64Array(2 * r + 1);
    let sum = 0;
    for (let j = -r; j <= r; j++) { k[j + r] = Math.exp(-(j * j) / (2 * sigma * sigma)); sum += k[j + r]; }
    for (let j = 0; j < k.length; j++) k[j] /= sum;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let j = -r; j <= r; j++) {
            const idx = Math.min(Math.max(i + j, 0), n - 1);
            acc += k[j + r] * values[idx];
        }
        out[i] = acc;
    }
    return out;
}

/**
 * Mínimos locais com proeminência (cristas escuras; `polarity: 'light'` conta os
 * máximos). Um mínimo é i com s[i] < s[i-1] e s[i] <= s[i+1]. A proeminência é a do
 * scipy.signal.peak_prominences: de cada lado a janela vai até uma amostra estritamente
 * mais baixa que s[i] (ou até a ponta), e vale o menor dos dois máximos da janela menos
 * s[i]; assim um vale partido por um poro não perde a proeminência por causa do mínimo
 * vizinho. Mínimos a menos de `exclude` amostras das pontas não contam.
 *
 * Dois mínimos a menos de `minSeparation` amostras valem uma crista só (o mais proeminente
 * fica; empate: o mais fundo, depois o primeiro). Padrão: 0,35 do período, com o período
 * dado pela mediana dos espaçamentos entre os mínimos (sem efeito com menos de 3 mínimos).
 */
export function findRidges(smoothed, { minProminence = 8, exclude = 3, polarity = 'dark', minSeparation = null } = {}) {
    const n = smoothed.length;
    const s = polarity === 'light' ? Array.from(smoothed, v => -v) : smoothed;
    const out = [];
    for (let i = Math.max(1, exclude); i <= Math.min(n - 2, n - 1 - exclude); i++) {
        if (!(s[i] < s[i - 1] && s[i] <= s[i + 1])) continue;
        let lm = s[i], rm = s[i];
        for (let j = i - 1; j >= 0 && !(s[j] < s[i]); j--) if (s[j] > lm) lm = s[j];
        for (let j = i + 1; j < n && !(s[j] < s[i]); j++) if (s[j] > rm) rm = s[j];
        const prom = Math.min(lm, rm) - s[i];
        if (prom >= minProminence) out.push({ i, prominence: prom });
    }
    let sep = minSeparation;
    if (sep == null) {
        sep = 0;
        if (out.length >= 3) {
            const gaps = [];
            for (let k = 1; k < out.length; k++) gaps.push(out[k].i - out[k - 1].i);
            gaps.sort((a, b) => a - b);
            const mid = gaps.length >> 1;
            sep = 0.35 * (gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2);
        }
    }
    if (sep > 0) {
        for (let k = 1; k < out.length;) {
            const a = out[k - 1], b = out[k];
            if (b.i - a.i >= sep) { k++; continue; }
            const keepB = b.prominence > a.prominence || (b.prominence === a.prominence && s[b.i] < s[a.i]);
            out.splice(keepB ? k - 1 : k, 1);
            if (keepB && k > 1) k--;     // o novo vizinho da esquerda pode estar perto também
        }
    }
    return out;
}

/* ── régua ──────────────────────────────────────────────────── */

const RULER_DEFAULTS = { ppi: 500, layer: 'measure', z: 45, color: '#fbbf24', keep: false, mode: 'ruler' };

export class Ruler extends Emitter {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     * @param {object} [opts] - ppi, color, keep (true: várias medidas), mode ('ruler').
     */
    constructor(viewer, opts = {}) {
        super();
        this.viewer = viewer;
        this._o = { ...RULER_DEFAULTS, ...opts };
        this._layer = viewer.layers.ensure(this._o.layer, { kind: 'svg', z: this._o.z });
        this._g = svgEl('g', { class: 'mntviz-measure mntviz-ruler' }, this._layer.el);
        if (typeof viewer.registerTool === 'function') viewer.registerTool(this);
        this._items = [];
        this._drag = null;
        this._active = false;
        this._exportMode = false;
        this._destroyed = false;
        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        viewer.viewport.addEventListener('mousedown', (e) => this._down(e), { capture: true, ...sig });
        window.addEventListener('mousemove', (e) => this._move(e), { capture: true, ...sig });
        window.addEventListener('mouseup', (e) => this._up(e), { capture: true, ...sig });
        this._offView = onViewFrame(viewer, () => this.render());
    }

    get ppi() { return this._o.ppi; }
    setPpi(ppi) { this._o.ppi = Number(ppi); this._items = this._items.map(m => this._measure(m)); this.render(); return this; }
    get measurements() { return this._items.map(m => ({ ...m })); }
    get active() { return this._active; }

    setMode(mode) { this._active = mode === this._o.mode; if (!this._active) this._drag = null; }

    /** Mede de p1 a p2 (coordenadas da imagem); devolve a medida. */
    measure(p1, p2, { keep = this._o.keep } = {}) {
        const m = this._measure({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        if (!keep) this._items = [];
        this._items.push(m);
        this.render();
        this.emit('measure', { ...m });
        this._emitChange();
        return { ...m };
    }

    clear() { this._items = []; this.render(); this._emitChange(); }

    serialize() { return { kind: 'ruler', ppi: this._o.ppi, items: this.measurements }; }
    restore(state) { this._items = (state && state.items || []).map(m => this._measure(m)); this.render(); return this; }

    handleKey(e, ctx) {
        if (!this._active || (ctx && ctx.focus && ctx.focus !== this.viewer)) return false;
        if (e.key === 'Escape' && (this._drag || this._items.length)) { this._drag = null; this.clear(); return true; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && this._items.length) {
            this._items.pop(); this.render(); this._emitChange(); return true;
        }
        return false;
    }

    beginExport() { this._exportMode = true; this.render(); }
    endExport() { this._exportMode = false; this.render(); }

    destroy() {
        this._destroyed = true;
        if (typeof this.viewer.unregisterTool === 'function') this.viewer.unregisterTool(this);
        this._ac.abort(); this._offView(); this._g.remove(); this.removeAllListeners();
    }

    _measure(m) {
        const px = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
        return { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, px, mm: mmFromPx(px, this._o.ppi), ppi: this._o.ppi };
    }

    _down(e) {
        if (!this._active || e.button !== 0) return;
        const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
        if (!insideImage(this.viewer, p.x, p.y)) return;
        stopEvent(e);
        this._drag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, keep: e.shiftKey || this._o.keep };
        this.render();
    }

    _move(e) {
        if (!this._drag) return;
        const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
        this._drag.x2 = p.x; this._drag.y2 = p.y;
        this.render();
        const m = this._measure(this._drag);
        this.emit('preview', m);
    }

    _up(e) {
        if (!this._drag) return;
        const d = this._drag;
        this._drag = null;
        const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
        d.x2 = p.x; d.y2 = p.y;
        if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * viewScale(this.viewer) < 3) { this.render(); return; }
        this.measure({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }, { keep: d.keep });
    }

    render() {
        if (this._destroyed) return;
        if (!this._g.isConnected) this._layer.el.appendChild(this._g);   // viewer.clear() solta o grupo
        this._g.replaceChildren();
        const all = this._drag ? [...this._items, this._measure(this._drag)] : this._items;
        for (const m of all) _drawSegment(this._g, this.viewer, m, this._o.color, _rulerLabel(m), this._exportMode);
    }

    _emitChange() {
        const payload = { source: 'ruler', type: 'measure', items: this.measurements };
        this.emit('change', payload);
        if (typeof this.viewer._emit === 'function') this.viewer._emit('change', payload);
    }
}

function _rulerLabel(m) {
    const px = `${m.px.toFixed(1)} px`;
    return Number.isFinite(m.mm) ? `${m.mm.toFixed(2)} mm (${px})` : px;
}

/* ── contagem de cristas ─────────────────────────────────────── */

const RIDGE_DEFAULTS = {
    ppi: 500, layer: 'measure', z: 45, color: '#22d3ee', mode: 'ridges',
    sigma: 1.0, minProminence: 8, exclude: 3, polarity: 'dark', channel: 0, source: null, minSeparation: null,
};

export class RidgeCount extends Emitter {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     * @param {object} [opts] - ppi; source: () => ImageData (padrão: pixels do <img>);
     *        sigma, minProminence, exclude, polarity ('dark' = cristas escuras),
     *        minSeparation (amostras; null = 0,35 do período, ver findRidges).
     */
    constructor(viewer, opts = {}) {
        super();
        this.viewer = viewer;
        this._o = { ...RIDGE_DEFAULTS, ...opts };
        this._layer = viewer.layers.ensure(this._o.layer, { kind: 'svg', z: this._o.z });
        this._g = svgEl('g', { class: 'mntviz-measure mntviz-ridgecount' }, this._layer.el);
        if (typeof viewer.registerTool === 'function') viewer.registerTool(this);
        this._items = [];
        this._drag = null;
        this._active = false;
        this._exportMode = false;
        this._destroyed = false;
        this._fallback = null;
        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        viewer.viewport.addEventListener('mousedown', (e) => this._down(e), { capture: true, ...sig });
        window.addEventListener('mousemove', (e) => this._move(e), { capture: true, ...sig });
        window.addEventListener('mouseup', (e) => this._up(e), { capture: true, ...sig });
        this._offView = onViewFrame(viewer, () => this.render());
    }

    get measurements() { return this._items.map(_publicCount); }
    setPpi(ppi) { this._o.ppi = Number(ppi); return this; }
    setMode(mode) { this._active = mode === this._o.mode; if (!this._active) this._drag = null; }

    /** Conta as cristas de p1 a p2. Devolve {x1, y1, x2, y2, px, mm, count, minima, profile, smoothed}. */
    count(p1, p2, { keep = false } = {}) {
        const img = this._pixels();
        if (!img) throw new Error('mntviz RidgeCount: sem pixels (imagem não carregada)');
        const o = this._o;
        const prof = ridgeProfile(img, p1, p2, { channel: o.channel });
        const sm = smoothProfile(prof.values, o.sigma);
        const ridges = findRidges(sm, { minProminence: o.minProminence, exclude: o.exclude, polarity: o.polarity,
            minSeparation: o.minSeparation });
        const m = {
            x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, px: prof.length, mm: mmFromPx(prof.length, o.ppi), ppi: o.ppi,
            count: ridges.length,
            minima: ridges.map(r => ({ i: r.i, x: prof.xs[r.i], y: prof.ys[r.i], v: sm[r.i], prominence: r.prominence })),
            profile: Array.from(prof.values), smoothed: Array.from(sm),
            params: { sigma: o.sigma, minProminence: o.minProminence, exclude: o.exclude, polarity: o.polarity,
                minSeparation: o.minSeparation },
        };
        if (!keep) this._items = [];
        this._items.push(m);
        this.render();
        this.emit('measure', _publicCount(m, true));
        const payload = { source: 'ridgecount', type: 'measure', items: this.measurements };
        this.emit('change', payload);
        if (typeof this.viewer._emit === 'function') this.viewer._emit('change', payload);
        return _publicCount(m, true);
    }

    clear() { this._items = []; this.render(); }
    serialize() { return { kind: 'ridgecount', ppi: this._o.ppi, items: this.measurements }; }

    handleKey(e, ctx) {
        if (!this._active || (ctx && ctx.focus && ctx.focus !== this.viewer)) return false;
        if (e.key === 'Escape' && (this._drag || this._items.length)) { this._drag = null; this.clear(); return true; }
        return false;
    }

    beginExport() { this._exportMode = true; this.render(); }
    endExport() { this._exportMode = false; this.render(); }
    destroy() {
        this._destroyed = true;
        if (typeof this.viewer.unregisterTool === 'function') this.viewer.unregisterTool(this);
        this._ac.abort(); this._offView(); this._g.remove(); this.removeAllListeners();
    }

    _pixels() {
        if (typeof this._o.source === 'function') {
            const px = this._o.source();
            if (px) return px;
        }
        const img = this.viewer.imageElement;
        if (!img.naturalWidth) return null;
        if (!this._fallback || this._fallback.src !== img.src) {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            this._fallback = { src: img.src, data: ctx.getImageData(0, 0, c.width, c.height) };
        }
        return this._fallback.data;
    }

    _down(e) {
        if (!this._active || e.button !== 0) return;
        const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
        if (!insideImage(this.viewer, p.x, p.y)) return;
        stopEvent(e);
        this._drag = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, keep: e.shiftKey };
        this.render();
    }

    _move(e) {
        if (!this._drag) return;
        const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
        this._drag.x2 = p.x; this._drag.y2 = p.y;
        this.render();
    }

    _up(e) {
        if (!this._drag) return;
        const d = this._drag;
        this._drag = null;
        const p = this.viewer.screenToImageCoords(e.clientX, e.clientY);
        if (Math.hypot(p.x - d.x1, p.y - d.y1) * viewScale(this.viewer) < 3) { this.render(); return; }
        this.count({ x: d.x1, y: d.y1 }, { x: p.x, y: p.y }, { keep: d.keep });
    }

    render() {
        if (this._destroyed) return;
        if (!this._g.isConnected) this._layer.el.appendChild(this._g);   // viewer.clear() solta o grupo
        this._g.replaceChildren();
        for (const m of this._items) {
            _drawSegment(this._g, this.viewer, m, this._o.color, `${m.count} cristas · ${m.px.toFixed(0)} px`, this._exportMode);
            for (const t of m.minima) {
                svgEl('circle', { cx: t.x, cy: t.y, r: 1.6, fill: this._o.color, stroke: 'none' }, this._g);
            }
        }
        if (this._drag) {
            const d = this._drag;
            _drawSegment(this._g, this.viewer, { ...d, px: Math.hypot(d.x2 - d.x1, d.y2 - d.y1) }, this._o.color, '…',
                this._exportMode);
        }
    }
}

function _publicCount(m, withProfile = false) {
    const out = { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, px: m.px, mm: m.mm, ppi: m.ppi, count: m.count,
        minima: m.minima.map(t => ({ ...t })), params: { ...m.params } };
    if (withProfile) { out.profile = m.profile.slice(); out.smoothed = m.smoothed.slice(); }
    return out;
}

/* ── desenho comum ──────────────────────────────────────────── */

function _drawSegment(g, viewer, m, color, text, exportMode) {
    const line = { x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2 };
    svgEl('line', { ...line, stroke: '#000', 'stroke-width': 3.2, 'stroke-opacity': 0.55,
        'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round' }, g);
    svgEl('line', { ...line, stroke: color, 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke',
        'stroke-linecap': 'round' }, g);
    // traços nas pontas, perpendiculares, com tamanho fixo na tela
    const s = exportMode ? 1 : viewScale(viewer);
    const len = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) || 1;
    const nx = -(m.y2 - m.y1) / len * 5 / s, ny = (m.x2 - m.x1) / len * 5 / s;
    for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2]]) {
        svgEl('line', { x1: x - nx, y1: y - ny, x2: x + nx, y2: y + ny, stroke: color, 'stroke-width': 1.6,
            'vector-effect': 'non-scaling-stroke' }, g);
    }
    const lg = svgEl('g', { transform: uprightTransform(viewer, (m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, { exportMode }),
        class: 'mntviz-measure-label' }, g);
    const t = svgEl('text', { x: 6, y: -6, 'font-size': 12, 'font-family': 'sans-serif', fill: color,
        stroke: '#000', 'stroke-width': 3, 'stroke-opacity': 0.7, 'paint-order': 'stroke' }, lg);
    t.textContent = text;
}

/* ── barra de escala ─────────────────────────────────────────── */

const NICE_MM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

/**
 * Barra de escala na tela (HTML sobre o viewport): escolhe 0,1 a 50 mm para ficar
 * entre `minPx` e `maxPx` de largura no zoom atual. Rotação e espelho não mudam a escala.
 */
export class ScaleBar {
    constructor(viewer, { ppi = 500, position = 'TL', minPx = 60, maxPx = 160 } = {}) {
        this.viewer = viewer;
        this._o = { ppi, position, minPx, maxPx };
        this._el = document.createElement('div');
        this._el.className = `mntviz-scalebar mntviz-scalebar-${position.toLowerCase()}`;
        this._bar = document.createElement('div');
        this._bar.className = 'mntviz-scalebar-bar';
        this._txt = document.createElement('div');
        this._txt.className = 'mntviz-scalebar-text';
        this._el.append(this._bar, this._txt);
        viewer.viewport.appendChild(this._el);
        this._off = viewer.on('view', () => this.update());
        this.update();
    }

    setPpi(ppi) { this._o.ppi = Number(ppi); this.update(); return this; }

    /** Comprimento atual {mm, px} (px de tela). */
    get value() { return { mm: this._mm, px: this._px }; }

    update() {
        const pxPerMm = viewScale(this.viewer) * this._o.ppi / 25.4;
        let mm = NICE_MM[NICE_MM.length - 1];
        for (const v of NICE_MM) { if (v * pxPerMm >= this._o.minPx) { mm = v; break; } }
        if (mm * pxPerMm > this._o.maxPx) {
            for (let i = NICE_MM.length - 1; i >= 0; i--) if (NICE_MM[i] * pxPerMm <= this._o.maxPx) { mm = NICE_MM[i]; break; }
        }
        this._mm = mm;
        this._px = mm * pxPerMm;
        this._bar.style.width = `${this._px.toFixed(1)}px`;
        this._txt.textContent = `${mm} mm`;
    }

    destroy() { this._off(); this._el.remove(); }
}

/**
 * Barra de escala em SVG para a exportação (coordenadas da imagem, vista nativa):
 * um grupo com a barra de `mm` milímetros no canto `position`.
 */
export function scaleBarSVG(width, height, ppi, { mm = null, position = 'BR', color = '#fff' } = {}) {
    const pxPerMm = ppi / 25.4;
    let len = mm;
    if (len == null) {
        len = 1;
        for (const v of NICE_MM) if (v * pxPerMm <= width * 0.25) len = v;
    }
    const px = len * pxPerMm;
    const pad = Math.max(8, Math.round(width * 0.02));
    const fs = Math.max(10, Math.round(width * 0.022));
    const x0 = position.endsWith('R') ? width - pad - px : pad;
    const y0 = position.startsWith('B') ? height - pad : pad + fs + 6;
    const g = svgEl('g', { class: 'mntviz-scalebar-export', 'data-mm': len, 'data-px': px.toFixed(3) });
    svgEl('rect', { x: x0 - 4, y: y0 - fs - 8, width: px + 8, height: fs + 14, fill: '#000', 'fill-opacity': 0.55, rx: 3 }, g);
    svgEl('line', { x1: x0, y1: y0, x2: x0 + px, y2: y0, stroke: color, 'stroke-width': 3 }, g);
    const t = svgEl('text', { x: x0 + px / 2, y: y0 - 6, 'text-anchor': 'middle', 'font-size': fs,
        'font-family': 'sans-serif', fill: color }, g);
    t.textContent = `${len} mm`;
    return g;
}
