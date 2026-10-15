/**
 * mntviz/tools.js — Infraestrutura comum dos editores e das ferramentas de medida.
 *
 *  - ToolModes: o modo ativo, de tecla única, compartilhado por várias ferramentas e
 *    viewers (V ver, M minúcia, C núcleo, D delta, R ROI, L régua, Shift+L cristas,
 *    P par; Esc volta a V). O modo vai para a barra de status pelo evento 'mode'.
 *  - History: desfazer e refazer por instantâneos (o estado de um editor é pequeno).
 *  - GYRO: cores de confiança do perito (G verde, Y amarelo, R vermelho; O laranja =
 *    vista só na comparação). A regra de cor é do host; esta é a padrão.
 *  - Ajudantes de SVG, de ângulo ISO (graus, anti-horário, 0° = +x, 90° = topo) e de
 *    rótulo "de pé": texto que não gira, não espelha nem escala com a vista.
 *
 * Uso:
 *   const modes = new ToolModes();
 *   modes.add(editor); modes.add(ruler);       // cada ferramenta tem setMode(m) e handleKey(e, ctx)
 *   modes.bind();                              // keydown no window (ignora campos de texto)
 *   modes.on('mode', ({ mode }) => status.set(mode));
 *   modes.setMode('minutia');
 */

import { Emitter } from './events.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Modos conhecidos (uma ferramenta pode aceitar outros nomes). */
export const MODES = ['view', 'minutia', 'core', 'delta', 'roi', 'ruler', 'ridges', 'pair'];

/** Tecla → modo. Maiúscula = com Shift (Shift+L = cristas). */
export const DEFAULT_MODE_KEYS = {
    v: 'view', m: 'minutia', c: 'core', d: 'delta', r: 'roi', l: 'ruler', L: 'ridges', p: 'pair',
};

/** Rótulos curtos dos modos (barra de status). */
export const MODE_LABELS = {
    view: 'ver', minutia: 'minúcia', core: 'núcleo', delta: 'delta', roi: 'ROI',
    ruler: 'régua', ridges: 'cristas', pair: 'par',
};

/** Cores GYRO (Langenburg e Champod, 2011). */
export const GYRO = { G: '#22c55e', Y: '#facc15', R: '#ef4444', O: '#f97316' };
export const GYRO_KEYS = { 1: 'G', 2: 'Y', 3: 'R' };

/**
 * Modo ativo compartilhado. As ferramentas registradas recebem `setMode(mode, prev)`
 * a cada troca (prev === mode quando a mesma tecla é repetida: o editor usa isso
 * para alternar o tipo da minúcia) e `handleKey(e, ctx)` para as demais teclas.
 *
 * Eventos: 'mode' {mode, prev, repeat, source}; 'focus' {viewer}.
 */
export class ToolModes extends Emitter {
    /**
     * @param {object} [opts]
     * @param {Record<string,string>} [opts.keys] - Tecla → modo (padrão DEFAULT_MODE_KEYS).
     * @param {string} [opts.mode='view']
     */
    constructor({ keys = DEFAULT_MODE_KEYS, mode = 'view' } = {}) {
        super();
        this._keys = { ...keys };
        this._mode = mode;
        this._tools = new Set();
        this._focus = null;        // viewer da última interação (desfazer vai para ele)
        this._viewerOff = new Map();
        this._unbind = null;
    }

    get mode() { return this._mode; }
    /** Viewer que recebeu a última interação de mouse (ou null). */
    get focus() { return this._focus; }
    get tools() { return [...this._tools]; }

    /** Registra uma ferramenta (FeatureEditor, CorrespondenceEditor, Ruler, RidgeCount...). */
    add(tool) {
        if (!tool || this._tools.has(tool)) return tool;
        this._tools.add(tool);
        if (typeof tool._attachModes === 'function') tool._attachModes(this);
        for (const v of _viewersOf(tool)) this._watchViewer(v);
        if (typeof tool.setMode === 'function') tool.setMode(this._mode, null);   // null: não é repetição
        return tool;
    }

    remove(tool) {
        this._tools.delete(tool);
        if (tool && typeof tool._attachModes === 'function') tool._attachModes(null);
    }

    /** Troca o modo. Repetir o modo atual também notifica (repeat = true). */
    setMode(mode, { source = null } = {}) {
        const prev = this._mode;
        this._mode = String(mode);
        for (const v of this._viewerOff.keys()) {
            v.viewport.classList.remove(`mntviz-mode-${prev}`);
            v.viewport.classList.add(`mntviz-mode-${this._mode}`);
        }
        for (const t of this._tools) {
            if (typeof t.setMode === 'function') t.setMode(this._mode, prev);
        }
        this.emit('mode', { mode: this._mode, prev, repeat: prev === this._mode, source });
    }

    /** Marca o viewer em foco (as teclas de desfazer valem para as ferramentas dele). */
    setFocus(viewer) {
        if (viewer === this._focus) return;
        this._focus = viewer;
        this.emit('focus', { viewer });
    }

    /**
     * Trata uma tecla: primeiro as ferramentas (uma operação em curso, como a ROI
     * aberta, consome o Esc), depois as teclas de modo e o Esc (volta a 'view').
     * Devolve true se alguém consumiu a tecla (e chama preventDefault).
     */
    handleKey(e) {
        if (_isTyping(e)) return false;
        const ctx = { mode: this._mode, focus: this._focus, modes: this };
        for (const t of this._tools) {
            if (typeof t.handleKey === 'function' && t.handleKey(e, ctx)) {
                e.preventDefault();
                return true;
            }
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === 'Escape') {
            if (this._mode !== 'view') { this.setMode('view', { source: 'key' }); e.preventDefault(); return true; }
            return false;
        }
        let mode = this._keys[e.key];
        if (mode == null && !e.shiftKey && typeof e.key === 'string') mode = this._keys[e.key.toLowerCase()];
        if (mode == null) return false;
        this.setMode(mode, { source: 'key' });
        e.preventDefault();
        return true;
    }

    /** Liga o teclado (keydown em `target`, padrão window). Devolve a função que desliga. */
    bind(target = window) {
        if (this._unbind) this._unbind();
        const fn = (e) => this.handleKey(e);
        target.addEventListener('keydown', fn);
        this._unbind = () => { target.removeEventListener('keydown', fn); this._unbind = null; };
        return this._unbind;
    }

    destroy() {
        if (this._unbind) this._unbind();
        for (const off of this._viewerOff.values()) off();
        this._viewerOff.clear();
        this._tools.clear();
        this.removeAllListeners();
    }

    /** @private Foco = viewer onde o mouse desceu por último. */
    _watchViewer(viewer) {
        if (!viewer || this._viewerOff.has(viewer)) return;
        const vp = viewer.viewport;
        const fn = () => this.setFocus(viewer);
        vp.addEventListener('mousedown', fn, true);
        vp.classList.add(`mntviz-mode-${this._mode}`);
        this._viewerOff.set(viewer, () => vp.removeEventListener('mousedown', fn, true));
    }
}

/**
 * Desfazer/refazer por instantâneos. `push(antes)` guarda o estado anterior a uma
 * mudança; `undo(atual)` devolve o anterior e guarda o atual para o refazer.
 */
export class History {
    constructor({ limit = 200 } = {}) {
        this._undo = [];
        this._redo = [];
        this._limit = limit;
    }

    push(snapshot) {
        this._undo.push(snapshot);
        if (this._undo.length > this._limit) this._undo.shift();
        this._redo.length = 0;
    }

    undo(current) {
        if (!this._undo.length) return null;
        const prev = this._undo.pop();
        this._redo.push(current);
        return prev;
    }

    redo(current) {
        if (!this._redo.length) return null;
        const next = this._redo.pop();
        this._undo.push(current);
        return next;
    }

    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    get sizes() { return { undo: this._undo.length, redo: this._redo.length }; }
    clear() { this._undo.length = 0; this._redo.length = 0; }
}

/* ── Ajudantes ────────────────────────────────────────────────── */

/** Cria um elemento SVG com atributos (null/undefined são ignorados). */
export function svgEl(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        el.setAttribute(k, String(v));
    }
    if (parent) parent.appendChild(el);
    return el;
}

/** Ângulo em [0, 360). */
export function norm360(a) {
    const r = Number(a) % 360;
    return (r < 0 ? r + 360 : r) + 0;   // + 0: sem -0
}

/** Diferença circular em graus (0 a 180). */
export function angleDiff(a, b) {
    const d = Math.abs(norm360(a) - norm360(b)) % 360;
    return Math.min(d, 360 - d);
}

/** Ângulo ISO (graus, anti-horário, 0° = +x, 90° = topo da imagem) de (x0,y0) para (x1,y1). */
export function isoAngle(x0, y0, x1, y1) {
    return norm360(Math.atan2(-(y1 - y0), x1 - x0) * 180 / Math.PI);
}

/** Ponta do segmento de direção (ângulo ISO, y da imagem para baixo). */
export function tipPoint(x, y, thetaDeg, len) {
    const r = thetaDeg * Math.PI / 180;
    return { x: x + len * Math.cos(r), y: y - len * Math.sin(r) };
}

/** Escala atual do viewer (pixels de tela por pixel da imagem). */
export function viewScale(viewer) {
    const s = viewer && viewer.viewState ? viewer.viewState.scale : 1;
    return s > 0 ? s : 1;
}

/**
 * Transformação SVG de um rótulo "de pé" no ponto (x, y) da imagem: o conteúdo é
 * desenhado em pixels de tela, sem girar, espelhar nem escalar com a vista. Na
 * exportação (vista nativa) é só a translação.
 */
export function uprightTransform(viewer, x, y, { exportMode = false } = {}) {
    if (exportMode) return `translate(${x}, ${y})`;
    const { scale, rotation, flipX } = viewer.viewState;
    const s = scale > 0 ? scale : 1;
    return `translate(${x}, ${y})${flipX ? ' scale(-1, 1)' : ''} rotate(${-rotation}) scale(${1 / s})`;
}

/**
 * Converte pontos da imagem para a tela com uma única CTM (hit-test barato).
 * Devolve uma função (x, y) → {x, y} em coordenadas de cliente.
 */
export function screenMapper(viewer) {
    const ctm = viewer.svgLayer.getScreenCTM();
    if (!ctm) return () => ({ x: NaN, y: NaN });
    return (x, y) => ({ x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f });
}

/** O ponto (x, y) está dentro da imagem do viewer? */
export function insideImage(viewer, x, y) {
    const { width, height } = viewer.imageSize;
    return x >= 0 && y >= 0 && x < width && y < height;
}

/** Ponto dentro do polígono [[x, y], ...] (regra par-ímpar). */
export function pointInPolygon(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

/** Cópia profunda de dados JSON. */
export function clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

/**
 * Liga um 'view' do viewer a um redesenho por quadro (rótulos de pé, alças). Devolve a
 * função que desliga e também cancela o quadro já agendado (uma ferramenta destruída não
 * redesenha depois).
 */
export function onViewFrame(viewer, fn) {
    let pending = 0, dead = false;
    const off = viewer.on('view', () => {
        if (pending || dead) return;
        pending = requestAnimationFrame(() => { pending = 0; if (!dead) fn(); });
    });
    return () => {
        dead = true;
        if (pending) { cancelAnimationFrame(pending); pending = 0; }
        off();
    };
}

/** Pára o evento (o pan do Viewer não o vê). */
export function stopEvent(e) {
    e.preventDefault();
    e.stopPropagation();
}

/** O foco está num campo de texto? (lá as teclas de atalho não valem) */
function _isTyping(e) {
    const t = e.target;
    if (!t || t === window || t === document) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t.isContentEditable;
}

function _viewersOf(tool) {
    if (!tool) return [];
    if (Array.isArray(tool.viewers)) return tool.viewers;
    return tool.viewer ? [tool.viewer] : [];
}
