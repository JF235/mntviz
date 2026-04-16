/**
 * mntviz/overlay.js — Image overlay layer with optional client-side colormapping.
 *
 * Supports two modes:
 *  - **Grayscale + colormap** (preferred): server sends single-channel PNG,
 *    client applies a colormap LUT.  Colormap can be changed instantly.
 *  - **Pre-colored** (legacy): server sends RGBA PNG, displayed as-is.
 *
 * Usage:
 *   import { OverlayLayer } from './mntviz/index.js';
 *   const mask = new OverlayLayer(viewer.canvasContainer, {
 *       opacity: 0.5, colormap: 'RdYlGn',
 *   });
 *   await mask.load('/api/layer?layer=mask');
 *   mask.setColormap('viridis');  // instant, no re-fetch
 */

import { applyColormap } from './colormaps.js';

export class OverlayLayer {
    /**
     * @param {HTMLElement} container - The canvas-container from Viewer.canvasContainer.
     * @param {object} [options]
     * @param {number} [options.opacity=0.7] - Default opacity when shown.
     * @param {string} [options.colormap] - Colormap name (enables grayscale mode).
     */
    constructor(container, options = {}) {
        this._container = container;
        this._defaultOpacity = options.opacity ?? 0.7;
        this._visible = false;
        this._colormap = options.colormap || null;
        this._alphaMode = options.alpha || 'value';  // 'value' | 'opaque'

        // Raw grayscale data (set after load when colormap is active)
        this._rawData = null;    // Uint8ClampedArray (w * h)
        this._alphaData = null;  // Optional separate alpha (for computed overlays)
        this._rawWidth = 0;
        this._rawHeight = 0;
        this._contourLevels = null;  // array of thresholds (0-100 scale)

        // Hidden image for loading PNGs
        this._sourceImg = new Image();

        // Visible element: <canvas> for colormapped data + contour canvas on top
        this._canvas = document.createElement('canvas');
        this._canvas.className = 'mntviz-overlay-layer';
        this._canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.2s;';

        this._contourCanvas = document.createElement('canvas');
        this._contourCanvas.className = 'mntviz-overlay-layer';
        this._contourCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.2s;';

        if (options.insertBefore) {
            this._container.insertBefore(this._contourCanvas, options.insertBefore);
            this._container.insertBefore(this._canvas, this._contourCanvas);
        } else {
            this._container.appendChild(this._canvas);
            this._container.appendChild(this._contourCanvas);
        }

        // Sync size with sibling img layer
        this._resizeObserver = new ResizeObserver(() => this._syncSize());
        const baseImg = this._container.querySelector('.mntviz-img-layer');
        if (baseImg) this._resizeObserver.observe(baseImg);
    }

    /**
     * Load an overlay image.
     * If a colormap is set, the PNG is treated as grayscale and colormapped client-side.
     * @param {string} src - Image URL.
     * @returns {Promise<void>}
     */
    load(src) {
        return new Promise((resolve, reject) => {
            this._sourceImg.onload = () => {
                const w = this._sourceImg.naturalWidth;
                const h = this._sourceImg.naturalHeight;
                this._rawWidth = w;
                this._rawHeight = h;
                this._canvas.width = w;
                this._canvas.height = h;

                if (this._colormap) {
                    // Extract grayscale values and apply colormap
                    const tmpCanvas = document.createElement('canvas');
                    tmpCanvas.width = w;
                    tmpCanvas.height = h;
                    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
                    tmpCtx.drawImage(this._sourceImg, 0, 0);
                    const imgData = tmpCtx.getImageData(0, 0, w, h);
                    // For grayscale PNGs: pixel value is in the R channel (or any — they're equal)
                    this._rawData = new Uint8ClampedArray(w * h);
                    for (let i = 0; i < w * h; i++) {
                        this._rawData[i] = imgData.data[i * 4];  // R channel
                    }
                    this._applyAndDraw();
                } else {
                    // Legacy: draw RGBA PNG as-is
                    this._rawData = null;
                    const ctx = this._canvas.getContext('2d');
                    ctx.drawImage(this._sourceImg, 0, 0);
                }
                this._syncSize();
                resolve();
            };
            this._sourceImg.onerror = () => reject(new Error(`Failed to load overlay: ${src}`));
            this._sourceImg.src = src;
        });
    }

    show() {
        this._visible = true;
        this._canvas.style.opacity = this._defaultOpacity;
        this._contourCanvas.style.opacity = this._contourLevels ? 1 : 0;
    }

    hide() {
        this._visible = false;
        this._canvas.style.opacity = 0;
        this._contourCanvas.style.opacity = 0;
    }

    toggle() {
        this._visible ? this.hide() : this.show();
    }

    /** @param {number} value - 0 to 1. */
    setOpacity(value) {
        this._defaultOpacity = value;
        if (this._visible) this._canvas.style.opacity = value;
    }

    /**
     * Change the colormap (instant, no re-fetch).
     * @param {string} name - Colormap name from COLORMAP_NAMES.
     */
    setColormap(name) {
        this._colormap = name;
        if (this._rawData) this._applyAndDraw();
    }

    /**
     * Set iso-contour levels and redraw.  Pass null or [] to clear.
     * Levels are in [0, 100] scale (percentage of max value).
     * @param {number[]|null} levels
     */
    setContours(levels) {
        this._contourLevels = levels && levels.length > 0 ? levels : null;
        this._drawContours();
        if (this._visible) {
            this._contourCanvas.style.opacity = this._contourLevels ? 1 : 0;
        }
    }

    /** Check if the overlay loaded successfully. */
    get loaded() {
        return this._rawWidth > 0;
    }

    /** Whether the overlay is currently shown. */
    get visible() { return this._visible; }

    /** The visible <canvas> element. */
    get imageElement() { return this._canvas; }

    /** Raw grayscale pixel data (0-255). Null for legacy RGBA overlays. */
    get rawData() { return this._rawData; }

    /** Width of the raw data. */
    get rawWidth() { return this._rawWidth; }

    /** Height of the raw data. */
    get rawHeight() { return this._rawHeight; }

    /** Clear the source and hide. */
    clear() {
        this._rawData = null;
        this._rawWidth = 0;
        this._rawHeight = 0;
        this._canvas.width = 0;
        this._canvas.height = 0;
        this._contourCanvas.width = 0;
        this._contourCanvas.height = 0;
        this._contourLevels = null;
        this.hide();
    }

    /** Remove the overlay from DOM and clean up observers. */
    destroy() {
        this._resizeObserver.disconnect();
        this._canvas.remove();
        this._contourCanvas.remove();
    }

    /**
     * Compute this overlay from two source overlays (e.g. H_end / H_bif → MType ratio).
     *
     * The ratio ``a / (a + b)`` determines the color (0=B-dominant, 0.5=equal, 1=A-dominant).
     * The peak ``max(a, b)`` determines visibility (alpha).
     *
     * @param {OverlayLayer} overlayA - First source (e.g. H_end).
     * @param {OverlayLayer} overlayB - Second source (e.g. H_bif).
     */
    computeFromRatio(overlayA, overlayB) {
        const a = overlayA.rawData;
        const b = overlayB.rawData;
        if (!a || !b) return;

        const w = overlayA.rawWidth;
        const h = overlayA.rawHeight;
        const n = w * h;

        this._rawWidth = w;
        this._rawHeight = h;
        this._canvas.width = w;
        this._canvas.height = h;

        // Compute ratio (color) and peak (alpha)
        const ratioData = new Uint8ClampedArray(n);
        const alphaData = new Uint8ClampedArray(n);
        for (let i = 0; i < n; i++) {
            const va = a[i], vb = b[i];
            const total = va + vb;
            if (total < 3) continue;  // both near-zero → transparent
            const ratio = va / total;  // 0..1
            ratioData[i] = Math.round(ratio * 254) + 1;  // 1-255
            alphaData[i] = Math.min(Math.max(va, vb), 255);  // peak as alpha
        }

        this._rawData = ratioData;
        this._alphaData = alphaData;
        this._applyAndDraw();
        this._syncSize();
    }

    /** @private Apply colormap LUT to rawData and draw on canvas. */
    _applyAndDraw() {
        if (!this._rawData || !this._colormap) return;
        const imageData = applyColormap(
            this._rawData, this._rawWidth, this._rawHeight, this._colormap,
            { alpha: this._alphaMode, alphaData: this._alphaData || null },
        );
        const ctx = this._canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        this._drawContours();
    }

    /**
     * @private Draw iso-contour lines on the contour canvas.
     * Uses simple threshold + edge detection (binary boundary pixels).
     */
    _drawContours() {
        if (!this._rawData || !this._contourLevels) {
            this._contourCanvas.width = 0;
            this._contourCanvas.height = 0;
            return;
        }

        const w = this._rawWidth;
        const h = this._rawHeight;
        this._contourCanvas.width = w;
        this._contourCanvas.height = h;
        const ctx = this._contourCanvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);
        const px = imgData.data;
        const raw = this._rawData;

        for (const level of this._contourLevels) {
            // Convert 0-100 scale to 0-255 raw threshold
            const thresh = Math.round(level * 255 / 100);
            if (thresh <= 0) continue;

            // Find boundary pixels: pixel >= thresh but has a neighbor < thresh
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    if (raw[i] < thresh) continue;
                    // Check 4-connected neighbors
                    if (raw[i - 1] < thresh || raw[i + 1] < thresh ||
                        raw[i - w] < thresh || raw[i + w] < thresh) {
                        const pi = i * 4;
                        px[pi] = 255;      // R
                        px[pi + 1] = 255;  // G
                        px[pi + 2] = 255;  // B
                        px[pi + 3] = 230;  // A
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        this._syncSize();
    }

    /** @private */
    _syncSize() {
        const base = this._container.querySelector('.mntviz-img-layer');
        if (!base) return;
        const w = base.clientWidth + 'px';
        const h = base.clientHeight + 'px';
        this._canvas.style.width = w;
        this._canvas.style.height = h;
        this._contourCanvas.style.width = w;
        this._contourCanvas.style.height = h;
    }
}
