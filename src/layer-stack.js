/**
 * mntviz/layer-stack.js — Pilha de camadas do Viewer.
 *
 * Cada camada tem nome, tipo (kind), z, visibilidade e opacidade, e um elemento
 * próprio:
 *   - 'svg'    → <g class="mntviz-layer"> dentro do SVG comum do viewer
 *                (acima da imagem e de todos os canvases);
 *   - 'canvas' → <canvas> no tamanho natural da imagem (abaixo do SVG);
 *   - 'html'   → <div> no tamanho natural da imagem, para hospedar um
 *                OverlayLayer ou DOM livre (abaixo do SVG).
 *
 * Tudo mora dentro do container que o Viewer transforma (pan, zoom, rotação e
 * espelho): a sincronização é estrutural, não há SVG paralelo para acertar na
 * mão. Cada renderer recebe `layer.el`, e o `clear()` dele limpa só aquele grupo.
 * Entre camadas do mesmo tipo vale o z (empate: ordem de criação). Nós postos
 * direto no SVG raiz (API antiga) ficam onde estão.
 *
 * Uso:
 *   const mnt = viewer.layers.add('minutiae', { kind: 'svg', z: 20 });
 *   new MinutiaeRenderer(mnt.el).draw(minutiae, '#0f0');
 *   viewer.layers.get('minutiae').setOpacity(0.5);
 *   const estado = viewer.layers.serialize();   // JSON, para layouts
 *   outroViewer.layers.restore(estado);
 *
 * Eventos (LayerStack é um Emitter; o Viewer repassa como 'change'):
 *   'change' {type: 'add'|'remove'|'visible'|'opacity'|'z'|'clear'|'restore', layer?}
 */

import { Emitter } from './events.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const KINDS = new Set(['svg', 'canvas', 'html']);

export class Layer {
    /**
     * Não instancie direto: use `viewer.layers.add(name, opts)`.
     * @param {LayerStack} stack
     * @param {string} name
     * @param {object} opts
     * @param {number} seq - ordem de criação (desempate do z)
     */
    constructor(stack, name, opts, seq) {
        const { kind = 'svg', z = 0, visible = true, opacity = 1, meta = null } = opts || {};
        if (!KINDS.has(kind)) throw new Error(`mntviz: unknown layer kind '${kind}' (svg|canvas|html)`);
        this._stack = stack;
        this._name = String(name);
        this._kind = kind;
        this._z = Number.isFinite(Number(z)) ? Number(z) : 0;
        this._seq = seq;
        this._visible = true;
        this._opacity = 1;
        this.meta = meta;
        this._el = this._createElement();
        this._setOpacity(opacity);
        this._setVisible(visible);
    }

    get name() { return this._name; }
    get kind() { return this._kind; }
    get z() { return this._z; }
    get visible() { return this._visible; }
    get opacity() { return this._opacity; }

    /** Elemento da camada: <g> (svg), <canvas> (canvas) ou <div> (html). */
    get el() { return this._el; }
    /** Atalho para camadas svg. */
    get g() { return this._kind === 'svg' ? this._el : null; }
    /** Atalho para camadas canvas. */
    get canvas() { return this._kind === 'canvas' ? this._el : null; }
    /** Contexto 2D (só camadas canvas). */
    get ctx() { return this._kind === 'canvas' ? this._el.getContext('2d') : null; }

    show() { this.setVisible(true); return this; }
    hide() { this.setVisible(false); return this; }
    toggle() { this.setVisible(!this._visible); return this; }

    setVisible(visible) {
        const next = !!visible;
        if (next === this._visible) return this;
        this._setVisible(next);
        this._stack._changed('visible', this);
        return this;
    }

    /** @param {number} opacity - 0 a 1. */
    setOpacity(opacity) {
        const next = _clamp01(opacity);
        if (next === this._opacity) return this;
        this._setOpacity(next);
        this._stack._changed('opacity', this);
        return this;
    }

    setZ(z) {
        const next = Number(z);
        if (!Number.isFinite(next) || next === this._z) return this;
        this._z = next;
        this._stack._place(this);
        this._stack._changed('z', this);
        return this;
    }

    /** Esvazia a camada (svg/html: tira os filhos; canvas: apaga os pixels). */
    clear() {
        if (this._kind === 'canvas') {
            const c = this._el;
            if (c.width && c.height) c.getContext('2d').clearRect(0, 0, c.width, c.height);
        } else {
            this._el.replaceChildren();
        }
        return this;
    }

    remove() { this._stack.remove(this._name); }

    /** Estado serializável (sem o conteúdo desenhado). */
    serialize() {
        const out = { name: this._name, kind: this._kind, z: this._z, visible: this._visible, opacity: this._opacity };
        if (this.meta != null) out.meta = this.meta;
        return out;
    }

    /* ── interno ─────────────────────────────────────────────── */

    _createElement() {
        let el;
        if (this._kind === 'svg') {
            el = document.createElementNS(SVG_NS, 'g');
            el.setAttribute('class', 'mntviz-layer');
        } else {
            el = document.createElement(this._kind === 'canvas' ? 'canvas' : 'div');
            el.className = `mntviz-layer mntviz-layer-${this._kind}`;
            el.style.position = 'absolute';
            el.style.left = '0';
            el.style.top = '0';
            el.style.pointerEvents = 'none';
        }
        el.setAttribute('data-layer', this._name);
        return el;
    }

    _setVisible(visible) {
        this._visible = !!visible;
        if (this._kind === 'svg') {
            if (this._visible) this._el.removeAttribute('display');
            else this._el.setAttribute('display', 'none');
        } else {
            this._el.style.display = this._visible ? '' : 'none';
        }
    }

    _setOpacity(opacity) {
        this._opacity = _clamp01(opacity);
        if (this._kind === 'svg') {
            if (this._opacity === 1) this._el.removeAttribute('opacity');
            else this._el.setAttribute('opacity', String(this._opacity));
        } else {
            this._el.style.opacity = this._opacity === 1 ? '' : String(this._opacity);
        }
    }
}

export class LayerStack extends Emitter {
    /** @param {import('./viewer.js').Viewer} viewer */
    constructor(viewer) {
        super();
        this._viewer = viewer;
        this._layers = new Map();   // nome -> Layer
        this._seq = 0;
    }

    /**
     * Cria uma camada. Nome repetido é erro (use `ensure` para obter ou criar).
     * @param {string} name
     * @param {{kind?: 'svg'|'canvas'|'html', z?: number, visible?: boolean, opacity?: number, meta?: any}} [opts]
     * @returns {Layer}
     */
    add(name, opts = {}) {
        const key = String(name);
        if (this._layers.has(key)) throw new Error(`mntviz: layer '${key}' already exists`);
        const layer = new Layer(this, key, opts, this._seq++);
        this._layers.set(key, layer);
        this._place(layer);
        this._syncSize(layer);
        this._changed('add', layer);
        return layer;
    }

    /** Devolve a camada `name`, criando-a com `opts` se não existir. */
    ensure(name, opts = {}) {
        return this._layers.get(String(name)) || this.add(name, opts);
    }

    get(name) { return this._layers.get(String(name)) || null; }
    has(name) { return this._layers.has(String(name)); }

    remove(name) {
        const key = String(name);
        const layer = this._layers.get(key);
        if (!layer) return false;
        layer._el.remove();
        this._layers.delete(key);
        this._changed('remove', layer);
        return true;
    }

    /** Camadas em ordem de desenho (de baixo para cima): canvas/html, depois svg; z e criação. */
    list() {
        return [...this._layers.values()].sort(_compareDrawOrder);
    }

    names() { return this.list().map(l => l.name); }

    get size() { return this._layers.size; }

    /** Esvazia o conteúdo de todas as camadas (mantém as camadas). */
    clear({ kinds = ['svg', 'canvas'] } = {}) {
        for (const layer of this._layers.values()) {
            if (kinds.includes(layer.kind)) layer.clear();
        }
        this._changed('clear', null);
    }

    /** Estado das camadas (nome, tipo, z, visível, opacidade, meta), sem o conteúdo. */
    serialize() {
        return { version: 1, layers: this.list().map(l => l.serialize()) };
    }

    /**
     * Aplica um estado salvo por `serialize()`. Camadas existentes recebem z,
     * visibilidade e opacidade; as que faltam são criadas vazias (`create`).
     * Camadas fora do estado não mudam.
     */
    restore(state, { create = true } = {}) {
        const entries = Array.isArray(state) ? state : (state && state.layers) || [];
        for (const s of entries) {
            if (!s || s.name == null) continue;
            let layer = this.get(s.name);
            if (!layer) {
                if (!create) continue;
                layer = this.add(s.name, { kind: s.kind || 'svg', z: s.z ?? 0, meta: s.meta ?? null });
            } else {
                if (s.z != null && s.z !== layer.z) { layer._z = Number(s.z); this._place(layer); }
                if (s.meta !== undefined) layer.meta = s.meta;
            }
            if (s.visible != null) layer._setVisible(s.visible);
            if (s.opacity != null) layer._setOpacity(s.opacity);
        }
        this._changed('restore', null);
        return this;
    }

    destroy() {
        for (const layer of this._layers.values()) layer._el.remove();
        this._layers.clear();
        this.removeAllListeners();
    }

    /* ── interno (usado pelo Viewer e pela Layer) ────────────── */

    /** Põe (ou repõe) o elemento da camada na posição dada pelo z. */
    _place(layer) {
        const v = this._viewer;
        const isSvg = layer.kind === 'svg';
        const parent = isSvg ? v.svgLayer : v.canvasContainer;
        let next = null;
        for (const other of this._layers.values()) {
            if (other === layer || (other.kind === 'svg') !== isSvg) continue;
            if (other._el.parentNode !== parent) continue;
            if (_compareZ(other, layer) > 0 && (!next || _compareZ(other, next) < 0)) next = other;
        }
        if (next) parent.insertBefore(layer._el, next._el);
        else if (isSvg) parent.appendChild(layer._el);
        else parent.insertBefore(layer._el, v.svgLayer);
    }

    /** Ajusta canvas/div ao tamanho natural (ou virtual) da imagem. */
    _syncSize(only = null) {
        const { width, height } = this._viewer.imageSize;
        if (!width || !height) return;
        const targets = only ? [only] : [...this._layers.values()];
        for (const layer of targets) {
            if (layer.kind === 'svg') continue;
            const el = layer._el;
            if (layer.kind === 'canvas' && (el.width !== width || el.height !== height)) {
                el.width = width;
                el.height = height;
            }
            el.style.width = `${width}px`;
            el.style.height = `${height}px`;
        }
    }

    _changed(type, layer) {
        const payload = { type, layer: layer ? layer.name : null };
        this.emit('change', payload);
        if (this._viewer && typeof this._viewer._emit === 'function') {
            this._viewer._emit('change', { source: 'layers', ...payload });
        }
    }
}

function _clamp01(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 1;
    return Math.min(1, Math.max(0, n));
}

function _compareZ(a, b) {
    return (a._z - b._z) || (a._seq - b._seq);
}

function _compareDrawOrder(a, b) {
    const sa = a.kind === 'svg' ? 1 : 0;
    const sb = b.kind === 'svg' ? 1 : 0;
    return (sa - sb) || _compareZ(a, b);
}
