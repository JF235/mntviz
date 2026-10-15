/**
 * mntviz/correspondence-editor.js — Pares numerados entre duas impressões.
 *
 * Esquerda = latente (probe), direita = referência; cada lado é um Viewer. As
 * features vêm de um FeatureEditor (ids estáveis) ou de listas fixas (Features do
 * contrato ou minúcias do .min). Cada par tem um número n, o MESMO nos dois lados
 * e na tabela, e um tipo TOC (definite, possible, does_not_exist, out_of_region,
 * unclear_area). Uma ponta pode ser uma minúcia, um núcleo, um delta ou um ponto
 * livre (kind P do #CORR).
 *
 * Modo 'pair' (tecla P): clique numa feature de um lado arma a ponta; clique numa
 * feature do outro lado fecha o par (1:1: uma feature já pareada só seleciona o par).
 * Clique no vazio (sem arrastar) arma um ponto livre. Teclas no modo: 1-5 tipo do par
 * selecionado, Del desfaz o par, Esc desarma, Ctrl+Z / Ctrl+Shift+Z, G cursor
 * fantasma, O sobreposição (desligada → rígida → MLS), T alternância (flicker).
 *
 * Registro (registration.js, portado do matching.js do dashboard): ajuste rígido por
 * mínimos quadrados (referência → latente) e MLS rígido para o cursor fantasma e a
 * sobreposição da referência sobre a latente.
 *
 * Arquivos: .match (dashboard; colunas SCORE X1 Y1 THETA1 Q1 X2 Y2 THETA2 Q2), #CORR
 * v2 (GT do SD302: KIND IDX_A IDX_B XA YA XB YB) e a lista de índices do exemplo
 * (latent_index reference_index). Número e tipo do par vão em linhas "#PAIR N TYPE",
 * que os leitores antigos ignoram.
 *
 * Uso:
 *   const ce = new CorrespondenceEditor(vLat, vRef, { left: edLat, right: edRef, host });
 *   modes.add(ce);
 *   ce.addPair({ kind: 'minutia', ref: 3 }, { kind: 'minutia', ref: 12 }, { type: 'possible' });
 *   ce.toCorrespondence();   // {pairs: [{i_probe, j_ref, type, n, ...}], transform: {angle, tx, ty}}
 */

import { Emitter } from './events.js';
import {
    History, svgEl, uprightTransform, screenMapper, insideImage, clone, onViewFrame, stopEvent, viewScale,
} from './tools.js';
import { estimateRigid, buildWarp, rigidCanvasMatrix, warpImage } from './registration.js';

export const PAIR_TYPES = ['definite', 'possible', 'does_not_exist', 'out_of_region', 'unclear_area'];
export const PAIR_TYPE_LABELS = {
    definite: 'Definite', possible: 'Possible', does_not_exist: 'DoesNotExist',
    out_of_region: 'OutOfRegion', unclear_area: 'UnclearArea',
};
export const PAIR_COLORS = {
    definite: '#38bdf8', possible: '#f472b6', does_not_exist: '#ef4444', out_of_region: '#94a3b8', unclear_area: '#a78bfa',
};
const KIND_LETTER = { minutia: 'M', core: 'C', delta: 'D', point: 'P' };
const LETTER_KIND = { M: 'minutia', C: 'core', D: 'delta', P: 'point' };
const OVERLAY_MODES = ['off', 'rigid', 'mls'];

const DEFAULTS = {
    layer: 'pairs', z: 60, overlayLayer: 'overlay-ref', overlayZ: 5,
    host: null, lines: false, allowPoints: true, ppi: 500,
    hitRadius: 10, ringRadius: null, mode: 'pair',
    overlayOpacity: 0.6, flickerMs: 450, ghost: false,
    overlayStyle: 'ridges', overlayColor: '#ff3df5',
    rightPixels: null,
};

export class CorrespondenceEditor extends Emitter {
    /**
     * @param {import('./viewer.js').Viewer} left  - latente (probe)
     * @param {import('./viewer.js').Viewer} right - referência
     * @param {object} [opts] - left/right: FeatureEditor | Features | lista de minúcias;
     *        host: elemento que contém os dois viewers (linhas entre eles);
     *        rightPixels: () => ImageData da referência (sobreposição MLS).
     */
    constructor(left, right, opts = {}) {
        super();
        this.viewers = [left, right];
        this._o = { ...DEFAULTS, ...opts };
        this._src = [this._makeSource(opts.left), this._makeSource(opts.right)];
        this._pairs = [];
        this._selected = null;
        this._armed = null;            // {side, ep}
        this._history = new History();
        this._active = false;
        this._exportMode = false;
        this._destroyed = false;
        this._overlay = 'off';
        this._flicker = null;
        this._ghost = !!this._o.ghost;
        this._ghostPt = null;          // {side, x, y}
        this._pending = null;          // clique no vazio: arma um ponto no mouseup
        this._layers = this.viewers.map(v => v.layers.ensure(this._o.layer, { kind: 'svg', z: this._o.z }));
        this._g = this._layers.map(l => svgEl('g', { class: 'mntviz-ce' }, l.el));
        this._ovLayer = null;
        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        this.viewers.forEach((v, side) => {
            v.viewport.addEventListener('mousedown', (e) => this._down(side, e), { capture: true, ...sig });
            v.viewport.addEventListener('mouseup', (e) => this._up(side, e), { capture: true, ...sig });
        });
        this._offs = [
            ...this.viewers.map(v => onViewFrame(v, () => { this.render(); this._drawLines(); })),
            ...this.viewers.map((v, side) => v.on('pointer', (p) => this._pointer(side, p))),
        ];
        this._srcOff = [null, null];   // assinatura do 'change' do editor de cada lado
        this._src.forEach((_, side) => this._watchSource(side));
        this._linesSvg = null;
        if (this._o.host) {
            this._linesSvg = svgEl('svg', { class: 'mntviz-ce-lines' });
            this._o.host.appendChild(this._linesSvg);
            this._ro = new ResizeObserver(() => this._drawLines());
            this._ro.observe(this._o.host);
        }
        this.render();
    }

    /* ── consultas ──────────────────────────────────────────── */

    get pairs() { return this._pairs.map(p => this._publicPair(p)); }
    get selected() { return this._selected; }
    get armed() { return this._armed ? { side: this._armed.side, ...this._armed.ep } : null; }
    get overlay() { return this._overlay; }
    get canUndo() { return this._history.canUndo; }
    get canRedo() { return this._history.canRedo; }
    pair(n) { const p = this._pairs.find(q => q.n === n); return p ? this._publicPair(p) : null; }

    /** Próximo número livre (máximo + 1). */
    nextNumber() { return this._pairs.reduce((m, p) => Math.max(m, p.n), 0) + 1; }

    /* ── edição ─────────────────────────────────────────────── */

    /**
     * Cria um par. a/b: {kind: 'minutia'|'core'|'delta'|'point', ref?, index?, x?, y?}
     * (ref = id no FeatureEditor ou índice na lista fixa; index = índice entre as
     * minúcias do lado). Devolve n.
     */
    addPair(a, b, { type = 'definite', n = null } = {}) {
        const ea = this._endpoint(0, a), eb = this._endpoint(1, b);
        if (!ea || !eb) throw new Error('mntviz CorrespondenceEditor: ponta inválida');
        const before = this._snap();
        const num = n != null ? Number(n) : this.nextNumber();
        if (this._pairs.some(p => p.n === num)) throw new Error(`mntviz CorrespondenceEditor: par ${num} já existe`);
        this._pairs.push({ n: num, type: PAIR_TYPES.includes(type) ? type : 'definite', a: ea, b: eb });
        this._pairs.sort((p, q) => p.n - q.n);
        this._selected = num;
        this._commit('add', before, [num]);
        return num;
    }

    removePair(n) {
        const before = this._snap();
        const k = this._pairs.findIndex(p => p.n === n);
        if (k < 0) return false;
        this._pairs.splice(k, 1);
        if (this._selected === n) this._selected = null;
        this._commit('delete', before, [n]);
        return true;
    }

    setType(n, type) {
        const p = this._pairs.find(q => q.n === n);
        if (!p || !PAIR_TYPES.includes(type) || p.type === type) return false;
        const before = this._snap();
        p.type = type;
        this._commit('type', before, [n]);
        return true;
    }

    /**
     * Pares com uma ponta cuja feature foi apagada no editor de features: continuam na
     * lista (desfazer lá os cura), mas ficam fora do ajuste, da sobreposição e da exportação.
     */
    get missingPairs() { return this._pairs.filter(p => this._isMissing(p)).map(p => p.n); }

    /** Apaga os pares sem feature num passo só (desfazer os traz de volta). Devolve os números. */
    removeMissing() {
        const ns = this.missingPairs;
        if (!ns.length) return [];
        const before = this._snap();
        this._pairs = this._pairs.filter(p => !ns.includes(p.n));
        if (this._selected != null && ns.includes(this._selected)) this._selected = null;
        this._commit('delete', before, ns);
        return ns;
    }

    /** Renumera 1..N na ordem atual (um passo de desfazer). */
    renumber() {
        const before = this._snap();
        this._pairs.forEach((p, i) => { if (this._selected === p.n) this._selected = i + 1; p.n = i + 1; });
        this._commit('renumber', before, this._pairs.map(p => p.n));
    }

    clear() {
        if (!this._pairs.length) return;
        const before = this._snap();
        this._pairs = [];
        this._selected = null;
        this._commit('clear', before, []);
    }

    select(n) {
        this._selected = n != null && this._pairs.some(p => p.n === n) ? n : null;
        this.emit('select', { n: this._selected, pair: this._selected != null ? this.pair(this._selected) : null });
        this.render();
        this._drawLines();
    }

    disarm() { if (this._armed) { this._armed = null; this.render(); } }

    undo() {
        const cur = this._snap();
        const prev = this._history.undo(cur);
        if (!prev) return false;
        this._load(prev);
        this._changed('undo', []);
        return true;
    }

    redo() {
        const cur = this._snap();
        const next = this._history.redo(cur);
        if (!next) return false;
        this._load(next);
        this._changed('redo', []);
        return true;
    }

    /* ── modos e teclado ────────────────────────────────────── */

    setMode(mode) {
        this._active = mode === this._o.mode;
        if (!this._active) { this._armed = null; this._pending = null; }
        this.render();
    }

    handleKey(e, ctx = null) {
        const mode = ctx ? ctx.mode : (this._active ? this._o.mode : null);
        if (mode !== this._o.mode) return false;
        if (ctx && ctx.focus && !this.viewers.includes(ctx.focus)) return false;
        const k = e.key;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && (k === 'z' || k === 'Z')) { if (e.shiftKey) this.redo(); else this.undo(); return true; }
        if (ctrl && (k === 'y' || k === 'Y')) { this.redo(); return true; }
        if (ctrl || e.altKey) return false;
        if (k === 'Escape') {
            if (this._armed) { this.disarm(); return true; }
            if (this._selected != null) { this.select(null); return true; }
            return false;
        }
        if (/^[1-5]$/.test(k) && this._selected != null) { this.setType(this._selected, PAIR_TYPES[Number(k) - 1]); return true; }
        if ((k === 'Delete' || k === 'Backspace') && this._selected != null) { this.removePair(this._selected); return true; }
        if (k === 'g' || k === 'G') { this.setGhost(!this._ghost); return true; }
        if (k === 'o' || k === 'O') { this.cycleOverlay(); return true; }
        if (k === 't' || k === 'T') { this.setFlicker(!this._flicker); return true; }
        return false;
    }

    /* ── registro, fantasma e sobreposição ──────────────────── */

    /**
     * Pontos de controle {l: [x, y], r: [x, y], n} dos pares (opcional: só um tipo). Pares
     * com uma ponta cuja feature foi apagada (`missing`) ficam de fora, como da exportação.
     */
    controls({ types = null } = {}) {
        const out = [];
        for (const p of this._pairs) {
            if (types && !types.includes(p.type)) continue;
            const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
            if (a.missing || b.missing) continue;
            out.push({ n: p.n, l: [a.x, a.y], r: [b.x, b.y] });
        }
        return out;
    }

    /** Ajuste rígido referência → latente: {angle, tx, ty, n, rms} ou null. */
    rigid(opts = {}) { return estimateRigid(this.controls(opts)); }

    /** Warp MLS {rightToLeft(x, y), leftToRight(x, y)} ou null sem pares. */
    warp(opts = {}) {
        const c = this.controls(opts);
        return c.length ? buildWarp(c) : null;
    }

    /** Leva um ponto de um lado ao outro (MLS): side 0 → direita, 1 → esquerda. */
    mapPoint(side, x, y) {
        const w = this.warp();
        if (!w) return null;
        return side === 0 ? w.leftToRight(x, y) : w.rightToLeft(x, y);
    }

    setGhost(on) {
        this._ghost = !!on;
        if (!this._ghost) this._ghostPt = null;
        this.render();
        this.emit('ghost', { on: this._ghost });
        return this;
    }

    /** Sobreposição da referência sobre a latente: 'off' | 'rigid' | 'mls'. */
    setOverlay(mode, { opacity = null } = {}) {
        this._overlay = OVERLAY_MODES.includes(mode) ? mode : 'off';
        if (opacity != null) this._o.overlayOpacity = Number(opacity);
        if (this._overlay === 'off' && this._flicker) this.setFlicker(false);   // senão o tique religa a camada
        this._refreshOverlay();
        this.emit('overlay', { mode: this._overlay, opacity: this._o.overlayOpacity });
        return this;
    }

    cycleOverlay() {
        return this.setOverlay(OVERLAY_MODES[(OVERLAY_MODES.indexOf(this._overlay) + 1) % OVERLAY_MODES.length]);
    }

    /** Alternância (flicker) da sobreposição a cada `ms`. */
    setFlicker(on, { ms = null } = {}) {
        if (this._flicker) { clearInterval(this._flicker); this._flicker = null; }
        if (this._ovLayer) this._ovLayer.setVisible(this._overlay !== 'off');
        if (on) {
            if (this._overlay === 'off') this.setOverlay('rigid');
            const period = ms || this._o.flickerMs;
            this._flicker = setInterval(() => { if (this._ovLayer && this._overlay !== 'off') this._ovLayer.toggle(); }, period);
        }
        this.emit('flicker', { on: !!this._flicker });
        return this;
    }

    /* ── arquivos ───────────────────────────────────────────── */

    /** Estado (JSON) do editor. */
    toJSON() {
        return { version: 1, pairs: this.pairs, rigid: this.rigid(), overlay: this._overlay };
    }

    /**
     * Restaura um estado de toJSON(). O ref salvo é um id interno do editor de features,
     * que muda quando as features são recarregadas (setFeatures renumera), então cada ponta
     * só mantém o ref se a feature que ele aponta ainda está onde a ponta foi salva (até
     * `tol` px); senão volta pelo índice entre as minúcias e, por último, pela posição.
     * Ponta sem feature vira ponto livre (allowPoints); a que estava sem feature já ao
     * salvar (`missing`) descarta o par.
     */
    fromJSON(state, { tol = 2 } = {}) {
        const before = this._snap();
        this._pairs = [];
        for (const p of (state && state.pairs) || []) {
            const a = this._restore(0, p.a, tol), b = this._restore(1, p.b, tol);
            if (a && b) this._pairs.push({ n: Number(p.n), type: p.type || 'definite', a, b });
        }
        this._pairs.sort((p, q) => p.n - q.n);
        this._selected = null;
        this._commit('load', before, this._pairs.map(p => p.n));
        return this;
    }

    /**
     * Correspondence do contrato: pairs [{i_probe, j_ref, type, n, kind, probe_xy, ref_xy}]
     * (i/j = índice entre as minúcias de cada lado; -1 se a ponta não é minúcia) e
     * transform {angle, tx, ty} (rígido referência → latente).
     */
    toCorrespondence() {
        const t = this.rigid();
        return {
            pairs: this._livePairs().map(({ p, a, b }) => ({
                i_probe: this._minutiaIndex(0, a), j_ref: this._minutiaIndex(1, b), type: p.type, n: p.n,
                kind: _pairKind(a, b), probe_xy: [a.x, a.y], ref_xy: [b.x, b.y] })),
            transform: t ? { angle: t.angle, tx: t.tx, ty: t.ty } : null,
        };
    }

    /** Texto .match (dashboard), com linhas #PAIR N TYPE. */
    toMatchText({ q = 'probe', g = 'reference', label = 'manual' } = {}) {
        const live = this._livePairs();
        const rows = live.map(({ a, b }) => ({ score: 1, x1: a.x, y1: a.y, t1: a.theta ?? 0, q1: a.quality ?? 0,
            x2: b.x, y2: b.y, t2: b.theta ?? 0, q2: b.quality ?? 0 }));
        return formatMatchText({ q, g, label }, rows, live.map(({ p }) => ({ n: p.n, type: p.type })));
    }

    /** Texto #CORR v2 (GT do SD302), com linhas #PAIR N TYPE. */
    toCorrText(meta = {}) {
        const live = this._livePairs();
        const rows = live.map(({ a, b }) => {
            const kind = _pairKind(a, b);
            return { kind, idxA: kind === 'M' ? this._minutiaIndex(0, a) : -1, idxB: kind === 'M' ? this._minutiaIndex(1, b) : -1,
                xa: a.x, ya: a.y, xb: b.x, yb: b.y };
        });
        return formatCorrText(meta, rows, live.map(({ p }) => ({ n: p.n, type: p.type })));
    }

    /**
     * Carrega pares de um texto (.match, #CORR ou lista de índices; 'auto' detecta).
     * Pontas casam com as features do lado pelo índice (quando há) ou pela posição
     * (até `tol` px); sem feature, viram ponto livre (allowPoints) ou são descartadas.
     * Devolve {format, added, dropped, meta}.
     */
    loadText(text, { format = 'auto', tol = 2, append = false } = {}) {
        const fmt = format === 'auto' ? detectPairsFormat(text) : format;
        let parsed, specs = [];
        if (fmt === 'match') {
            parsed = parseMatchText(text);
            specs = parsed.rows.map(r => [{ x: r.x1, y: r.y1, theta: r.t1 }, { x: r.x2, y: r.y2, theta: r.t2 }]);
        } else if (fmt === 'corr') {
            parsed = parseCorrText(text);
            specs = parsed.rows.map(r => {
                const kind = LETTER_KIND[r.kind] || 'point';
                return [{ kind, index: kind === 'minutia' ? r.idxA : -1, x: r.xa, y: r.ya },
                    { kind, index: kind === 'minutia' ? r.idxB : -1, x: r.xb, y: r.yb }];
            });
        } else if (fmt === 'pairs') {
            parsed = parsePairsText(text);
            specs = parsed.rows.map(r => [{ kind: 'minutia', index: r.i }, { kind: 'minutia', index: r.j }]);
        } else {
            throw new Error('mntviz CorrespondenceEditor: formato de pares desconhecido');
        }
        const before = this._snap();
        if (!append) { this._pairs = []; this._selected = null; }
        let added = 0, dropped = 0;
        const meta = parsed.pairsMeta || [];
        specs.forEach(([sa, sb], i) => {
            const a = this._match(0, sa, tol), b = this._match(1, sb, tol);
            if (!a || !b) { dropped++; return; }
            const pm = meta[i] || {};
            let n = pm.n != null ? pm.n : this.nextNumber();
            if (this._pairs.some(p => p.n === n)) n = this.nextNumber();
            this._pairs.push({ n, type: PAIR_TYPES.includes(pm.type) ? pm.type : 'definite', a, b });
            added++;
        });
        this._pairs.sort((p, q) => p.n - q.n);
        this._commit('load', before, this._pairs.map(p => p.n));
        return { format: fmt, added, dropped, meta: parsed.meta || {} };
    }

    beginExport() { this._exportMode = true; this.render(); }
    endExport() { this._exportMode = false; this.render(); }

    destroy() {
        this._destroyed = true;   // um quadro já agendado não pode reanexar o grupo
        this.setFlicker(false);
        this._ac.abort();
        for (const off of this._offs) off();
        for (const off of this._srcOff) if (off) off();
        if (this._ro) this._ro.disconnect();
        if (this._linesSvg) this._linesSvg.remove();
        this._g.forEach(g => g.remove());
        if (this._ovLayer) this._ovLayer.remove();
        this.removeAllListeners();
    }

    /* ── desenho ────────────────────────────────────────────── */

    render() {
        if (this._destroyed) return;
        [0, 1].forEach(side => {
            const g = this._g[side];
            if (!g.isConnected) this._layers[side].el.appendChild(g);
            g.replaceChildren();
            const v = this.viewers[side];
            const s = this._exportMode ? 1 : viewScale(v);
            const R = this._ring();
            for (const p of this._pairs) {
                const ep = this._resolve(side, side === 0 ? p.a : p.b);
                const gone = this._isMissing(p);   // uma das pontas perdeu a feature: par esmaecido, fora do ajuste
                const color = gone ? '#64748b' : (PAIR_COLORS[p.type] || PAIR_COLORS.definite);
                const sel = !this._exportMode && p.n === this._selected;
                const pg = svgEl('g', { class: `mntviz-ce-pair${sel ? ' mntviz-ce-selected' : ''}${gone ? ' mntviz-ce-missing' : ''}`,
                    'data-n': p.n, 'data-type': p.type, opacity: gone ? 0.6 : null }, g);
                if (sel) {
                    svgEl('circle', { cx: ep.x, cy: ep.y, r: R + 2 / s, fill: 'none', stroke: '#fff', 'stroke-width': 4.5,
                        'stroke-opacity': 0.9, 'vector-effect': 'non-scaling-stroke' }, pg);
                }
                svgEl('circle', { cx: ep.x, cy: ep.y, r: R, fill: 'none', stroke: color, 'stroke-width': 2,
                    'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': p.type === 'definite' && !gone ? null : '4 2' }, pg);
                const lg = svgEl('g', { class: 'mntviz-ce-label', 'data-n': p.n,
                    transform: uprightTransform(v, ep.x, ep.y, { exportMode: this._exportMode }) }, pg);
                const t = svgEl('text', { x: this._exportMode ? R + 2 : R * s + 3, y: this._exportMode ? -R - 2 : -R * s - 3,
                    'font-size': 13, 'font-weight': 700, 'font-family': 'sans-serif', fill: color,
                    stroke: '#000', 'stroke-width': 3, 'stroke-opacity': 0.8, 'paint-order': 'stroke' }, lg);
                t.textContent = gone ? `${p.n}?` : String(p.n);
            }
            if (this._armed && this._armed.side === side && !this._exportMode) {
                const a = this._resolve(side, this._armed.ep);
                svgEl('circle', { cx: a.x, cy: a.y, r: R * 1.25, fill: 'none', stroke: '#fde047', 'stroke-width': 2,
                    'stroke-dasharray': '3 2', 'vector-effect': 'non-scaling-stroke', class: 'mntviz-ce-armed' }, g);
            }
            if (this._ghost && this._ghostPt && this._ghostPt.side === side && !this._exportMode) {
                const { x, y } = this._ghostPt;
                const d = 9 / s;
                const gg = svgEl('g', { class: 'mntviz-ce-ghost', stroke: '#fde047', 'stroke-width': 1.5,
                    'vector-effect': 'non-scaling-stroke' }, g);
                svgEl('line', { x1: x - d, y1: y, x2: x + d, y2: y, 'vector-effect': 'non-scaling-stroke' }, gg);
                svgEl('line', { x1: x, y1: y - d, x2: x, y2: y + d, 'vector-effect': 'non-scaling-stroke' }, gg);
                svgEl('circle', { cx: x, cy: y, r: d * 0.6, fill: 'none', 'vector-effect': 'non-scaling-stroke' }, gg);
            }
        });
    }

    _ring() {
        return this._o.ringRadius != null ? this._o.ringRadius : 9 * this._o.ppi / 500;
    }

    _drawLines() {
        const svg = this._linesSvg;
        if (!svg || this._destroyed) return;
        svg.replaceChildren();
        if (!this._o.lines) return;
        const host = this._o.host.getBoundingClientRect();
        const [ml, mr] = this.viewers.map(v => screenMapper(v));
        const [rl, rr] = this.viewers.map(v => v.viewport.getBoundingClientRect());
        const inside = (p, r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
        for (const p of this._pairs) {
            const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
            if (a.missing || b.missing) continue;
            const pa = ml(a.x, a.y), pb = mr(b.x, b.y);
            if (!inside(pa, rl) || !inside(pb, rr)) continue;
            svgEl('line', { x1: pa.x - host.left, y1: pa.y - host.top, x2: pb.x - host.left, y2: pb.y - host.top,
                stroke: PAIR_COLORS[p.type], 'stroke-width': p.n === this._selected ? 2.2 : 1.2,
                'stroke-opacity': 0.75, 'data-n': p.n }, svg);
        }
    }

    /** Liga ou desliga as linhas entre os lados (precisa de `host`). */
    setLines(on) { this._o.lines = !!on; this._drawLines(); return this; }

    _refreshOverlay() {
        if (this._destroyed) return;
        if (this._overlay === 'off') {
            if (this._ovLayer) this._ovLayer.hide();
            return;
        }
        const [lv, rv] = this.viewers;
        if (!this._ovLayer) {
            this._ovLayer = lv.layers.ensure(this._o.overlayLayer, { kind: 'canvas', z: this._o.overlayZ });
        }
        const layer = this._ovLayer;
        layer.setOpacity(this._o.overlayOpacity);
        const c = layer.el;
        const { width: W, height: H } = lv.imageSize;
        if (!W || !H) return;
        if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const ctrl = this.controls();
        if (!ctrl.length) { layer.hide(); return; }
        const src = this._rightPixels();
        if (!src) { layer.hide(); return; }
        if (this._overlay === 'rigid') {
            const off = document.createElement('canvas');
            off.width = src.width; off.height = src.height;
            off.getContext('2d').putImageData(src, 0, 0);
            ctx.setTransform(...rigidCanvasMatrix(estimateRigid(ctrl)));
            ctx.drawImage(off, 0, 0);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            const dst = ctx.createImageData(W, H);
            const w = buildWarp(ctrl);
            warpImage(src, dst, (x, y) => w.leftToRight(x, y));
            ctx.putImageData(dst, 0, 0);
        }
        if (this._o.overlayStyle === 'ridges') _ridgeTint(ctx, W, H, this._o.overlayColor);
        if (!this._flicker) layer.show();
    }

    /** Estilo da sobreposição: 'ridges' (cristas da referência coloridas, fundo transparente) ou 'gray'. */
    setOverlayStyle(style, color = null) {
        this._o.overlayStyle = style === 'gray' ? 'gray' : 'ridges';
        if (color) this._o.overlayColor = color;
        this._refreshOverlay();
        return this;
    }

    _rightPixels() {
        if (typeof this._o.rightPixels === 'function') {
            const px = this._o.rightPixels();
            if (px) return px;
        }
        const img = this.viewers[1].imageElement;
        if (!img.naturalWidth) return null;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
    }

    /* ── mouse ──────────────────────────────────────────────── */

    _down(side, e) {
        this._pending = null;
        if (!this._active || e.button !== 0) return;
        const hit = this._hitFeature(side, e);
        const hp = this._hitPairPoint(side, e);
        if (!hit && !hp) {
            if (!this._o.allowPoints) return;
            const p = this.viewers[side].screenToImageCoords(e.clientX, e.clientY);
            if (insideImage(this.viewers[side], p.x, p.y)) this._pending = { side, x: e.clientX, y: e.clientY, p };
            return;   // deixa o pan acontecer; um clique sem arrastar arma o ponto no mouseup
        }
        stopEvent(e);
        const ep = hit ? hit.ep : hp.ep;
        const used = hit ? this._pairUsing(side, ep) : hp.pair;
        this._pick(side, ep, used);
    }

    _up(side, e) {
        const pend = this._pending;
        this._pending = null;
        if (!pend || pend.side !== side || !this._active) return;
        if (Math.abs(e.clientX - pend.x) > 3 || Math.abs(e.clientY - pend.y) > 3) return;
        const p = pend.p;
        this._pick(side, { kind: 'point', ref: null, x: Math.round(p.x), y: Math.round(p.y) }, null);
    }

    _pick(side, ep, used) {
        const armed = this._armed;
        if (used) {
            if (armed && armed.side !== side) {
                this.emit('hint', { text: `essa feature já está no par ${used.n}`, n: used.n });
                return;
            }
            this._armed = null;
            this.select(used.n);
            return;
        }
        if (!armed || armed.side === side) {
            this._armed = { side, ep };
            this.emit('armed', { side, ...ep });
            this.render();
            return;
        }
        const a = side === 0 ? ep : armed.ep;
        const b = side === 0 ? armed.ep : ep;
        this._armed = null;
        this.addPair(a, b);
    }

    _pointer(side, p) {
        if (!this._ghost) return;
        if (p.type === 'leave') { this._ghostPt = null; this.render(); return; }
        if (p.type !== 'move') return;
        const q = this.mapPoint(side, p.x, p.y);
        this._ghostPt = q ? { side: 1 - side, x: q.x, y: q.y } : null;
        this.render();
    }

    _hitFeature(side, e) {
        const map = screenMapper(this.viewers[side]);
        let best = null;
        for (const it of this._src[side].items()) {
            const c = map(it.x, it.y);
            const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
            if (d <= this._o.hitRadius && (!best || d < best.d)) best = { d, it };
        }
        if (!best) return null;
        const it = best.it;
        return { d: best.d, ep: { kind: it.kind, ref: it.id, x: it.x, y: it.y } };
    }

    _hitPairPoint(side, e) {
        const map = screenMapper(this.viewers[side]);
        let best = null;
        for (const p of this._pairs) {
            const ep = side === 0 ? p.a : p.b;
            if (ep.ref != null) continue;
            const c = map(ep.x, ep.y);
            const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
            if (d <= this._o.hitRadius && (!best || d < best.d)) best = { d, pair: p, ep: { ...ep } };
        }
        return best;
    }

    _pairUsing(side, ep) {
        if (ep.ref == null) return null;
        // só o ref: o tipo da feature muda no editor (núcleo ↔ delta) e a feature segue a mesma
        return this._pairs.find(p => (side === 0 ? p.a : p.b).ref === ep.ref) || null;
    }

    /* ── fontes de features ─────────────────────────────────── */

    _makeSource(spec) {
        if (spec && typeof spec.toFeatures === 'function' && typeof spec.get === 'function') {
            const ed = spec;
            return {
                editor: ed,
                items: () => ed.items,
                get: (id) => ed.get(id),
                minutiae: () => ed.items.filter(i => i.kind === 'minutia'),
            };
        }
        const f = Array.isArray(spec) ? { minutiae: spec } : (spec || {});
        const items = [];
        const add = (kind, m) => {
            const theta = m.theta_deg_iso ?? m.theta ?? m.angle;
            items.push({ id: items.length, kind, x: Number(m.x), y: Number(m.y),
                theta: theta != null ? Number(theta) : undefined,
                quality: m.quality != null ? Number(m.quality) : undefined });
        };
        for (const m of f.minutiae || []) add('minutia', m);
        for (const c of f.cores || []) add('core', c);
        for (const d of f.deltas || []) add('delta', d);
        return {
            editor: null,
            items: () => items.map(i => ({ ...i })),
            get: (id) => (items[id] ? { ...items[id] } : null),
            minutiae: () => items.filter(i => i.kind === 'minutia'),
        };
    }

    /** Troca as features de um lado (0 latente, 1 referência). */
    setSource(side, spec) {
        this._src[side] = this._makeSource(spec);
        this._watchSource(side);
        this.render();
        this._drawLines();
        this._refreshOverlay();
    }

    /** (Re)assina o 'change' do FeatureEditor do lado (um só por lado). */
    _watchSource(side) {
        if (this._srcOff[side]) { this._srcOff[side](); this._srcOff[side] = null; }
        const ed = this._src[side].editor;
        if (ed) this._srcOff[side] = ed.on('change', () => { this.render(); this._drawLines(); this._refreshOverlay(); });
    }

    /** Normaliza uma ponta dada pelo usuário. */
    _endpoint(side, spec) {
        if (!spec) return null;
        const kind = LETTER_KIND[spec.kind] || spec.kind || 'minutia';
        const src = this._src[side];
        let ref = spec.ref ?? null;
        if (ref == null && spec.index != null && spec.index >= 0 && kind === 'minutia') {
            const m = src.minutiae()[spec.index];
            if (m) ref = m.id;
        }
        if (ref != null) {
            const it = src.get(ref);
            if (!it) return null;
            return { kind: it.kind, ref, x: it.x, y: it.y };
        }
        if (spec.x == null || spec.y == null) return null;
        return { kind: kind === 'minutia' ? 'point' : kind, ref: null, x: Number(spec.x), y: Number(spec.y) };
    }

    /** Ponta de um estado salvo (toJSON): ver fromJSON. */
    _restore(side, spec, tol) {
        if (!spec) return null;
        const kind = LETTER_KIND[spec.kind] || spec.kind || 'minutia';
        const hasXY = _finite(spec.x) && _finite(spec.y);
        const x = hasXY ? Number(spec.x) : null, y = hasXY ? Number(spec.y) : null;
        if (spec.ref != null) {
            const it = this._src[side].get(spec.ref);
            if (it && (!hasXY || Math.hypot(it.x - x, it.y - y) <= tol)) return { kind: it.kind, ref: spec.ref, x: it.x, y: it.y };
        } else if (kind === 'point') {
            return hasXY ? { kind: 'point', ref: null, x, y } : null;
        }
        const index = spec.index != null && spec.index >= 0 ? spec.index : null;
        return this._match(side, { kind, index, x, y, theta: spec.theta }, tol, { points: !spec.missing });
    }

    /** Casa uma ponta lida de arquivo com as features do lado. */
    _match(side, spec, tol, { points = true } = {}) {
        const src = this._src[side];
        const kind = spec.kind || 'minutia';
        const hasXY = _finite(spec.x) && _finite(spec.y);
        if (kind === 'minutia' && spec.index != null && spec.index >= 0) {
            const m = src.minutiae()[spec.index];
            if (m && (!hasXY || Math.hypot(m.x - spec.x, m.y - spec.y) <= tol)) {
                return { kind: 'minutia', ref: m.id, x: m.x, y: m.y };
            }
        }
        if (!hasXY) return null;
        let best = null;
        for (const it of src.items()) {
            if (kind !== 'point' && it.kind !== kind) continue;
            const d = Math.hypot(it.x - spec.x, it.y - spec.y);
            if (!(d <= tol)) continue;
            const dt = spec.theta != null && it.theta != null ? Math.abs(((it.theta - spec.theta) % 360 + 540) % 360 - 180) : 0;
            const score = d + dt / 360;
            if (!best || score < best.score) best = { score, it };
        }
        if (best) return { kind: best.it.kind, ref: best.it.id, x: best.it.x, y: best.it.y };
        if (!points || !this._o.allowPoints) return null;
        return { kind: kind === 'minutia' ? 'point' : kind, ref: null, x: Number(spec.x), y: Number(spec.y) };
    }

    /**
     * Ponta com os dados atuais da feature (movida, ou com outro tipo, no editor). Sem a
     * feature (apagada), devolve a última posição conhecida com `missing: true`.
     */
    _resolve(side, ep) {
        if (ep.ref == null) return { ...ep };
        const it = this._src[side].get(ep.ref);
        if (!it) return { ...ep, missing: true };
        ep.x = it.x; ep.y = it.y; ep.kind = it.kind;
        return { ...ep, x: it.x, y: it.y, kind: it.kind, theta: it.theta, quality: it.quality, type: it.type };
    }

    _isMissing(p) { return !!(this._resolve(0, p.a).missing || this._resolve(1, p.b).missing); }

    /** Pares com as duas pontas resolvidas: [{p, a, b}] (o que entra no ajuste e na exportação). */
    _livePairs() {
        const out = [];
        for (const p of this._pairs) {
            const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
            if (!a.missing && !b.missing) out.push({ p, a, b });
        }
        return out;
    }

    _minutiaIndex(side, ep) {
        if (ep.ref == null || ep.kind !== 'minutia') return -1;
        return this._src[side].minutiae().findIndex(m => m.id === ep.ref);
    }

    _publicPair(p) {
        const a = this._resolve(0, p.a), b = this._resolve(1, p.b);
        return { n: p.n, type: p.type, kind: _pairKind(a, b), missing: !!(a.missing || b.missing),
            a: { ...a, index: this._minutiaIndex(0, a) }, b: { ...b, index: this._minutiaIndex(1, b) } };
    }

    _snap() { return { pairs: clone(this._pairs), selected: this._selected }; }

    _load(s) {
        this._pairs = clone(s.pairs);
        this._selected = s.selected != null && this._pairs.some(p => p.n === s.selected) ? s.selected : null;
        this._armed = null;
    }

    _commit(type, before, ns) {
        this._history.push(before);
        this._changed(type, ns);
    }

    _changed(type, ns) {
        this.render();
        this._drawLines();
        this._refreshOverlay();
        const payload = { source: 'correspondence-editor', type, n: ns, pairs: this.pairs };
        this.emit('change', payload);
        for (const v of this.viewers) if (typeof v._emit === 'function') v._emit('change', payload);
    }
}

/** Cristas escuras viram a cor dada, com alfa = escuridão; o fundo claro fica transparente. */
function _ridgeTint(ctx, W, H, color) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const c = parseInt(String(color).replace('#', ''), 16);
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
        d[i + 3] = Math.round((255 - v) * d[i + 3] / 255);
    }
    ctx.putImageData(img, 0, 0);
}

function _finite(v) { return v != null && v !== '' && Number.isFinite(Number(v)); }

function _pairKind(a, b) {
    if (a.kind === b.kind && (a.kind === 'minutia' || a.kind === 'core' || a.kind === 'delta')) return KIND_LETTER[a.kind];
    return 'P';
}

/* ── formatos de arquivo ─────────────────────────────────────── */

const _i = (v) => String(Math.round(Number(v)));

/** Detecta o formato: 'match' | 'corr' | 'pairs' | null. */
export function detectPairsFormat(text) {
    if (/^#MATCH\b/m.test(text) || /^#MMIN\b/m.test(text)) return 'match';
    if (/^#CORR\b/m.test(text)) return 'corr';
    const rows = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (rows.length && rows.every(l => /^-?\d+\s+-?\d+$/.test(l))) return 'pairs';
    return null;
}

function _pairLines(text) {
    const out = [];
    for (const line of text.split('\n')) {
        const m = line.trim().match(/^#PAIR\s+(\d+)\s+(\w+)/);
        if (m) out.push({ n: Number(m[1]), type: m[2] });
    }
    return out;
}

/** .match → {q, g, label, score, rows: [{score, x1, y1, t1, q1, x2, y2, t2, q2}], pairsMeta}. */
export function parseMatchText(text) {
    let q = null, g = null, label = null, score = null;
    const rows = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#MATCH Q')) { q = line.split(/\s+/).slice(2).join(' '); continue; }
        if (line.startsWith('#MATCH G')) { g = line.split(/\s+/).slice(2).join(' '); continue; }
        if (line.startsWith('#MATCH LABEL')) { label = line.split(/\s+/).slice(2).join(' '); continue; }
        if (line.startsWith('#MATCH SCORE')) { score = Number(line.split(/\s+/)[2]); continue; }
        if (line.startsWith('#')) continue;
        const f = line.split(/\s+/);
        if (f.length < 9) continue;
        rows.push({ score: +f[0], x1: +f[1], y1: +f[2], t1: +f[3], q1: +f[4], x2: +f[5], y2: +f[6], t2: +f[7], q2: +f[8] });
    }
    return { q, g, label, score, rows, meta: { q, g, label, score }, pairsMeta: _pairLines(text) };
}

/** Escreve um .match canônico (coordenadas, ângulos e qualidades inteiros). */
export function formatMatchText({ q = 'probe', g = 'reference', label = 'manual', score = 0 } = {}, rows = [], pairsMeta = []) {
    const lines = [
        `#MATCH SCORE ${Number(score).toFixed(6)}`,
        `#MATCH LABEL ${label}`,
        `#MATCH Q ${q}`,
        `#MATCH G ${g}`,
        '#MMIN SCORE X1 Y1 THETA1 Q1 X2 Y2 THETA2 Q2',
    ];
    for (const r of rows) {
        lines.push(`${Number(r.score ?? 1).toFixed(6)} ${_i(r.x1)} ${_i(r.y1)} ${_i(r.t1 ?? 0)} ${_i(r.q1 ?? 0)}`
            + ` ${_i(r.x2)} ${_i(r.y2)} ${_i(r.t2 ?? 0)} ${_i(r.q2 ?? 0)}`);
    }
    if (pairsMeta.length) lines.push('#PAIR N TYPE', ...pairsMeta.map(p => `#PAIR ${p.n} ${p.type}`));
    return lines.join('\n') + '\n';
}

/** #CORR v2 → {meta: {A, B, impression, decision, rotation, source, ...}, rows: [{kind, idxA, idxB, xa, ya, xb, yb}], pairsMeta}. */
export function parseCorrText(text) {
    const meta = {};
    const rows = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            const m = line.match(/^#\s*([A-Za-z_]+)\s*=\s*(.*)$/);
            if (m) meta[m[1]] = m[2].trim();
            continue;
        }
        const f = line.split(/\s+/);
        if (f.length < 7) continue;
        rows.push({ kind: f[0], idxA: +f[1], idxB: +f[2], xa: +f[3], ya: +f[4], xb: +f[5], yb: +f[6] });
    }
    return { meta, rows, pairsMeta: _pairLines(text) };
}

/** Escreve #CORR v2: cabeçalho "# chave = valor", "#CORR KIND ..." e as linhas. */
export function formatCorrText(meta = {}, rows = [], pairsMeta = []) {
    const keys = ['A', 'B', 'impression', 'decision', 'rotation', 'source'];
    const lines = [];
    for (const k of keys) if (meta[k] != null) lines.push(`# ${k} = ${meta[k]}`);
    for (const [k, v] of Object.entries(meta)) if (!keys.includes(k) && v != null) lines.push(`# ${k} = ${v}`);
    lines.push('#CORR KIND IDX_A IDX_B XA YA XB YB');
    for (const r of rows) lines.push(`${r.kind} ${r.idxA} ${r.idxB} ${_i(r.xa)} ${_i(r.ya)} ${_i(r.xb)} ${_i(r.yb)}`);
    if (pairsMeta.length) lines.push('#PAIR N TYPE', ...pairsMeta.map(p => `#PAIR ${p.n} ${p.type}`));
    return lines.join('\n') + '\n';
}

/** Lista de índices (exemplo do mntviz): "# chave: valor" e linhas "i j". */
export function parsePairsText(text) {
    const meta = {};
    const rows = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
            const m = line.match(/^#\s*([A-Za-z_]+)\s*:\s*(.*)$/);
            if (m) meta[m[1]] = m[2].trim();
            continue;
        }
        const f = line.split(/\s+/);
        if (f.length >= 2) rows.push({ i: +f[0], j: +f[1] });
    }
    return { meta, rows, pairsMeta: _pairLines(text) };
}
