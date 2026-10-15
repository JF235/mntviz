/**
 * mntviz/feature-editor.js — Editor de features (EFS) sobre um Viewer.
 *
 * Minúcias (terminação, bifurcação, desconhecida), núcleos e deltas, ROI (polígono),
 * raio de incerteza, cor GYRO e uma camada separada de sugestões do algoritmo
 * (tracejadas) que só viram sólidas quando aceitas. Tudo em coordenadas da imagem e
 * ângulo ISO (graus, anti-horário, 0° = +x, 90° = topo): rotação e espelho da vista
 * não mudam o que é gravado. Desfazer e refazer por instantâneos.
 *
 * Modos (de tecla única, pelo ToolModes; ou editor.setMode):
 *   view    clique seleciona (Shift alterna), arrastar o centro move, arrastar a ponta
 *           gira θ, Alt+arrastar o centro dá o raio de incerteza; o vazio faz pan
 *   minutia clique cria (arrastar dá θ); M de novo alterna o tipo (terminação ↔ bifurcação)
 *   core    clique cria um núcleo (arrastar dá θ)
 *   delta   clique cria um delta (arrastar dá θ)
 *   roi     cliques põem vértices; Enter ou clique no 1º vértice fecha; Backspace tira o
 *           último; arrastar um vértice o move; Del apaga a ROI
 * Teclas: Del apaga a seleção; 1/2/3 = confiança G/Y/R (seleção e próximas marcas);
 * T alterna o tipo da seleção; A aceita a sugestão em foco, Shift+A todas, X rejeita;
 * Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) desfazem e refazem; Esc cancela ou limpa a seleção.
 * O botão do meio e a roda continuam fazendo pan e zoom em qualquer modo.
 *
 * Saída (EFS-JSON v0: nomes do FRIF EFS, ângulo ISO, coordenadas da imagem): toFeatures() → Features
 * {ppi, minutiae[{x, y, theta_deg_iso, type, quality?, coord_unc?, theta_unc?,
 * confidence?, phase?}], cores[], deltas[], roi?, frgp, pattern?, value?, absent[],
 * conventions}. serialize()/restore() guardam o estado completo do editor (ids,
 * origem das sugestões aceitas, estado das sugestões).
 *
 * Eventos: 'change' {source: 'feature-editor', layer, type, ids, diff: {added, removed,
 * changed}, features} (também no viewer.on('change')); 'select' {ids, items};
 * 'focus' {sid, suggestion}; 'tool' {newType, defaultConfidence}.
 *
 * Uso:
 *   const ed = new FeatureEditor(viewer, { ppi: 500, layer: 'analise',
 *       color: (f) => GYRO[f.confidence] });             // a regra de cor é do host
 *   ed.setSuggestions(sugestoes, { source: { kind: 'algo', id: 'extrator-x' } });
 *   modes.add(ed); modes.setMode('minutia');
 *   ed.on('change', (d) => salvarRascunho(ed.toFeatures()));
 */

import { Emitter } from './events.js';
import { createMarkerShape } from './minutiae-renderer.js';
import {
    GYRO, GYRO_KEYS, History, svgEl, norm360, isoAngle, tipPoint, viewScale, uprightTransform,
    screenMapper, insideImage, clone, onViewFrame, stopEvent,
} from './tools.js';

export const MINUTIA_TYPES = ['ending', 'bifurcation', 'unknown'];
const EDIT_MODES = new Set(['view', 'minutia', 'core', 'delta', 'roi']);
const CREATE_MODES = new Set(['minutia', 'core', 'delta']);
const SHAPE_OF_TYPE = { ending: 'circle', bifurcation: 'square', unknown: 'diamond' };
const TYPE_ALIASES = {
    1: 'ending', 2: 'bifurcation', 0: 'unknown', ending: 'ending', bifurcation: 'bifurcation', unknown: 'unknown',
    ridgeending: 'ending', ridgebifurcation: 'bifurcation', end: 'ending', bif: 'bifurcation', other: 'unknown',
};

const DEFAULTS = {
    layer: 'features', z: 25, suggestionLayer: 'suggestions', suggestionZ: 24,
    ppi: 500, markerRadius: null, segmentLength: null,
    color: null, suggestionColor: '#38bdf8', roiColor: '#a78bfa', selectColor: '#ffffff',
    round: true, angleStep: 1,
    defaultConfidence: 'G', phase: 'analysis', newType: 'ending',
    readOnly: false, showConfidence: false,
    hitRadius: 9, tipRadius: 8, dragThreshold: 4,
    selection: true, source: null,
};

export class FeatureEditor extends Emitter {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     * @param {object} [opts] - Ver DEFAULTS. `features` e `suggestions` iniciais;
     *        `color(item)` dá a cor de uma feature aceita (padrão: GYRO pela confiança).
     */
    constructor(viewer, opts = {}) {
        super();
        this.viewer = viewer;
        this._o = { ...DEFAULTS, ...opts };
        this._mode = 'view';
        this._items = [];
        this._roi = null;
        this._meta = { frgp: 0, absent: [] };
        this._sug = [];
        this._sugSource = null;
        this._focusSid = null;
        this._selected = new Set();
        this._nextId = 1;
        this._history = new History();
        this._drag = null;
        this._roiDraft = null;
        this._roiCursor = null;
        this._exportMode = false;
        this._newType = this._o.newType;
        this._defaultConfidence = this._o.defaultConfidence;
        this._phase = this._o.phase;
        this._readOnly = !!this._o.readOnly;
        this._raf = 0;
        this._syncing = false;
        this._destroyed = false;
        this._sugGen = 0;          // troca a cada setSuggestions: o desfazer não aplica estados de outra lista

        this._layer = viewer.layers.ensure(this._o.layer, { kind: 'svg', z: this._o.z });
        this._sugLayer = viewer.layers.ensure(this._o.suggestionLayer, { kind: 'svg', z: this._o.suggestionZ });
        this._g = svgEl('g', { class: 'mntviz-fe' });
        this._sg = svgEl('g', { class: 'mntviz-fe mntviz-fe-suggestions' });
        this._layer.el.appendChild(this._g);
        this._sugLayer.el.appendChild(this._sg);

        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        const vp = viewer.viewport;
        vp.addEventListener('mousedown', (e) => this._down(e), { capture: true, ...sig });
        window.addEventListener('mousemove', (e) => this._move(e), { capture: true, ...sig });
        window.addEventListener('mouseup', (e) => this._up(e), { capture: true, ...sig });
        vp.addEventListener('dblclick', (e) => this._dbl(e), { capture: true, ...sig });
        this._offView = onViewFrame(viewer, () => this.render());
        this._offSel = viewer.selection && this._o.selection
            ? viewer.selection.on('change', (ev) => this._fromSharedSelection(ev)) : () => {};

        if (opts.features) this.setFeatures(opts.features, { silent: true });
        if (opts.suggestions) this.setSuggestions(opts.suggestions, { source: opts.suggestionSource || null });
        this.render();
    }

    /* ── estado e consultas ─────────────────────────────────── */

    get mode() { return this._mode; }
    get layerName() { return this._o.layer; }
    get ppi() { return this._o.ppi; }
    get readOnly() { return this._readOnly; }
    get canUndo() { return !this._readOnly && this._history.canUndo; }
    get canRedo() { return !this._readOnly && this._history.canRedo; }
    get newType() { return this._newType; }
    get defaultConfidence() { return this._defaultConfidence; }
    get phase() { return this._phase; }
    get roi() { return this._roi ? this._roi.map(p => [p[0], p[1]]) : null; }
    get selected() { return [...this._selected]; }
    get selectedItems() { return this.selected.map(id => this.get(id)).filter(Boolean); }
    get focusedSuggestion() { const s = this._sugById(this._focusSid); return s ? { ...s } : null; }

    /** Todas as features (cópias): [{id, kind, x, y, theta, type, ...}]. */
    get items() { return this._items.map(it => ({ ...it })); }

    /** Uma feature pelo id (cópia) ou null. */
    get(id) {
        const it = this._items.find(i => i.id === id);
        return it ? { ...it } : null;
    }

    /** Sugestões com o estado de cada uma ('open' | 'accepted' | 'rejected'). */
    get suggestions() { return this._sug.map(s => ({ ...s })); }

    setPpi(ppi) { this._o.ppi = Number(ppi); this.render(); return this; }
    setReadOnly(on) { this._readOnly = !!on; this._drag = null; this._roiDraft = null; this.render(); return this; }

    /** Fase gravada nas marcas novas; em 'comparison' as novas nascem laranja (O). */
    setPhase(phase) { this._phase = String(phase); this._emitTool(); return this; }

    /** Confiança padrão das próximas marcas (G/Y/R/O). */
    setDefaultConfidence(c) { this._defaultConfidence = c; this._emitTool(); return this; }

    /** Campos de análise do vestígio: {frgp, pattern, value, absent}. */
    setMeta(meta = {}) {
        const before = this._snap();
        this._meta = { ...this._meta, ...clone(meta) };
        this._commit('meta', before, []);
        return this;
    }
    get meta() { return clone(this._meta); }

    /* ── modos e teclado ────────────────────────────────────── */

    /** Troca o modo (chamado pelo ToolModes; prev === mode = tecla repetida). */
    setMode(mode, prev = undefined) {
        const was = this._mode;
        this._mode = String(mode);
        if (this._mode === 'minutia' && was === 'minutia' && prev === 'minutia') {
            this._newType = this._newType === 'ending' ? 'bifurcation' : 'ending';
            const mins = this.selectedItems.filter(i => i.kind === 'minutia').map(i => i.id);
            if (mins.length && !this._readOnly) this.setType(mins, this._newType);
            this._emitTool();
        }
        if (this._mode !== 'roi' && this._roiDraft) { this._roiDraft = null; }
        if (!EDIT_MODES.has(this._mode) && this._drag) this._up();   // confirma o que o arrasto já mudou (passo de desfazer + 'change')
        this.render();
    }

    /** Trata uma tecla; devolve true se consumiu. */
    handleKey(e, ctx = null) {
        const mode = ctx ? ctx.mode : this._mode;
        if (!EDIT_MODES.has(mode)) return false;
        if (ctx && ctx.focus && ctx.focus !== this.viewer) return false;
        const k = e.key;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && (k === 'z' || k === 'Z')) { if (e.shiftKey) this.redo(); else this.undo(); return true; }
        if (ctrl && (k === 'y' || k === 'Y')) { this.redo(); return true; }
        if (ctrl || e.altKey) return false;
        if (k === 'Escape') {
            if (this._drag) { this._cancelDrag(); return true; }
            if (this._roiDraft) { this._roiDraft = null; this.render(); return true; }
            if (this._selected.size) { this._setSelected([]); return true; }
            return false;
        }
        if (mode === 'roi') {
            if (k === 'Enter' && this._roiDraft) { this._closeRoi(); return true; }
            if (k === 'Backspace' && this._roiDraft) {
                this._roiDraft.pop();
                if (!this._roiDraft.length) this._roiDraft = null;
                this.render();
                return true;
            }
            if ((k === 'Delete' || k === 'Backspace') && this._roi && !this._readOnly) { this.setRoi(null); return true; }
        }
        if (k === 'Delete' || k === 'Backspace') {
            if (!this._selected.size || this._readOnly) return false;
            this.remove(this.selected);
            return true;
        }
        if (GYRO_KEYS[k]) {
            this._defaultConfidence = GYRO_KEYS[k];
            if (this._selected.size && !this._readOnly) this.setConfidence(this.selected, GYRO_KEYS[k]);
            this._emitTool();
            return true;
        }
        if (k === 't' || k === 'T') {
            if (!this._selected.size || this._readOnly) return false;
            this.cycleType(this.selected);
            return true;
        }
        if (k === 'a') return this.accept('focused').length > 0;
        if (k === 'A') return this.accept('all').length > 0;
        if (k === 'x' || k === 'X') return this.reject('focused').length > 0;
        return false;
    }

    /* ── edição programática (cada chamada é um passo de desfazer) ─ */

    /** Cria uma feature. kind: 'minutia' | 'core' | 'delta'. Devolve o id. */
    add(kind, props = {}) {
        const before = this._snap();
        const it = this._newItem(kind, props.x, props.y, props);
        this._items.push(it);
        this._commit('add', before, [it.id]);
        return it.id;
    }

    move(id, x, y) { return this._edit('move', [id], (it) => { it.x = this._coord(x); it.y = this._coord(y); }); }
    rotate(id, theta) { return this._edit('rotate', [id], (it) => { it.theta = this._angle(theta); }); }

    remove(ids) {
        const set = new Set(_asArray(ids));
        if (!set.size) return false;
        const before = this._snap();
        const n0 = this._items.length;
        this._items = this._items.filter(it => !set.has(it.id));
        if (this._items.length === n0) return false;
        for (const id of set) this._selected.delete(id);
        this._pushSelection();
        this._commit('delete', before, [...set]);
        return true;
    }

    /** Muda o tipo: minúcia ending|bifurcation|unknown; singularidade core|delta. */
    setType(ids, type) {
        const t = String(type).toLowerCase();
        return this._edit('type', ids, (it) => {
            if (it.kind === 'minutia' && MINUTIA_TYPES.includes(t)) it.type = t;
            else if (it.kind !== 'minutia' && (t === 'core' || t === 'delta')) it.kind = t;
        });
    }

    /** Alterna o tipo: terminação → bifurcação → desconhecida; núcleo ↔ delta. */
    cycleType(ids) {
        return this._edit('type', ids, (it) => {
            if (it.kind === 'minutia') {
                it.type = MINUTIA_TYPES[(MINUTIA_TYPES.indexOf(it.type) + 1) % MINUTIA_TYPES.length];
            } else {
                it.kind = it.kind === 'core' ? 'delta' : 'core';
            }
        });
    }

    setConfidence(ids, confidence) {
        return this._edit('confidence', ids, (it) => { it.confidence = confidence || undefined; });
    }

    /** Raio de incerteza da posição (px) e do ângulo (graus). */
    setUncertainty(ids, { coord_unc, theta_unc } = {}) {
        return this._edit('uncertainty', ids, (it) => {
            if (coord_unc !== undefined) it.coord_unc = coord_unc == null ? undefined : Math.max(0, Number(coord_unc));
            if (theta_unc !== undefined) it.theta_unc = theta_unc == null ? undefined : Math.max(0, Number(theta_unc));
        });
    }

    /** Define a ROI (polígono [[x, y], ...] com 3+ vértices) ou a apaga (null). */
    setRoi(points) {
        const before = this._snap();
        this._roi = points && points.length >= 3 ? points.map(p => [this._coord(p[0]), this._coord(p[1])]) : null;
        this._commit('roi', before, []);
        return this;
    }

    /** Seleciona ids (add: soma à seleção atual). */
    select(ids, { add = false } = {}) {
        const next = add ? new Set(this._selected) : new Set();
        for (const id of _asArray(ids)) if (this._items.some(i => i.id === id)) next.add(id);
        this._setSelected([...next]);
        return this;
    }

    clearSelection() { this._setSelected([]); return this; }

    /** Troca todas as features (Features do contrato ou listas no formato do mntviz). */
    setFeatures(f, { silent = false, resetHistory = true } = {}) {
        const before = this._snap();
        this._items = [];
        this._nextId = 1;
        const feats = f || {};
        for (const m of feats.minutiae || (Array.isArray(f) ? f : [])) this._items.push(this._importItem('minutia', m));
        for (const c of feats.cores || []) this._items.push(this._importItem('core', c));
        for (const d of feats.deltas || []) this._items.push(this._importItem('delta', d));
        this._roi = feats.roi && feats.roi.length >= 3 ? feats.roi.map(p => [Number(p[0]), Number(p[1])]) : null;
        const { frgp = 0, pattern, value, absent = [] } = feats;
        this._meta = { frgp, absent: [...absent] };
        if (pattern != null) this._meta.pattern = pattern;
        if (value != null) this._meta.value = value;
        if (feats.ppi) this._o.ppi = Number(feats.ppi);
        this._selected.clear();
        if (resetHistory) this._history.clear();
        if (!silent) this._emitChange('set', before, this._items.map(i => i.id));
        this.render();
        return this;
    }

    /* ── sugestões ──────────────────────────────────────────── */

    /**
     * Sugestões do algoritmo (camada tracejada, separada das respostas):
     * Features-like {minutiae, cores, deltas} ou uma lista de minúcias.
     * `source` = {kind: 'algo', id, version, params_hash} vai na origem do aceito.
     */
    setSuggestions(sug, { source = null } = {}) {
        this._sug = [];
        let sid = 0;
        const s = sug || {};
        const push = (kind, m) => {
            const it = this._importItem(kind, m, { keepFloat: true });
            this._sug.push({ sid: sid++, kind, x: it.x, y: it.y, theta: it.theta, type: it.type,
                quality: it.quality, status: 'open' });
        };
        for (const m of s.minutiae || (Array.isArray(sug) ? sug : [])) push('minutia', m);
        for (const c of s.cores || []) push('core', c);
        for (const d of s.deltas || []) push('delta', d);
        this._sugSource = source ? clone(source) : null;
        this._focusSid = null;
        this._sugGen++;
        this.render();
        this.emit('suggestions', { n: this._sug.length, source: this._sugSource });
        return this;
    }

    /** Aceita sugestões ('focused', 'all' ou lista de sid). Devolve os ids criados. */
    accept(which = 'focused') {
        const list = this._resolveSug(which);
        if (!list.length || this._readOnly) return [];
        const before = this._snap();
        const ids = [];
        for (const s of list) {
            s.status = 'accepted';
            const it = this._newItem(s.kind, s.x, s.y, { theta: s.theta, type: s.type, quality: s.quality });
            it.origin = { ...(this._sugSource || { kind: 'algo' }), sid: s.sid };
            this._items.push(it);
            ids.push(it.id);
        }
        this._focusNextOpen(list[list.length - 1].sid);
        this._commit('accept', before, ids);
        return ids;
    }

    /** Rejeita sugestões ('focused', 'all' ou lista de sid). Devolve os sid rejeitados. */
    reject(which = 'focused') {
        const list = this._resolveSug(which);
        if (!list.length || this._readOnly) return [];
        const before = this._snap();
        for (const s of list) s.status = 'rejected';
        this._focusNextOpen(list[list.length - 1].sid);
        this._commit('reject', before, []);
        return list.map(s => s.sid);
    }

    /** Foco na próxima (ou anterior) sugestão aberta. */
    focusNext(dir = 1) {
        const open = this._sug.filter(s => s.status === 'open');
        if (!open.length) { this._setFocus(null); return null; }
        const i = open.findIndex(s => s.sid === this._focusSid);
        const next = open[(i < 0 ? (dir > 0 ? 0 : open.length - 1) : (i + dir + open.length) % open.length)];
        this._setFocus(next.sid);
        return { ...next };
    }
    focusPrev() { return this.focusNext(-1); }

    /**
     * Marca de laranja (O, fase 'comparison') as features sem correspondente na
     * linha de base (por exemplo, a análise travada A0): mesmo tipo de feature a
     * até `tol` px. Devolve os ids marcados.
     */
    markNewAgainst(baseline, { tol = 4 } = {}) {
        const base = [];
        const b = baseline || {};
        for (const m of b.minutiae || []) base.push({ kind: 'minutia', x: Number(m.x), y: Number(m.y) });
        for (const c of b.cores || []) base.push({ kind: 'core', x: Number(c.x), y: Number(c.y) });
        for (const d of b.deltas || []) base.push({ kind: 'delta', x: Number(d.x), y: Number(d.y) });
        const ids = this._items.filter(it => !base.some(q => q.kind === it.kind
            && Math.hypot(q.x - it.x, q.y - it.y) <= tol)).map(it => it.id);
        if (!ids.length) return [];
        this._edit('diff', ids, (it) => { it.confidence = 'O'; it.phase = 'comparison'; });
        return ids;
    }

    /* ── desfazer ───────────────────────────────────────────── */

    /** Desfaz o último passo (nada com o editor travado: readOnly vale também para o histórico). */
    undo() {
        if (this._readOnly) return false;
        const cur = this._snap();
        const prev = this._history.undo(cur);
        if (!prev) return false;
        this._load(prev);
        this._emitChange('undo', cur, []);
        this.render();
        return true;
    }

    redo() {
        if (this._readOnly) return false;
        const cur = this._snap();
        const next = this._history.redo(cur);
        if (!next) return false;
        this._load(next);
        this._emitChange('redo', cur, []);
        this.render();
        return true;
    }

    /* ── saída ──────────────────────────────────────────────── */

    /** Features no formato do contrato (EFS-JSON v0). */
    toFeatures() {
        const out = { ppi: this._o.ppi, minutiae: [], cores: [], deltas: [], roi: this.roi,
            frgp: this._meta.frgp ?? 0, absent: [...(this._meta.absent || [])],
            conventions: { angle: 'iso', coords: 'image' } };
        if (this._meta.pattern != null) out.pattern = this._meta.pattern;
        if (this._meta.value != null) out.value = this._meta.value;
        if (this._o.source) out.source = clone(this._o.source);
        for (const it of this._items) {
            if (it.kind === 'minutia') {
                out.minutiae.push(_strip({ x: it.x, y: it.y, theta_deg_iso: it.theta, type: it.type, quality: it.quality,
                    coord_unc: it.coord_unc, theta_unc: it.theta_unc, confidence: it.confidence, phase: it.phase }));
            } else {
                (it.kind === 'core' ? out.cores : out.deltas).push(_strip({ x: it.x, y: it.y, type: it.kind,
                    theta_deg_iso: it.theta, confidence: it.confidence }));
            }
        }
        return out;
    }

    /** Estado completo do editor (JSON). */
    serialize() {
        return {
            version: 1, layer: this._o.layer, ppi: this._o.ppi, phase: this._phase, nextId: this._nextId,
            items: clone(this._items), roi: this.roi, meta: clone(this._meta),
            suggestions: { source: clone(this._sugSource), items: clone(this._sug) },
        };
    }

    /** Aplica um estado de serialize() (zera o histórico). */
    restore(state) {
        if (!state) return this;
        this._items = clone(state.items || []);
        this._roi = state.roi ? clone(state.roi) : null;
        this._meta = clone(state.meta || { frgp: 0, absent: [] });
        this._sug = clone((state.suggestions && state.suggestions.items) || []);
        this._sugSource = clone((state.suggestions && state.suggestions.source) || null);
        this._nextId = Math.max(state.nextId || 1, ...this._items.map(i => i.id + 1), 1);
        if (state.ppi) this._o.ppi = state.ppi;
        if (state.phase) this._phase = state.phase;
        this._selected.clear();
        this._history.clear();
        this.render();
        return this;
    }

    beginExport() { this._exportMode = true; this.render(); }
    endExport() { this._exportMode = false; this.render(); }

    destroy() {
        this._destroyed = true;
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
        this._ac.abort();
        this._offView();
        this._offSel();
        this._g.remove();
        this._sg.remove();
        this.removeAllListeners();
    }

    /* ── desenho ────────────────────────────────────────────── */

    render() {
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
        if (this._destroyed) return;
        if (!this._g.isConnected) this._layer.el.appendChild(this._g);
        if (!this._sg.isConnected) this._sugLayer.el.appendChild(this._sg);
        this._g.replaceChildren();
        this._sg.replaceChildren();
        const ex = this._exportMode;
        this._drawRoi();
        for (const s of this._sug) {
            if (s.status !== 'open') continue;
            this._glyph(this._sg, s, this._o.suggestionColor, { dashed: true, focused: !ex && s.sid === this._focusSid });
        }
        for (const it of this._items) {
            this._glyph(this._g, it, this._colorOf(it), { selected: !ex && this._selected.has(it.id) });
        }
    }

    _scheduleRender() {
        if (this._raf || this._destroyed) return;
        this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); });
    }

    _colorOf(it) {
        if (typeof this._o.color === 'function') {
            const c = this._o.color({ ...it });
            if (c) return c;
        }
        return GYRO[it.confidence] || GYRO.G;
    }

    _radius(it) {
        const base = this._o.markerRadius != null ? this._o.markerRadius : 5 * this._o.ppi / 500;
        return it.kind === 'core' ? base * 1.35 : it.kind === 'delta' ? base * 1.45 : base;
    }

    _segLen(it) {
        const base = this._o.segmentLength != null ? this._o.segmentLength : 13 * this._o.ppi / 500;
        return it.kind === 'minutia' ? base : base * 1.25;
    }

    _glyph(parent, it, color, { dashed = false, selected = false, focused = false } = {}) {
        const s = this._exportMode ? 1 : viewScale(this.viewer);
        const r = this._radius(it);
        const L = this._segLen(it);
        const g = svgEl('g', {
            class: `mntviz-fe-item mntviz-fe-${it.kind}${dashed ? ' mntviz-fe-suggestion' : ''}${selected ? ' mntviz-fe-selected' : ''}`,
            'data-id': dashed ? null : it.id, 'data-sid': dashed ? it.sid : null, 'data-kind': it.kind,
        }, parent);
        const stroke = { stroke: color, 'stroke-width': 1.7, 'vector-effect': 'non-scaling-stroke' };
        if (dashed) stroke['stroke-dasharray'] = '3 2';
        if (!dashed && it.coord_unc > 0) {
            svgEl('circle', { cx: it.x, cy: it.y, r: it.coord_unc, fill: color, 'fill-opacity': 0.08,
                stroke: color, 'stroke-opacity': 0.55, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke',
                class: 'mntviz-fe-unc' }, g);
        }
        if (!dashed && it.theta_unc > 0 && it.theta != null) {
            const u = Math.min(it.theta_unc, 179.9);
            const a = tipPoint(it.x, it.y, it.theta - u, L), b = tipPoint(it.x, it.y, it.theta + u, L);
            svgEl('path', { d: `M ${it.x} ${it.y} L ${a.x} ${a.y} A ${L} ${L} 0 ${2 * u > 180 ? 1 : 0} 0 ${b.x} ${b.y} Z`,
                fill: color, 'fill-opacity': 0.16, stroke: 'none', class: 'mntviz-fe-thetaunc' }, g);
        }
        const shapeName = it.kind === 'minutia' ? (SHAPE_OF_TYPE[it.type] || 'circle')
            : (it.kind === 'core' ? 'circle' : 'triangle');
        if (selected || focused) {
            const halo = createMarkerShape(shapeName, it.x, it.y, r + 2.2 / s);
            _attrs(halo, { stroke: focused ? '#fde047' : this._o.selectColor, 'stroke-width': 4.5, 'stroke-opacity': 0.9,
                fill: 'none', 'vector-effect': 'non-scaling-stroke', class: 'mntviz-fe-halo' });
            g.appendChild(halo);
        }
        const shape = createMarkerShape(shapeName, it.x, it.y, r);
        _attrs(shape, { ...stroke, fill: 'none', class: 'mntviz-fe-shape' });
        g.appendChild(shape);
        if (it.kind === 'core') {
            svgEl('circle', { cx: it.x, cy: it.y, r: Math.max(0.8, r * 0.25), fill: color, stroke: 'none' }, g);
        }
        if (it.theta != null && Number.isFinite(it.theta)) {
            const t = tipPoint(it.x, it.y, it.theta, L);
            const st = tipPoint(it.x, it.y, it.theta, r);
            svgEl('line', { x1: st.x, y1: st.y, x2: t.x, y2: t.y, ...stroke, 'stroke-linecap': 'round',
                class: 'mntviz-fe-dir' }, g);
            if (selected && !this._readOnly) {
                svgEl('circle', { cx: t.x, cy: t.y, r: 3.2 / s, fill: color, stroke: '#000', 'stroke-width': 1,
                    'vector-effect': 'non-scaling-stroke', class: 'mntviz-fe-tip' }, g);
            }
        }
        if (this._o.showConfidence && !dashed && it.confidence) {
            const lg = svgEl('g', { transform: uprightTransform(this.viewer, it.x, it.y, { exportMode: this._exportMode }) }, g);
            const tx = svgEl('text', { x: 7, y: 12, 'font-size': 10, 'font-family': 'sans-serif', fill: color,
                stroke: '#000', 'stroke-width': 2.5, 'paint-order': 'stroke' }, lg);
            tx.textContent = it.confidence;
        }
        return g;
    }

    _drawRoi() {
        const pts = this._roi;
        const color = this._o.roiColor;
        const s = this._exportMode ? 1 : viewScale(this.viewer);
        if (pts && pts.length >= 3) {
            svgEl('polygon', { points: pts.map(p => p.join(',')).join(' '), fill: color, 'fill-opacity': 0.06,
                stroke: color, 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke', class: 'mntviz-fe-roi' }, this._g);
            if (this._mode === 'roi' && !this._exportMode) {
                for (const p of pts) {
                    svgEl('rect', { x: p[0] - 3 / s, y: p[1] - 3 / s, width: 6 / s, height: 6 / s, fill: color,
                        stroke: '#000', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, this._g);
                }
            }
        }
        const d = this._roiDraft;
        if (d && d.length && !this._exportMode) {
            const all = this._roiCursor ? [...d, this._roiCursor] : d;
            svgEl('polyline', { points: all.map(p => p.join(',')).join(' '), fill: 'none', stroke: color,
                'stroke-width': 1.6, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke',
                class: 'mntviz-fe-roi-draft' }, this._g);
            for (const p of d) {
                svgEl('circle', { cx: p[0], cy: p[1], r: 3 / s, fill: color, stroke: '#000', 'stroke-width': 1,
                    'vector-effect': 'non-scaling-stroke' }, this._g);
            }
        }
    }

    /* ── mouse ──────────────────────────────────────────────── */

    _img(e) { return this.viewer.screenToImageCoords(e.clientX, e.clientY); }

    _down(e) {
        if (e.button !== 0 || !EDIT_MODES.has(this._mode)) return;
        if (this._mode === 'roi') { this._roiDown(e); return; }
        const hit = this._hit(e);
        if (hit) {
            stopEvent(e);
            const it = this._items.find(i => i.id === hit.id);
            if (e.shiftKey) {
                const next = new Set(this._selected);
                if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
                this._setSelected([...next]);
            } else if (!this._selected.has(it.id)) {
                this._setSelected([it.id]);
            }
            if (this._readOnly || !this._selected.has(it.id)) { this.render(); return; }
            const before = this._snap();
            const p = this._img(e);
            if (e.altKey && it.kind === 'minutia') this._drag = { type: 'radius', id: it.id, before };
            else if (hit.part === 'tip') this._drag = { type: 'rotate', id: it.id, before };
            else {
                const orig = {};
                for (const id of this._selected) {
                    const o = this._items.find(i => i.id === id);
                    if (o) orig[id] = { x: o.x, y: o.y };
                }
                this._drag = { type: 'move', ids: Object.keys(orig).map(Number), orig, start: p, before };
            }
            this.render();
            return;
        }
        const sh = this._hitSug(e);
        if (sh) {
            stopEvent(e);
            this._setFocus(sh.sid);
            return;
        }
        if (CREATE_MODES.has(this._mode) && !this._readOnly) {
            const p = this._img(e);
            if (!insideImage(this.viewer, p.x, p.y)) return;
            stopEvent(e);
            const before = this._snap();
            const it = this._newItem(this._mode, p.x, p.y, {});
            this._items.push(it);
            this._selected = new Set([it.id]);
            this._drag = { type: 'create', id: it.id, start: p, sx: e.clientX, sy: e.clientY, before };
            this.render();
            return;
        }
        if (!e.shiftKey && this._selected.size) this._setSelected([]);
    }

    _move(e) {
        if (this._mode === 'roi' && this._roiDraft) {
            const p = this._img(e);
            this._roiCursor = [this._coord(p.x), this._coord(p.y)];
            this._scheduleRender();
        }
        const d = this._drag;
        if (!d) return;
        const p = this._img(e);
        if (d.type === 'roi-vertex') {
            this._roi[d.index] = [this._coord(p.x), this._coord(p.y)];
            this._scheduleRender();
            return;
        }
        const it = this._items.find(i => i.id === (d.id ?? d.ids[0]));
        if (!it) { this._drag = null; return; }
        switch (d.type) {
            case 'create':
                if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= this._o.dragThreshold) {
                    it.theta = this._angle(isoAngle(d.start.x, d.start.y, p.x, p.y));
                    d.angled = true;
                }
                break;
            case 'rotate':
                it.theta = this._angle(isoAngle(it.x, it.y, p.x, p.y));
                break;
            case 'move':
                for (const id of d.ids) {
                    const o = this._items.find(i => i.id === id);
                    if (!o) continue;
                    o.x = this._coord(d.orig[id].x + p.x - d.start.x);
                    o.y = this._coord(d.orig[id].y + p.y - d.start.y);
                }
                break;
            case 'radius':
                it.coord_unc = Math.round(Math.hypot(p.x - it.x, p.y - it.y) * 10) / 10;
                break;
            default: break;
        }
        this._scheduleRender();
    }

    _up() {
        const d = this._drag;
        if (!d) return;
        this._drag = null;
        if (d.type === 'roi-vertex') { this._commit('roi', d.before, []); return; }
        const changed = JSON.stringify(d.before.items) !== JSON.stringify(this._items);
        if (d.type !== 'create' && !changed) { this.render(); return; }
        const type = { create: 'add', rotate: 'rotate', move: 'move', radius: 'uncertainty' }[d.type] || d.type;
        if (d.type === 'create') this._setSelected([d.id]);
        this._commit(type, d.before, d.ids || [d.id]);
    }

    _dbl(e) {
        if (!EDIT_MODES.has(this._mode)) return;
        const sh = this._hitSug(e);
        if (sh) { stopEvent(e); this.accept([sh.sid]); }
    }

    _cancelDrag() {
        const d = this._drag;
        this._drag = null;
        if (d && d.before) this._load(d.before);
        this.render();
    }

    _roiDown(e) {
        if (this._readOnly) return;
        const p = this._img(e);
        const map = screenMapper(this.viewer);
        const near = (q) => { const sp = map(q[0], q[1]); return Math.hypot(sp.x - e.clientX, sp.y - e.clientY) <= this._o.hitRadius; };
        if (this._roiDraft) {
            stopEvent(e);
            if (this._roiDraft.length >= 3 && near(this._roiDraft[0])) { this._closeRoi(); return; }
            this._roiDraft.push([this._coord(p.x), this._coord(p.y)]);
            this.render();
            return;
        }
        if (this._roi) {
            const idx = this._roi.findIndex(near);
            if (idx >= 0) {
                stopEvent(e);
                this._drag = { type: 'roi-vertex', index: idx, before: this._snap() };
                return;
            }
        }
        if (!insideImage(this.viewer, p.x, p.y)) return;
        stopEvent(e);
        this._roiDraft = [[this._coord(p.x), this._coord(p.y)]];
        this.render();
    }

    _closeRoi() {
        const pts = this._roiDraft;
        this._roiDraft = null;
        this._roiCursor = null;
        if (pts && pts.length >= 3) this.setRoi(pts);
        else this.render();
    }

    /** Alvo sob o mouse: {id, part: 'center' | 'tip', d} ou null. */
    _hit(e) {
        const map = screenMapper(this.viewer);
        const mx = e.clientX, my = e.clientY;
        let center = null, tip = null;
        for (const it of this._items) {
            const c = map(it.x, it.y);
            const dc = Math.hypot(c.x - mx, c.y - my);
            if (dc <= this._o.hitRadius && (!center || dc < center.d)) center = { id: it.id, part: 'center', d: dc };
            if (it.theta == null) continue;
            const tp = tipPoint(it.x, it.y, it.theta, this._segLen(it));
            const t = map(tp.x, tp.y);
            if (Math.hypot(t.x - c.x, t.y - c.y) < 6) continue;
            const dt = Math.hypot(t.x - mx, t.y - my);
            if (dt <= this._o.tipRadius && (!tip || dt < tip.d)) tip = { id: it.id, part: 'tip', d: dt };
        }
        if (tip && (!center || this._selected.has(tip.id) || tip.d < center.d)) return tip;
        return center;
    }

    _hitSug(e) {
        const map = screenMapper(this.viewer);
        let best = null;
        for (const s of this._sug) {
            if (s.status !== 'open') continue;
            const c = map(s.x, s.y);
            const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
            if (d <= this._o.hitRadius && (!best || d < best.d)) best = { sid: s.sid, d };
        }
        return best;
    }

    /* ── interno ────────────────────────────────────────────── */

    _coord(v) { return (this._o.round ? Math.round(Number(v)) : Number(v)) + 0; }

    _angle(a) {
        const st = this._o.angleStep;
        const v = st > 0 ? Math.round(Number(a) / st) * st : Number(a);
        return norm360(v);
    }

    _newItem(kind, x, y, props = {}) {
        const k = kind === 'core' || kind === 'delta' ? kind : 'minutia';
        const it = { id: this._nextId++, kind: k, x: this._coord(x), y: this._coord(y) };
        if (k === 'minutia') {
            it.theta = this._angle(props.theta ?? 0);
            it.type = TYPE_ALIASES[String(props.type ?? this._newType).toLowerCase()] || this._newType;
        } else if (props.theta != null) {
            it.theta = this._angle(props.theta);
        }
        if (props.quality != null) it.quality = Number(props.quality);
        if (props.coord_unc != null) it.coord_unc = Number(props.coord_unc);
        if (props.theta_unc != null) it.theta_unc = Number(props.theta_unc);
        it.confidence = props.confidence || (this._phase === 'comparison' ? 'O' : this._defaultConfidence) || undefined;
        it.phase = props.phase || this._phase;
        return it;
    }

    _importItem(kind, m, { keepFloat = false } = {}) {
        const theta = m.theta_deg_iso ?? m.theta ?? m.angle ?? (Array.isArray(m.angles) ? m.angles[0] : undefined);
        const k = kind === 'minutia' ? 'minutia' : (String(m.type || kind).toLowerCase() === 'delta' ? 'delta' : kind);
        const it = { id: keepFloat ? -1 : this._nextId++, kind: k,
            x: keepFloat ? Number(m.x) : this._coord(m.x), y: keepFloat ? Number(m.y) : this._coord(m.y) };
        if (theta != null && Number.isFinite(Number(theta))) it.theta = keepFloat ? norm360(Number(theta)) : this._angle(theta);
        else if (k === 'minutia') it.theta = 0;
        if (k === 'minutia') it.type = TYPE_ALIASES[String(m.type ?? 'unknown').toLowerCase()] || 'unknown';
        for (const f of ['quality', 'coord_unc', 'theta_unc']) if (m[f] != null) it[f] = Number(m[f]);
        if (m.confidence && typeof m.confidence === 'string') it.confidence = m.confidence;
        if (m.phase) it.phase = m.phase;
        if (m.origin) it.origin = clone(m.origin);
        return it;
    }

    _edit(type, ids, fn) {
        const set = new Set(_asArray(ids));
        const targets = this._items.filter(it => set.has(it.id));
        if (!targets.length || this._readOnly) return false;
        const before = this._snap();
        for (const it of targets) fn(it);
        if (JSON.stringify(before.items) === JSON.stringify(this._items)) return false;
        this._commit(type, before, [...set]);
        return true;
    }

    _snap() {
        return { items: clone(this._items), roi: this._roi ? clone(this._roi) : null, meta: clone(this._meta),
            sug: this._sug.map(s => s.status), sugGen: this._sugGen, nextId: this._nextId };
    }

    _load(s) {
        this._items = clone(s.items);
        this._roi = s.roi ? clone(s.roi) : null;
        this._meta = clone(s.meta);
        // os estados das sugestões só valem para a lista em que foram tirados
        if (s.sugGen === this._sugGen) s.sug.forEach((st, i) => { if (this._sug[i]) this._sug[i].status = st; });
        for (const id of [...this._selected]) if (!this._items.some(i => i.id === id)) this._selected.delete(id);
        this._pushSelection();
    }

    _commit(type, before, ids) {
        this._history.push(before);
        this._emitChange(type, before, ids);
        this.render();
    }

    _emitChange(type, before, ids) {
        const prev = new Map(before.items.map(i => [i.id, i]));
        const now = new Map(this._items.map(i => [i.id, i]));
        const added = [], removed = [], changed = [];
        for (const [id, it] of now) {
            if (!prev.has(id)) added.push({ ...it });
            else if (JSON.stringify(prev.get(id)) !== JSON.stringify(it)) changed.push({ before: { ...prev.get(id) }, after: { ...it } });
        }
        for (const [id, it] of prev) if (!now.has(id)) removed.push({ ...it });
        const payload = { source: 'feature-editor', layer: this._o.layer, type, ids,
            diff: { added, removed, changed }, features: this.toFeatures() };
        this.emit('change', payload);
        if (typeof this.viewer._emit === 'function') this.viewer._emit('change', payload);
    }

    _emitTool() {
        this.emit('tool', { newType: this._newType, defaultConfidence: this._defaultConfidence, phase: this._phase });
    }

    _setSelected(ids) {
        this._selected = new Set(ids);
        this._pushSelection();
        this.emit('select', { ids: this.selected, items: this.selectedItems });
        this.render();
    }

    _pushSelection() {
        const sel = this.viewer.selection;
        if (!sel || !this._o.selection) return;
        const layer = this._o.layer;
        this._syncing = true;
        try {
            const mine = sel.items.filter(it => it && it.layer === layer);
            const want = this.selected.map(id => {
                const it = this._items.find(i => i.id === id);
                return { layer, kind: it ? it.kind : 'minutia', id };
            });
            const keys = new Set(want.map(w => sel.keyOf(w)));
            sel.remove(mine.filter(it => !keys.has(sel.keyOf(it))), { source: 'feature-editor' });
            sel.add(want, { source: 'feature-editor' });
        } finally {
            this._syncing = false;
        }
    }

    _fromSharedSelection(ev) {
        if (this._syncing || ev.source === 'feature-editor') return;
        const layer = this._o.layer;
        const ids = ev.items.filter(it => it && it.layer === layer && this._items.some(i => i.id === it.id)).map(it => it.id);
        this._selected = new Set(ids);
        this.emit('select', { ids: this.selected, items: this.selectedItems });
        this.render();
    }

    _sugById(sid) { return sid == null ? null : this._sug.find(s => s.sid === sid) || null; }

    _setFocus(sid) {
        this._focusSid = sid;
        const s = this._sugById(sid);
        this.emit('focus', { sid, suggestion: s ? { ...s } : null });
        this.render();
    }

    _focusNextOpen(afterSid) {
        const open = this._sug.filter(s => s.status === 'open');
        const next = open.find(s => s.sid > afterSid) || open[0] || null;
        this._focusSid = next ? next.sid : null;
    }

    _resolveSug(which) {
        if (which === 'all') return this._sug.filter(s => s.status === 'open');
        if (which === 'focused') { const s = this._sugById(this._focusSid); return s && s.status === 'open' ? [s] : []; }
        const set = new Set(_asArray(which));
        return this._sug.filter(s => set.has(s.sid) && s.status === 'open');
    }
}

function _asArray(v) { return v == null ? [] : (Array.isArray(v) ? v : [v]); }

function _strip(o) {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) out[k] = v;
    return out;
}

function _attrs(el, attrs) {
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
}
