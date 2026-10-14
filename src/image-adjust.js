/**
 * mntviz/image-adjust.js — Realce não destrutivo da imagem, como pilha serializável.
 *
 * A imagem original (<img> do Viewer) nunca é alterada. A pilha vira uma LUT de 256
 * entradas aplicada aos pixels da imagem numa camada canvas logo acima do original;
 * a mesma LUT vale na tela e na exportação (o ReportExporter usa estes pixels).
 *
 * Operações (v em [0, 1], uma depois da outra, com corte em [0, 1] a cada passo):
 *   levels     {lo, hi}   (bytes 0-255)  v = (v - lo/255) / ((hi - lo)/255)
 *   brightness {v}        (-1 a 1)       v = v + b
 *   contrast   {v}        (fator, 1 = nada) v = (v - 0,5)·c + 0,5
 *   gamma      {v}        (1 = nada; > 1 clareia os meios-tons) v = v^(1/g)
 *   invert     {}                         v = 1 - v
 *   clahe      {clip, tile, server: true} vem do servidor (?proc=clahe), antes das demais
 * Byte final = round(v·255) (metade para cima).
 *
 * Decodificação: por padrão ('raw') os pixels são os valores do arquivo, sem gestão de
 * cor (createImageBitmap com colorSpaceConversion 'none'). O navegador aplica o gAMA
 * do PNG ao desenhar o <img>: as PNG da SD258 têm gAMA = 1,0 e o Chromium as mostra
 * mais claras (118 vira 181). Quando isso acontece (`colorManaged`), a camada fica
 * visível mesmo sem realce, e a tela mostra os valores do arquivo.
 *
 * Uso:
 *   const adj = new ImageAdjust(viewer, { server: (ops, src) => `${src}?proc=clahe` });
 *   await adj.ready;
 *   adj.push({ op: 'gamma', v: 0.85 }).push({ op: 'contrast', v: 1.3 });
 *   const estado = adj.serialize();     // {version, decode, ops}
 *   outro.restore(estado);              // mesma LUT, mesmos pixels
 *   adj.setBypass(true);                // antes/depois (tecla B)
 */

import { Emitter } from './events.js';

export const ADJUST_OPS = ['levels', 'brightness', 'contrast', 'gamma', 'invert', 'clahe'];
const SERVER_OPS = new Set(['clahe']);
const IDENTITY = (() => { const l = new Uint8Array(256); for (let i = 0; i < 256; i++) l[i] = i; return l; })();

function _clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

/** A operação vem do servidor? */
export function isServerOp(o) { return !!o && (o.server === true || SERVER_OPS.has(o.op)); }

/** Aplica uma operação de cliente a v em [0, 1]. */
export function applyAdjustOp(o, v) {
    switch (o.op) {
        case 'levels': {
            const lo = Number(o.lo ?? 0) / 255, hi = Number(o.hi ?? 255) / 255;
            v = hi > lo ? (v - lo) / (hi - lo) : (v >= lo ? 1 : 0);
            break;
        }
        case 'brightness': v = v + Number(o.v ?? 0); break;
        case 'contrast': v = (v - 0.5) * Number(o.v ?? 1) + 0.5; break;
        case 'gamma': {
            const g = Number(o.v ?? 1);
            if (g > 0) v = Math.pow(_clamp01(v), 1 / g);
            break;
        }
        case 'invert': if (o.v !== false) v = 1 - v; break;
        default: return v;
    }
    return _clamp01(v);
}

/** LUT (Uint8Array de 256) das operações de cliente da pilha, na ordem. */
export function buildLut(ops) {
    const client = (ops || []).filter(o => o && !isServerOp(o) && ADJUST_OPS.includes(o.op));
    if (!client.length) return IDENTITY.slice();
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        let v = i / 255;
        for (const o of client) v = applyAdjustOp(o, v);
        lut[i] = Math.round(_clamp01(v) * 255);
    }
    return lut;
}

/** Texto curto da pilha ("" se nada muda). */
export function describeAdjust(ops) {
    const f = (x, d = 2) => Number(x).toFixed(d);
    const parts = [];
    for (const o of ops || []) {
        switch (o.op) {
            case 'clahe': parts.push(`CLAHE ${f(o.clip ?? 2, 1)} ${o.tile ?? 8}×${o.tile ?? 8}`); break;
            case 'levels': parts.push(`níveis ${o.lo ?? 0}-${o.hi ?? 255}`); break;
            case 'brightness': parts.push(`brilho ${Number(o.v) >= 0 ? '+' : ''}${f(o.v ?? 0)}`); break;
            case 'contrast': parts.push(`contraste ×${f(o.v ?? 1)}`); break;
            case 'gamma': parts.push(`gama ${f(o.v ?? 1)}`); break;
            case 'invert': if (o.v !== false) parts.push('inversão'); break;
            default: parts.push(String(o.op));
        }
    }
    return parts.join(' · ');
}

export class ImageAdjust extends Emitter {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     * @param {object} [opts]
     * @param {Array<object>} [opts.ops] - Pilha inicial.
     * @param {'raw'|'browser'} [opts.decode='raw'] - Valores do arquivo ou os do navegador.
     * @param {(serverOps: object[], src: string) => string} [opts.server] - URL da versão
     *        processada no servidor (CLAHE). Sem ela, as operações de servidor ficam inativas.
     * @param {string} [opts.layer='adjust'] - Nome da camada canvas.
     */
    constructor(viewer, { ops = [], decode = 'raw', server = null, layer = 'adjust', z = -1000 } = {}) {
        super();
        this.viewer = viewer;
        this._ops = _sanitize(ops);
        this._decode = decode === 'browser' ? 'browser' : 'raw';
        this._server = typeof server === 'function' ? server : null;
        this._bypass = false;
        this._base = null;           // ImageData do original
        this._serverBase = null;     // ImageData da versão do servidor
        this._serverKey = null;
        this._colorManaged = false;
        this._out = null;
        this._reasons = {};
        this._layer = viewer.layers.ensure(layer, { kind: 'canvas', z });
        this._placeLayer();
        this._layer.hide();
        this._onLoad = () => { this.ready = this._loadBase(); };
        viewer.imageElement.addEventListener('load', this._onLoad);
        /** Promise resolvida quando os pixels do original estão prontos. */
        this.ready = this._loadBase();
    }

    /* ── pilha ──────────────────────────────────────────────── */

    get ops() { return this._ops.map(o => ({ ...o })); }
    get decode() { return this._decode; }
    /** O navegador desenha o original com valores diferentes dos do arquivo (gAMA/ICC)? */
    get colorManaged() { return this._colorManaged; }
    get bypass() { return this._bypass; }
    get layer() { return this._layer; }
    /** Razões das operações inativas ({op: texto}). */
    get reasons() { return { ...this._reasons }; }

    push(op) { this._ops.push(..._sanitize([op])); this._changed('push'); return this; }

    /** Troca a pilha inteira. */
    set(ops) { this._ops = _sanitize(ops); this._changed('set'); return this; }

    /** Atualiza a operação `index` (merge de campos). */
    update(index, patch) {
        if (!this._ops[index]) return this;
        this._ops[index] = { ...this._ops[index], ...patch };
        this._changed('update');
        return this;
    }

    /**
     * Define o parâmetro de uma operação pelo nome: cria, atualiza ou remove
     * (remove com `null`). Útil para sliders: adj.setParam('gamma', 0.85).
     */
    setParam(op, value) {
        const i = this._ops.findIndex(o => o.op === op);
        if (value === null || value === undefined || value === false) {
            if (i >= 0) { this._ops.splice(i, 1); this._changed('remove'); }
            return this;
        }
        const patch = typeof value === 'object' ? value : (op === 'invert' ? {} : { v: Number(value) });
        if (i >= 0) this._ops[i] = { ...this._ops[i], ...patch };
        else this._ops.push(..._sanitize([{ op, ...patch }]));
        this._changed('param');
        return this;
    }

    remove(index) { this._ops.splice(index, 1); this._changed('remove'); return this; }
    clear() { this._ops = []; this._changed('clear'); return this; }

    /** Estado JSON da pilha. */
    serialize() {
        return { version: 1, decode: this._decode, ops: this.ops };
    }

    /** Aplica um estado salvo por serialize(). */
    restore(state) {
        const ops = Array.isArray(state) ? state : (state && state.ops) || [];
        const decode = state && !Array.isArray(state) && state.decode === 'browser' ? 'browser' : 'raw';
        this._ops = _sanitize(ops);
        if (decode !== this._decode) {
            this._decode = decode;
            this.ready = this._loadBase().then(() => this._changed('restore'));
            return this;
        }
        this._changed('restore');
        return this;
    }

    /** LUT das operações de cliente. */
    lut() { return buildLut(this._ops); }

    /** A pilha não muda nada? */
    isIdentity() {
        if (this._ops.some(o => isServerOp(o))) return false;
        const lut = this.lut();
        for (let i = 0; i < 256; i++) if (lut[i] !== i) return false;
        return true;
    }

    /** Texto para o rótulo "processado" da exportação ("" se nada muda). */
    label() { return this.isIdentity() ? '' : describeAdjust(this._ops); }

    /** Antes/depois: com bypass, mostra o original (valores do arquivo). */
    setBypass(on) { this._bypass = !!on; this._apply(); this._emitChange('bypass'); return this; }
    toggleBypass() { return this.setBypass(!this._bypass); }

    /** Pixels exibidos (ImageData) — o original se nada muda. */
    pixels() {
        if (!this._base) return null;
        return this._out && this._layer.visible ? this._out : this._base;
    }

    /** Pixels do original (valores do arquivo no modo 'raw'). */
    basePixels() { return this._base; }

    destroy() {
        this.viewer.imageElement.removeEventListener('load', this._onLoad);
        this._layer.remove();
        this.removeAllListeners();
    }

    /* ── interno ────────────────────────────────────────────── */

    _placeLayer() {
        // Logo acima do <img>, abaixo de overlays antigos postos direto no container.
        const img = this.viewer.imageElement;
        if (img.nextSibling !== this._layer.el) img.after(this._layer.el);
    }

    async _loadBase() {
        const img = this.viewer.imageElement;
        if (!img.src) { this._base = null; return; }
        try { await img.decode(); } catch { /* imagem sem decode: segue */ }
        if (!img.naturalWidth) return;
        this._base = await _pixelsOf(img, this._decode);
        this._colorManaged = false;
        if (this._decode === 'raw') {
            const shown = await _pixelsOf(img, 'browser');
            this._colorManaged = !_sameSample(this._base, shown);
        }
        this._serverKey = null;
        this._serverBase = null;
        this._placeLayer();
        await this._refreshServer();
        this._apply();
        this._emitChange('load');
    }

    async _refreshServer() {
        const sops = this._ops.filter(o => isServerOp(o));
        this._reasons = {};
        if (!sops.length) { this._serverBase = null; this._serverKey = null; return; }
        if (!this._server) {
            for (const o of sops) this._reasons[o.op] = `${o.op} vem do servidor: falta a opção server`;
            this._serverBase = null;
            return;
        }
        const url = this._server(sops.map(o => ({ ...o })), this.viewer.imageElement.src);
        if (url === this._serverKey && this._serverBase) return;
        try {
            const im = await _loadImage(url);
            this._serverBase = await _pixelsOf(im, this._decode);
            this._serverKey = url;
        } catch (err) {
            for (const o of sops) this._reasons[o.op] = `servidor: ${err.message}`;
            this._serverBase = null;
            this._serverKey = null;
        }
    }

    _apply() {
        const base = this._base;
        if (!base) return;
        const serverActive = !!this._serverBase && !this._bypass;
        const src = serverActive ? this._serverBase : base;
        const lut = this._bypass ? IDENTITY : this.lut();
        const identity = lut.every((v, i) => v === i);
        const show = this._colorManaged || serverActive || !identity;
        if (!show) { this._layer.hide(); this._out = null; return; }
        const { width: w, height: h } = src;
        if (!this._out || this._out.width !== w || this._out.height !== h) this._out = new ImageData(w, h);
        const s = src.data, d = this._out.data;
        for (let i = 0; i < s.length; i += 4) {
            d[i] = lut[s[i]]; d[i + 1] = lut[s[i + 1]]; d[i + 2] = lut[s[i + 2]]; d[i + 3] = s[i + 3];
        }
        const c = this._layer.el;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        c.getContext('2d').putImageData(this._out, 0, 0);
        this._layer.show();
    }

    _changed(type) {
        const run = async () => { await this._refreshServer(); this._apply(); this._emitChange(type); };
        this.ready = (this.ready || Promise.resolve()).then(run, run);
    }

    _emitChange(type) {
        const payload = { source: 'image-adjust', type, ops: this.ops, identity: this.isIdentity(),
            label: this.label(), bypass: this._bypass, colorManaged: this._colorManaged };
        this.emit('change', payload);
        if (typeof this.viewer._emit === 'function') this.viewer._emit('change', payload);
    }
}

/* ── ajudantes ────────────────────────────────────────────────── */

function _sanitize(ops) {
    const out = [];
    for (const o of ops || []) {
        if (!o || typeof o !== 'object' || !o.op) continue;
        const c = { ...o, op: String(o.op) };
        if (c.op === 'clahe') { c.server = true; c.clip = Number(c.clip ?? 2.0); c.tile = Number(c.tile ?? 8); }
        out.push(c);
    }
    return out;
}

function _loadImage(src) {
    return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error(`falha ao carregar ${src}`));
        im.src = src;
    });
}

async function _pixelsOf(img, decode) {
    const w = img.naturalWidth, h = img.naturalHeight;
    let src = img;
    if (decode === 'raw' && typeof createImageBitmap === 'function') {
        src = await createImageBitmap(img, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    if (src !== img && typeof src.close === 'function') src.close();
    return ctx.getImageData(0, 0, w, h);
}

function _sameSample(a, b) {
    if (!a || !b || a.data.length !== b.data.length) return false;
    const n = a.data.length;
    const step = Math.max(4, 4 * Math.floor(n / 4 / 4096));
    for (let i = 0; i < n; i += step) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) return false;
    }
    return true;
}
