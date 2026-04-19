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
import { FieldProbe } from './field-probe.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Viewer {
    /**
     * @param {string|HTMLElement} container - CSS selector or element.
     * @param {object} [options]
     * @param {boolean} [options.minimap=true]  - Show minimap.
     * @param {Function} [options.onResize]     - Called after internal resize.
     * @param {Function} [options.onTransform]  - Called after every pan/zoom transform.
     */
    constructor(container, options = {}) {
        this._el = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        if (!this._el) throw new Error(`mntviz: container not found: ${container}`);

        this._options = { minimap: true, ...options };
        this._view = {
            scale: 1,
            translateX: 0,
            translateY: 0,
            rotation: 0,
            isDragging: false,
            lastX: 0,
            lastY: 0,
        };
        this._abortController = new AbortController();
        this._minutiaeInspector = null;
        this._fieldProbe = null;
        this._virtualSize = null;
        this._overlays = new Map();  // name -> { overlay, opts }

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

    /** Current view state (read-only snapshot). */
    get viewState() {
        return {
            scale: this._view.scale,
            translateX: this._view.translateX,
            translateY: this._view.translateY,
            rotation: this._view.rotation,
        };
    }

    /** Natural dimensions of the loaded image (or virtual size). */
    get imageSize() {
        const vs = this._virtualSize;
        return {
            width: vs ? vs.width : (this._img.naturalWidth || 0),
            height: vs ? vs.height : (this._img.naturalHeight || 0),
        };
    }

    /* ── Overlay registry ─────────────────────────────────────── */

    /**
     * Register an overlay layer.
     * @param {string} name - Unique key (e.g. 'Mask', 'quality|verifinger').
     * @param {import('./overlay.js').OverlayLayer} overlay
     * @param {object} [opts] - Metadata (valueMapper, group, etc.).
     */
    addOverlay(name, overlay, opts = {}) {
        this._overlays.set(name, { overlay, opts });
    }

    /** Unregister and optionally destroy an overlay. */
    removeOverlay(name, { destroy = false } = {}) {
        const entry = this._overlays.get(name);
        if (!entry) return;
        if (destroy) entry.overlay.destroy();
        this._overlays.delete(name);
    }

    /** Get a single overlay entry by name. */
    getOverlay(name) {
        return this._overlays.get(name);
    }

    /** Return all registered overlays as [{name, overlay, opts}]. */
    getOverlays() {
        return [...this._overlays].map(([name, { overlay, opts }]) => ({ name, overlay, opts }));
    }

    /** Return only visible + loaded overlays. */
    getVisibleOverlays() {
        return this.getOverlays().filter(e => e.overlay.visible && e.overlay.loaded);
    }

    /* ── Image loading ─────────────────────────────────────────── */

    /**
     * Load an image and reset the view.
     * @param {string} src - Image URL.
     * @returns {Promise<void>}
     */
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const probe = new Image();
            probe.onload = () => {
                this._virtualSize = null;
                this._img.style.width = '';
                this._img.style.height = '';
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
        this._virtualSize = null;
        if (this._minimapWrap) this._minimapWrap.style.display = 'none';
    }

    /**
     * Set a virtual viewport size without loading an image.
     * Useful for rendering minutiae-only visualizations.
     * @param {number} width  - Virtual canvas width in pixels.
     * @param {number} height - Virtual canvas height in pixels.
     */
    setViewportSize(width, height) {
        this._virtualSize = { width, height };
        this._img.removeAttribute('src');
        // Size the img element so layout and SVG sync work
        this._img.style.width = width + 'px';
        this._img.style.height = height + 'px';
        this._syncLayers();
        this.resetView();
    }

    /** Fit the image to 95% of the viewport. */
    resetView() {
        const vw = this._viewport.clientWidth;
        const vh = this._viewport.clientHeight;
        const vs = this._virtualSize;
        const iw = vs ? vs.width : (this._img.naturalWidth || 500);
        const ih = vs ? vs.height : (this._img.naturalHeight || 500);

        const scale = Math.min(vw / iw, vh / ih);
        this._view.scale = scale;
        this._view.translateX = (vw - iw * scale) / 2;
        this._view.translateY = (vh - ih * scale) / 2;
        this._view.rotation = 0;
        this._applyTransform();
    }

    /**
     * Set absolute image scale.
     * @param {number} scale
     */
    setScale(scale) {
        const nextScale = Math.min(Math.max(Number(scale), 0.1), 20);
        if (!Number.isFinite(nextScale)) return;
        this._view.scale = nextScale;
        this._applyTransform();
    }

    /**
     * Set absolute image rotation in degrees.
     * Positive values rotate clockwise on screen.
     * @param {number} angleDeg
     */
    setRotation(angleDeg) {
        this._view.rotation = _normalizeAngle180(angleDeg);
        this._applyTransform();
    }

    /**
     * Rotate the image by a relative delta in degrees.
     * @param {number} deltaDeg
     */
    rotateBy(deltaDeg) {
        this.setRotation(this._view.rotation + deltaDeg);
    }

    /**
     * Map image coordinates to viewport-relative CSS pixels.
     * Works with pan, zoom, and rotation.
     * @param {number} imgX
     * @param {number} imgY
     * @returns {{x:number, y:number}}
     */
    imageToViewportCoords(imgX, imgY) {
        return this.imageToElementCoords(imgX, imgY, this._viewport);
    }

    /**
     * Map screen/client coordinates to image coordinates.
     * Works with pan, zoom, and rotation.
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{x:number, y:number}}
     */
    screenToImageCoords(clientX, clientY) {
        const ctm = this._svg.getScreenCTM();
        if (!ctm) return { x: NaN, y: NaN };
        const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
    }

    /**
     * Map image coordinates to an arbitrary element's local CSS pixels.
     * @param {number} imgX
     * @param {number} imgY
     * @param {HTMLElement} element
     * @returns {{x:number, y:number}}
     */
    imageToElementCoords(imgX, imgY, element) {
        const ctm = this._svg.getScreenCTM();
        if (!ctm || !element) return { x: 0, y: 0 };
        const p = new DOMPoint(imgX, imgY).matrixTransform(ctm);
        const rect = element.getBoundingClientRect();
        return { x: p.x - rect.left, y: p.y - rect.top };
    }

    /**
     * Serialize the SVG layer (with background image embedded) as a standalone SVG string.
     * @returns {string} SVG markup.
     */
    exportSVG() {
        const clone = this._svg.cloneNode(true);
        clone.setAttribute('xmlns', SVG_NS);
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        clone.classList.remove('mntviz-mnt-layer');
        clone.removeAttribute('style');

        // Embed background image as a base64 <image> element
        if (this._img.src) {
            const canvas = document.createElement('canvas');
            const w = this._img.naturalWidth;
            const h = this._img.naturalHeight;
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(this._img, 0, 0);
            const dataUri = canvas.toDataURL('image/png');

            const img = document.createElementNS(SVG_NS, 'image');
            img.setAttribute('href', dataUri);
            img.setAttribute('width', w);
            img.setAttribute('height', h);
            clone.insertBefore(img, clone.firstChild);
        }

        return new XMLSerializer().serializeToString(clone);
    }

    /**
     * Download the full SVG as a file.
     * @param {string} [filename='minutiae.svg'] - Download filename.
     */
    downloadSVG(filename = 'minutiae.svg') {
        const svg = this.exportSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Return the visible image region based on current zoom/pan.
     * @returns {{ x: number, y: number, w: number, h: number }}
     */
    visibleRegion() {
        const { scale: s, translateX: tx, translateY: ty } = this._view;
        const vpW = this._viewport.clientWidth;
        const vpH = this._viewport.clientHeight;
        return { x: -tx / s, y: -ty / s, w: vpW / s, h: vpH / s };
    }

    /**
     * Serialize only the currently visible viewport region as SVG.
     * @returns {string} SVG markup.
     */
    exportSVGView() {
        const { x, y, w, h } = this.visibleRegion();
        const vpW = this._viewport.clientWidth;
        const vpH = this._viewport.clientHeight;

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('xmlns', SVG_NS);
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svg.setAttribute('width', vpW);
        svg.setAttribute('height', vpH);
        svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);

        // Background image at full size — viewBox clips it
        if (this._img.src) {
            const canvas = document.createElement('canvas');
            const nw = this._img.naturalWidth;
            const nh = this._img.naturalHeight;
            canvas.width = nw;
            canvas.height = nh;
            canvas.getContext('2d').drawImage(this._img, 0, 0);

            const img = document.createElementNS(SVG_NS, 'image');
            img.setAttribute('href', canvas.toDataURL('image/png'));
            img.setAttribute('width', nw);
            img.setAttribute('height', nh);
            svg.appendChild(img);
        }

        // Minutiae layer contents
        const mntClone = this._svg.cloneNode(true);
        mntClone.removeAttribute('class');
        mntClone.removeAttribute('style');
        // Move children into the root svg (avoid nested svg viewBox issues)
        while (mntClone.firstChild) svg.appendChild(mntClone.firstChild);

        return new XMLSerializer().serializeToString(svg);
    }

    /**
     * Download the visible viewport region as an SVG file.
     * @param {string} [filename='minutiae_view.svg'] - Download filename.
     */
    downloadSVGView(filename = 'minutiae_view.svg') {
        const svg = this.exportSVGView();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /** Remove all event listeners and DOM created by this viewer. */
    destroy() {
        this.disableMinutiaeInspector();
        this.disableFieldProbe();
        for (const [, { overlay }] of this._overlays) overlay.destroy();
        this._overlays.clear();
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

    /**
     * Enable field probe (overlay value sampling on hover, toggled via double-click).
     * @param {object} [options] - FieldProbe options.
     * @returns {import('./field-probe.js').FieldProbe}
     */
    enableFieldProbe(options = {}) {
        if (this._fieldProbe) {
            this._fieldProbe.enable();
            return this._fieldProbe;
        }
        this._fieldProbe = new FieldProbe(this, options);
        this._fieldProbe.enable();
        return this._fieldProbe;
    }

    /** Disable and detach the field probe, if active. */
    disableFieldProbe() {
        if (!this._fieldProbe) return;
        this._fieldProbe.destroy();
        this._fieldProbe = null;
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
        this._zoomField = this._buildHudField('zoom', 'mntviz-zoom-level', '%');
        this._rotationField = this._buildHudField('rot', 'mntviz-rotation-level', '°');
        this._zoomWrap.append(this._zoomField.wrap, this._rotationField.wrap);
        this._viewport.append(this._zoomWrap);

        // SVG export buttons
        this._exportBtnWrap = _el('div', 'mntviz-export-btns');

        this._exportBtn = _el('button', 'mntviz-export-svg-btn');
        this._exportBtn.textContent = 'SVG';
        this._exportBtn.title = 'Download full image as SVG';
        this._exportBtn.addEventListener('click', () => this.downloadSVG());

        this._exportViewBtn = _el('button', 'mntviz-export-svg-btn');
        this._exportViewBtn.textContent = 'View';
        this._exportViewBtn.title = 'Download current view as SVG';
        this._exportViewBtn.addEventListener('click', () => this.downloadSVGView());

        this._exportBtnWrap.append(this._exportBtn, this._exportViewBtn);
        this._viewport.append(this._exportBtnWrap);

        this._el.append(this._viewport);
    }

    /* ── Event binding ──────────────────────────────────────── */

    _bindEvents() {
        const sig = { signal: this._abortController.signal };

        this._viewport.addEventListener('wheel', (e) => this._onWheel(e), { passive: false, ...sig });
        this._viewport.addEventListener('mousedown', (e) => this._onMouseDown(e), sig);
        window.addEventListener('mousemove', (e) => this._onMouseMove(e), sig);
        window.addEventListener('mouseup', () => this._onMouseUp(), sig);
        this._bindHudField(this._zoomField.input, () => this._applyZoomInput());
        this._bindHudField(this._rotationField.input, () => this._applyRotationInput());

        this._resizeObserver = new ResizeObserver(() => {
            this._syncLayers();
            this._updateMinimap();
            if (this._options.onResize) this._options.onResize();
        });
        this._resizeObserver.observe(this._img);
    }

    /* ── Interaction handlers ───────────────────────────────── */

    _onWheel(e) {
        if (!this._img.src && !this._virtualSize) return;
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
        const { translateX: tx, translateY: ty, scale: s, rotation: r } = this._view;
        const { width, height } = this.imageSize;
        this._canvas.style.transformOrigin = `${width / 2}px ${height / 2}px`;
        this._canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s}) rotate(${r}deg)`;
        this._setHudInputValue(this._zoomField.input, `${Math.round(s * 100)}`);
        this._setHudInputValue(this._rotationField.input, _formatSignedAngle(r));
        this._updateMinimap();
        if (this._options.onTransform) this._options.onTransform();
    }

    _syncLayers() {
        const vs = this._virtualSize;
        const nw = vs ? vs.width : this._img.naturalWidth;
        const nh = vs ? vs.height : this._img.naturalHeight;
        if (!nw || !nh) return;

        this._svg.setAttribute('width', nw);
        this._svg.setAttribute('height', nh);
        const cw = vs ? vs.width : this._img.clientWidth;
        const ch = vs ? vs.height : this._img.clientHeight;
        this._canvas.style.width = `${nw}px`;
        this._canvas.style.height = `${nh}px`;
        this._svg.style.width = cw + 'px';
        this._svg.style.height = ch + 'px';
        this._svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    }

    _updateMinimap() {
        if (!this._minimapRect || !this._minimapImg) return;
        const vs = this._virtualSize;
        const nw = vs ? vs.width : this._img.naturalWidth;
        const nh = vs ? vs.height : this._img.naturalHeight;
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

    _buildHudField(prefix, fieldClass, suffix) {
        const wrap = _el('label', `mntviz-hud-field ${fieldClass}`);
        const prefixEl = _el('span', 'mntviz-hud-prefix');
        prefixEl.textContent = prefix;
        const input = document.createElement('input');
        input.className = 'mntviz-hud-input';
        input.type = 'text';
        input.inputMode = 'decimal';
        input.autocomplete = 'off';
        input.spellcheck = false;
        const suffixEl = _el('span', 'mntviz-hud-suffix');
        suffixEl.textContent = suffix;
        wrap.append(prefixEl, input, suffixEl);
        return { wrap, input };
    }

    _bindHudField(input, onCommit) {
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onCommit();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._applyTransform();
                input.blur();
            }
        });
        input.addEventListener('blur', onCommit);
    }

    _setHudInputValue(input, value) {
        if (document.activeElement === input) return;
        input.value = String(value);
    }

    _applyZoomInput() {
        const scale = _parseScaleInput(this._zoomField.input.value);
        if (scale == null) {
            this._applyTransform();
            return;
        }
        this.setScale(scale);
    }

    _applyRotationInput() {
        const angle = _parseAngleInput(this._rotationField.input.value);
        if (angle == null) {
            this._applyTransform();
            return;
        }
        this.setRotation(angle);
    }
}

/* ── Helpers ────────────────────────────────────────────────── */

function _el(tag, className) {
    const el = document.createElement(tag);
    el.className = className;
    return el;
}

function _normalizeAngle180(angle) {
    return ((Number(angle) + 180) % 360 + 360) % 360 - 180;
}

function _parseScaleInput(value) {
    const cleaned = String(value).replace('%', '').trim();
    if (!cleaned) return null;
    const percent = Number(cleaned);
    if (!Number.isFinite(percent)) return null;
    return percent / 100;
}

function _parseAngleInput(value) {
    const cleaned = String(value).replace('°', '').replace(/^rot\s*/i, '').trim();
    if (!cleaned) return null;
    const angle = Number(cleaned);
    if (!Number.isFinite(angle)) return null;
    return angle;
}

function _formatSignedAngle(angle) {
    const n = Number(angle) || 0;
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
}
