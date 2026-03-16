/**
 * mntviz/overlay.js — Image overlay layer (heatmaps, masks, etc.).
 *
 * Usage:
 *   import { OverlayLayer } from './mntviz/index.js';
 *   const huv = new OverlayLayer(viewer.canvasContainer, { opacity: 0.7 });
 *   await huv.load('/api/get_extracted_layer?layer=huv&...');
 *   huv.toggle();
 */

export class OverlayLayer {
    /**
     * @param {HTMLElement} container - The canvas-container from Viewer.canvasContainer.
     * @param {object} [options]
     * @param {number} [options.opacity=0.7] - Default opacity when shown.
     */
    constructor(container, options = {}) {
        this._container = container;
        this._defaultOpacity = options.opacity ?? 0.7;
        this._visible = false;

        this._img = document.createElement('img');
        this._img.className = 'mntviz-overlay-layer';
        this._img.draggable = false;
        this._img.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;opacity:0;transition:opacity 0.2s;';
        if (options.insertBefore) {
            this._container.insertBefore(this._img, options.insertBefore);
        } else {
            this._container.appendChild(this._img);
        }

        // Sync size with sibling img layer
        this._resizeObserver = new ResizeObserver(() => this._syncSize());
        const baseImg = this._container.querySelector('.mntviz-img-layer');
        if (baseImg) this._resizeObserver.observe(baseImg);
    }

    /**
     * Load an overlay image (e.g. heatmap PNG, mask PNG).
     * @param {string} src - Image URL.
     * @returns {Promise<void>}
     */
    load(src) {
        return new Promise((resolve, reject) => {
            this._img.onload = () => {
                this._syncSize();
                resolve();
            };
            this._img.onerror = () => reject(new Error(`Failed to load overlay: ${src}`));
            this._img.src = src;
        });
    }

    show() {
        this._visible = true;
        this._img.style.opacity = this._defaultOpacity;
    }

    hide() {
        this._visible = false;
        this._img.style.opacity = 0;
    }

    toggle() {
        this._visible ? this.hide() : this.show();
    }

    /** @param {number} value - 0 to 1. */
    setOpacity(value) {
        this._defaultOpacity = value;
        if (this._visible) this._img.style.opacity = value;
    }

    /** Check if the overlay loaded successfully. */
    get loaded() {
        return this._img.naturalWidth > 0;
    }

    /** Clear the source and hide. */
    clear() {
        this._img.removeAttribute('src');
        this.hide();
    }

    /** Remove the overlay from DOM and clean up observers. */
    destroy() {
        this._resizeObserver.disconnect();
        this._img.remove();
    }

    _syncSize() {
        const base = this._container.querySelector('.mntviz-img-layer');
        if (!base) return;
        this._img.style.width = base.clientWidth + 'px';
        this._img.style.height = base.clientHeight + 'px';
    }
}
