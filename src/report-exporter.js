/**
 * mntviz/report-exporter.js — Exportação para relatório: PNG na resolução nativa,
 * SVG e JSON com proveniência.
 *
 * O SVG é o exportSVG() do Viewer (imagem, camadas canvas — inclusive a do realce —
 * e camadas SVG) com os rótulos das ferramentas na vista nativa (sem a escala, a
 * rotação e o espelho da tela), mais a barra de escala calibrada pelo ppi, o rótulo
 * "PROCESSADO" quando há realce (SWGDE: exportação processada vem rotulada) e um
 * <metadata> com a proveniência. O PNG é esse SVG rasterizado no tamanho natural da
 * imagem (× scale). O JSON junta Features, pares, medidas, a pilha de realce, a vista
 * e as camadas, com o sha256 da imagem (bytes do arquivo).
 *
 * Uso:
 *   const rep = new ReportExporter(viewer, { adjust, tools: [editor, ce, ruler],
 *       ppi: 500, provenance: { user: 'perito', case: 'c-001' } });
 *   const png = await rep.exportPNG();     // Blob image/png, W×H nativos
 *   const svg = await rep.exportSVG();     // string
 *   const json = await rep.exportJSON();   // objeto
 *   await rep.download('png');             // baixa o arquivo
 */

import { scaleBarSVG } from './measure.js';
import { svgEl } from './tools.js';

/** Versão do mntviz gravada na proveniência. */
export const MNTVIZ_VERSION = '0.2.0';

export class ReportExporter {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     * @param {object} [opts]
     * @param {import('./image-adjust.js').ImageAdjust} [opts.adjust] - Realce (rótulo e pixels).
     * @param {Array<object>} [opts.tools] - FeatureEditor, CorrespondenceEditor, Ruler, RidgeCount...
     * @param {number} [opts.ppi=500]
     * @param {object} [opts.provenance] - Campos do host (usuário, caso, engine, versão...).
     * @param {string} [opts.name] - Base dos nomes de arquivo.
     */
    constructor(viewer, { adjust = null, tools = [], ppi = 500, provenance = {}, name = 'mntviz',
        scaleBar = true, labelProcessed = true } = {}) {
        this.viewer = viewer;
        this._o = { adjust, tools: [...tools], ppi, provenance: { ...provenance }, name, scaleBar, labelProcessed };
    }

    setPpi(ppi) { this._o.ppi = Number(ppi); return this; }
    addTool(tool) { this._o.tools.push(tool); return this; }
    setProvenance(p) { this._o.provenance = { ...this._o.provenance, ...p }; return this; }

    /** SVG na vista nativa (string). */
    async exportSVG({ scaleBar = this._o.scaleBar, label = this._o.labelProcessed, metadata = true } = {}) {
        if (this._o.adjust && this._o.adjust.ready) await this._o.adjust.ready;
        const tools = this._o.tools.filter(t => t && typeof t.beginExport === 'function');
        let text;
        try {
            for (const t of tools) t.beginExport();
            text = this.viewer.exportSVG();
        } finally {
            for (const t of tools) t.endExport();
        }
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const root = doc.documentElement;
        const { width: W, height: H } = this.viewer.imageSize;
        root.setAttribute('width', W);
        root.setAttribute('height', H);
        root.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const eff = _effective(this._o.adjust);
        if (label && !eff.identity) root.appendChild(doc.importNode(_processedLabel(W, `PROCESSADO: ${eff.label}`), true));
        if (scaleBar && this._o.ppi > 0) root.appendChild(doc.importNode(scaleBarSVG(W, H, this._o.ppi), true));
        if (metadata) {
            const md = doc.createElementNS('http://www.w3.org/2000/svg', 'metadata');
            md.setAttribute('id', 'mntviz-provenance');
            md.textContent = JSON.stringify(this._provenance(null));
            root.insertBefore(md, root.firstChild);
        }
        return new XMLSerializer().serializeToString(doc);
    }

    /** PNG (Blob) no tamanho natural × scale. */
    async exportPNG({ scale = 1, ...svgOpts } = {}) {
        const canvas = await this._rasterize(scale, svgOpts);
        return new Promise((resolve, reject) => canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('mntviz: toBlob falhou'))), 'image/png'));
    }

    /** PNG como data URL. */
    async exportPNGDataURL({ scale = 1, ...svgOpts } = {}) {
        const canvas = await this._rasterize(scale, svgOpts);
        return canvas.toDataURL('image/png');
    }

    /** JSON do relatório (objeto). */
    async exportJSON({ imageHash = true } = {}) {
        const adj = this._o.adjust;
        if (adj && adj.ready) await adj.ready;
        const sha = imageHash ? await this.imageSha256() : null;
        const eff = _effective(adj);
        const out = {
            schema: 'mntviz.report/1',
            created_utc: new Date().toISOString(),
            provenance: this._provenance(sha),
            // processed/label descrevem o que está desenhado (com bypass ou sem a versão do servidor,
            // não é a pilha inteira); a pilha completa fica em `adjust`
            processed: !eff.identity,
            label: eff.label,
            view: this.viewer.getView(),
            layers: this.viewer.layers.serialize(),
            adjust: adj ? adj.serialize() : null,
            adjust_effective: adj ? { bypass: eff.bypass, identity: eff.identity, label: eff.label, ops: eff.ops,
                reasons: eff.reasons } : null,
            editors: [],
            correspondence: null,
            measurements: [],
        };
        for (const t of this._o.tools) {
            if (!t) continue;
            if (typeof t.toCorrespondence === 'function') {
                out.correspondence = { contract: t.toCorrespondence(), state: t.toJSON() };
            } else if (typeof t.toFeatures === 'function') {
                out.editors.push({ layer: t.layerName, features: t.toFeatures(), state: t.serialize() });
            } else if (typeof t.serialize === 'function') {
                out.measurements.push(t.serialize());
            }
        }
        return out;
    }

    /** sha256 (hex) dos bytes da imagem do viewer, ou null se não der para ler. */
    async imageSha256() {
        const src = this.viewer.imageElement.src;
        if (!src) return null;
        try {
            const r = await fetch(src);
            if (!r.ok) return null;
            return await sha256Hex(new Uint8Array(await r.arrayBuffer()));
        } catch {
            return null;
        }
    }

    /** Baixa 'png' | 'svg' | 'json'. */
    async download(kind = 'png', filename = null) {
        let blob;
        if (kind === 'png') blob = await this.exportPNG();
        else if (kind === 'svg') blob = new Blob([await this.exportSVG()], { type: 'image/svg+xml' });
        else if (kind === 'json') blob = new Blob([JSON.stringify(await this.exportJSON(), null, 2)], { type: 'application/json' });
        else throw new Error(`mntviz ReportExporter: tipo desconhecido '${kind}'`);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || `${this._o.name}_report.${kind}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return blob;
    }

    async _rasterize(scale, svgOpts) {
        const svg = await this.exportSVG(svgOpts);
        const { width: W, height: H } = this.viewer.imageSize;
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        try {
            const img = await new Promise((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = () => reject(new Error('mntviz: falha ao rasterizar o SVG'));
                im.src = url;
            });
            const c = document.createElement('canvas');
            c.width = Math.round(W * scale);
            c.height = Math.round(H * scale);
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = scale !== 1;
            ctx.drawImage(img, 0, 0, c.width, c.height);
            return c;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    _provenance(sha) {
        const img = this.viewer.imageElement;
        const adj = this._o.adjust;
        const { width, height } = this.viewer.imageSize;
        return {
            mntviz: { version: MNTVIZ_VERSION },
            ...this._o.provenance,
            image: {
                src: img.src && img.src.startsWith('data:') ? 'data:' : img.src || null,
                width, height, ppi: this._o.ppi, sha256: sha,
                decode: adj ? adj.decode : 'browser',
                color_managed: adj ? adj.colorManaged : null,
            },
        };
    }
}

/** Estado efetivo do realce (o que está na tela); sem realce, identidade. */
function _effective(adj) {
    if (!adj) return { identity: true, label: '', ops: [], bypass: false, reasons: {} };
    if (typeof adj.effective === 'function') return adj.effective();
    const identity = adj.isIdentity();
    return { identity, label: identity ? '' : adj.label(), ops: adj.ops, bypass: !!adj.bypass, reasons: adj.reasons || {} };
}

function _processedLabel(W, text) {
    const fs = Math.max(10, Math.round(W * 0.02));
    const g = svgEl('g', { class: 'mntviz-processed-label' });
    const w = Math.min(W - 8, text.length * fs * 0.62 + 12);
    svgEl('rect', { x: 4, y: 4, width: w, height: fs + 10, fill: '#7f1d1d', 'fill-opacity': 0.85, rx: 3 }, g);
    const t = svgEl('text', { x: 10, y: fs + 7, 'font-size': fs, 'font-family': 'sans-serif', fill: '#fff' }, g);
    t.textContent = text;
    return g;
}

/* ── sha256 (crypto.subtle quando há contexto seguro; senão em JS puro) ── */

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** sha256 em JS puro (hex). */
export function sha256HexSync(bytes) {
    const ror = (x, n) => (x >>> n) | (x << (32 - n));
    const l = bytes.length;
    const total = ((l + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[l] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(l / 0x20000000));
    dv.setUint32(total - 4, (l << 3) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + 4 * i);
        for (let i = 16; i < 64; i++) {
            const a = W[i - 15], b = W[i - 2];
            const s0 = ror(a, 7) ^ ror(a, 18) ^ (a >>> 3);
            const s1 = ror(b, 17) ^ ror(b, 19) ^ (b >>> 10);
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let i = 0; i < 64; i++) {
            const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
            const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}

/** sha256 (hex) de bytes: crypto.subtle em contexto seguro, JS puro fora dele. */
export async function sha256Hex(bytes) {
    const c = globalThis.crypto;
    if (c && c.subtle && globalThis.isSecureContext) {
        const d = await c.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
    }
    return sha256HexSync(bytes);
}
