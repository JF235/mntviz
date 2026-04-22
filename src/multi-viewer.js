/**
 * mntviz/multi-viewer.js — N-panel synchronized viewer.
 *
 * All panels show the same fingerprint image at the same coordinates.
 * When coupled mode is active, panning/zooming/rotating one panel
 * automatically applies the identical transform to all others.
 *
 * Usage:
 *   import { MultiViewer } from './mntviz/index.js';
 *   const mv = new MultiViewer('#container', {
 *     panels: [{ title: 'Darlow' }, { title: 'Mulay' }, { title: 'Stitch' }],
 *     coupled: true,
 *   });
 *   await mv.loadImages(['/img1.png', '/img1.png', '/img1.png']);
 *   mv.getViewer(0).svgLayer  // SVG group for panel 0
 */

import { Viewer } from './viewer.js';

const _el = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
};

export class MultiViewer {
    /**
     * @param {string|HTMLElement} hostOrSelector
     * @param {object} [options]
     * @param {Array<{title?: string}>} [options.panels=[]]
     * @param {boolean} [options.coupled=true]
     */
    constructor(hostOrSelector, { panels = [], coupled = true } = {}) {
        this._host = typeof hostOrSelector === 'string'
            ? document.querySelector(hostOrSelector)
            : hostOrSelector;
        if (!this._host) throw new Error(`MultiViewer: host not found: ${hostOrSelector}`);

        this._coupled = coupled;
        this._syncing = false;
        /** @type {Viewer[]} */
        this._viewers = [];

        this._buildDOM(panels);
    }

    /* ── Public API ──────────────────────────────────────────── */

    /** Returns the Viewer at the given panel index. */
    getViewer(idx) { return this._viewers[idx]; }

    /** All Viewer instances (read-only copy). */
    get viewers() { return [...this._viewers]; }

    /** Number of panels. */
    get length() { return this._viewers.length; }

    /** Enable or disable coupled navigation. */
    setCoupled(active) { this._coupled = !!active; }

    /** Whether coupled navigation is currently active. */
    get coupled() { return this._coupled; }

    /**
     * Load images into all panels simultaneously.
     * @param {string[]} srcs - One URL per panel; extra entries are ignored.
     */
    async loadImages(srcs) {
        const promises = srcs.map((src, i) => {
            if (i < this._viewers.length) return this._viewers[i].loadImage(src);
            return Promise.resolve();
        });
        await Promise.all(promises);
    }

    /* ── Internal ────────────────────────────────────────────── */

    _buildDOM(panels) {
        this._host.innerHTML = '';
        const container = _el('div', 'mntviz-multi-container');

        for (let i = 0; i < panels.length; i++) {
            const panel = _el('div', 'mntviz-multi-panel');

            if (panels[i].title) {
                const title = _el('div', 'mntviz-multi-title');
                title.textContent = panels[i].title;
                panel.appendChild(title);
            }

            const viewerHost = _el('div', 'mntviz-multi-viewer-host');
            panel.appendChild(viewerHost);
            container.appendChild(panel);

            const idx = i;
            const viewer = new Viewer(viewerHost, {
                minimap: false,
                onTransform: () => this._onViewerTransform(idx),
            });
            this._viewers.push(viewer);
        }

        this._host.appendChild(container);
    }

    _onViewerTransform(idx) {
        if (!this._coupled || this._syncing) return;
        this._syncing = true;
        try {
            const { scale, rotation, translateX, translateY } = this._viewers[idx].viewState;
            for (let i = 0; i < this._viewers.length; i++) {
                if (i === idx) continue;
                this._viewers[i].setScale(scale);
                this._viewers[i].setRotation(rotation);
                this._viewers[i].setTranslate(translateX, translateY);
            }
        } finally {
            this._syncing = false;
        }
    }
}
