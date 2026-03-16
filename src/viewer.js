/**
 * mntviz/viewer.js — Interactive image viewer with pan, zoom, and minimap.
 *
 * Usage:
 *   import { Viewer } from './mntviz/index.js';
 *   const v = new Viewer('#my-container');
 *   await v.loadImage('/path/to/image.png');
 *   v.svgLayer; // SVG element for renderers
 */

import { MinutiaeInspector } from './minutiae-inspector.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Viewer {
    /**
     * @param {string|HTMLElement} container - CSS selector or element.
     * @param {object} [options]
     * @param {boolean} [options.minimap=true]  - Show minimap.
     * @param {Function} [options.onResize]     - Called after internal resize.
     */
    constructor(container, options = {}) {
        this._el = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        if (!this._el) throw new Error(`mntviz: container not found: ${container}`);

        this._options = { minimap: true, ...options };
        this._view = { scale: 1, translateX: 0, translateY: 0, isDragging: false, lastX: 0, lastY: 0 };
        this._abortController = new AbortController();
        this._minutiaeInspector = null;

        this._buildDOM();
        this._bindEvents();
    }

    /* ── Public API ─────────────────────────────────────────── */

    /** The SVG overlay element. Pass this to MinutiaeRenderer / UVFieldRenderer. */
    get svgLayer() { return this._svg; }

    /** The canvas-container element. Pass this to OverlayLayer. */
    get canvasContainer() { return this._canvas; }

    /** The underlying <img> element (for pixel-level access). */
    get imageElement() { return this._img; }

    /** The viewport element (for coordinate transforms and tooltip positioning). */
    get viewport() { return this._viewport; }

    /** Natural dimensions of the loaded image. */
    get imageSize() {
        return {
            width: this._img.naturalWidth || 0,
            height: this._img.naturalHeight || 0,
        };
    }

    /**
     * Load an image and reset the view.
     * @param {string} src - Image URL.
     * @returns {Promise<void>}
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const probe = new Image();
            probe.onload = () => {
                this._img.src = src;
                if (this._minimapImg) this._minimapImg.src = src;
                if (this._minimapWrap) this._minimapWrap.style.display = 'block';
                this._syncLayers();
                this.resetView();
                resolve();
            };
            probe.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            probe.src = src;
        });
    }

    /** Clear the image and SVG layer. */
    clear() {
        this._img.removeAttribute('src');
        this._svg.innerHTML = '';
        if (this._minimapWrap) this._minimapWrap.style.display = 'none';
    }

    /** Fit the image to 95% of the viewport. */
    resetView() {
        const vw = this._viewport.clientWidth;
        const vh = this._viewport.clientHeight;
        const iw = this._img.naturalWidth || 500;
        const ih = this._img.naturalHeight || 500;

        const scale = Math.min(vw / iw, vh / ih) * 0.95;
        this._view.scale = scale;
        this._view.translateX = (vw - iw * scale) / 2;
        this._view.translateY = (vh - ih * scale) / 2;
        this._applyTransform();
    }

    /** Remove all event listeners and DOM created by this viewer. */
    destroy() {
        this.disableMinutiaeInspector();
        this._abortController.abort();
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._el.innerHTML = '';
    }

    /**
     * Enable native minutiae interaction (hover info + click patch) on this viewer.
     * @param {object} [options] - MinutiaeInspector options.
     * @returns {import('./minutiae-inspector.js').MinutiaeInspector}
     */
    enableMinutiaeInspector(options = {}) {
        if (this._minutiaeInspector) {
            this._minutiaeInspector.setOptions(options);
            this._minutiaeInspector.enable();
            return this._minutiaeInspector;
        }

        this._minutiaeInspector = new MinutiaeInspector(this, options);
        this._minutiaeInspector.enable();
        return this._minutiaeInspector;
    }

    /** Disable and detach the native minutiae inspector, if active. */
    disableMinutiaeInspector() {
        if (!this._minutiaeInspector) return;
        this._minutiaeInspector.destroy();
        this._minutiaeInspector = null;
    }

    /* ── DOM construction ───────────────────────────────────── */

    _buildDOM() {
        this._el.innerHTML = '';

        // Viewport (outermost interactive area)
        this._viewport = _el('div', 'mntviz-viewport');

        // Canvas container (transform target)
        this._canvas = _el('div', 'mntviz-canvas-container');

        // Image layer
        this._img = _el('img', 'mntviz-img-layer');
        this._img.draggable = false;

        // SVG overlay for renderers
        this._svg = document.createElementNS(SVG_NS, 'svg');
        this._svg.classList.add('mntviz-mnt-layer');

        this._canvas.append(this._img, this._svg);
        this._viewport.append(this._canvas);

        // Minimap
        if (this._options.minimap) {
            this._minimapWrap = _el('div', 'mntviz-minimap-container');
            this._minimapImg = _el('img', 'mntviz-minimap-img');
            this._minimapImg.draggable = false;
            this._minimapRect = _el('div', 'mntviz-minimap-rect');
            this._minimapWrap.append(this._minimapImg, this._minimapRect);
            this._minimapWrap.style.display = 'none';
            this._viewport.append(this._minimapWrap);
        }

        // Zoom indicator
        this._zoomWrap = _el('div', 'mntviz-zoom-controls');
        this._zoomLabel = _el('span', 'mntviz-zoom-level');
        this._zoomLabel.textContent = '100%';
        this._zoomWrap.append(this._zoomLabel);
        this._viewport.append(this._zoomWrap);

        this._el.append(this._viewport);
    }

    /* ── Event binding ──────────────────────────────────────── */

    _bindEvents() {
        const sig = { signal: this._abortController.signal };

        this._viewport.addEventListener('wheel', (e) => this._onWheel(e), { passive: false, ...sig });
        this._viewport.addEventListener('mousedown', (e) => this._onMouseDown(e), sig);
        window.addEventListener('mousemove', (e) => this._onMouseMove(e), sig);
        window.addEventListener('mouseup', () => this._onMouseUp(), sig);

        this._resizeObserver = new ResizeObserver(() => {
            this._syncLayers();
            this._updateMinimap();
            if (this._options.onResize) this._options.onResize();
        });
        this._resizeObserver.observe(this._img);
    }

    /* ── Interaction handlers ───────────────────────────────── */

    _onWheel(e) {
        if (!this._img.src) return;
        e.preventDefault();

        const intensity = 0.1;
        const delta = e.deltaY > 0 ? -intensity : intensity;
        const newScale = Math.min(Math.max(0.1, this._view.scale + delta * this._view.scale), 20);

        const rect = this._viewport.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;

        const wx = (ox - this._view.translateX) / this._view.scale;
        const wy = (oy - this._view.translateY) / this._view.scale;

        this._view.scale = newScale;
        this._view.translateX = ox - wx * newScale;
        this._view.translateY = oy - wy * newScale;

        this._applyTransform();
    }

    _onMouseDown(e) {
        if (e.button !== 0 && e.button !== 1) return;
        this._view.isDragging = true;
        this._view.lastX = e.clientX;
        this._view.lastY = e.clientY;
        this._viewport.style.cursor = 'grabbing';
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this._view.isDragging) return;
        this._view.translateX += e.clientX - this._view.lastX;
        this._view.translateY += e.clientY - this._view.lastY;
        this._view.lastX = e.clientX;
        this._view.lastY = e.clientY;
        this._applyTransform();
    }

    _onMouseUp() {
        this._view.isDragging = false;
        this._viewport.style.cursor = 'grab';
    }

    /* ── Internal rendering ─────────────────────────────────── */

    _applyTransform() {
        const { translateX: tx, translateY: ty, scale: s } = this._view;
        this._canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
        this._zoomLabel.textContent = `${Math.round(s * 100)}%`;
        this._updateMinimap();
    }

    _syncLayers() {
        const nw = this._img.naturalWidth;
        const nh = this._img.naturalHeight;
        if (!nw || !nh) return;

        this._svg.setAttribute('width', nw);
        this._svg.setAttribute('height', nh);
        this._svg.style.width = this._img.clientWidth + 'px';
        this._svg.style.height = this._img.clientHeight + 'px';
        this._svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    }

    _updateMinimap() {
        if (!this._minimapRect || !this._minimapImg) return;
        const nw = this._img.naturalWidth;
        const nh = this._img.naturalHeight;
        if (!nw || !nh) return;

        const vw = this._viewport.clientWidth;
        const vh = this._viewport.clientHeight;

        const cw = this._minimapImg.clientWidth;
        const ch = this._minimapImg.clientHeight;
        if (!cw || !ch) return;

        const imgAspect = nw / nh;
        const cAspect = cw / ch;

        let rw, rh, ox, oy;
        if (imgAspect > cAspect) {
            rw = cw; rh = cw / imgAspect; ox = 0; oy = (ch - rh) / 2;
        } else {
            rh = ch; rw = ch * imgAspect; ox = (cw - rw) / 2; oy = 0;
        }

        const visX = -this._view.translateX / this._view.scale;
        const visY = -this._view.translateY / this._view.scale;
        const visW = vw / this._view.scale;
        const visH = vh / this._view.scale;

        const rx = rw / nw;
        const ry = rh / nh;

        const left = Math.max(ox, Math.min(ox + visX * rx, ox + rw));
        const top = Math.max(oy, Math.min(oy + visY * ry, oy + rh));
        const right = Math.min(ox + rw, ox + (visX + visW) * rx);
        const bottom = Math.min(oy + rh, oy + (visY + visH) * ry);

        Object.assign(this._minimapRect.style, {
            left: `${left}px`, top: `${top}px`,
            width: `${Math.max(0, right - left)}px`,
            height: `${Math.max(0, bottom - top)}px`,
        });
    }
}

/* ── Helpers ────────────────────────────────────────────────── */

function _el(tag, className) {
    const el = document.createElement(tag);
    el.className = className;
    return el;
}
