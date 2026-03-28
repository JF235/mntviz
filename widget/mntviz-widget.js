/**
 * <mntviz-widget> — Self-contained Web Component for fingerprint minutiae visualization.
 *
 * Usage:
 *   <script type="module" src="widget/mntviz-widget.js"></script>
 *
 *   <mntviz-widget style="width: 800px; height: 500px;"></mntviz-widget>
 *
 * Attributes:
 *   width   — CSS width  (default: 100%)
 *   height  — CSS height (default: 400px)
 *   color   — Default minutiae color (default: #00ff00)
 *
 * Drag-and-drop or click to load image files (.png, .jpg, .bmp, .tif, .webp)
 * and minutiae files (.min, .txt).
 */

import { Viewer } from '../src/viewer.js';
import { MinutiaeRenderer, parseMinutiaeText } from '../src/minutiae-renderer.js';

/* ── Palette for multiple minutiae layers ───────────────── */
const LAYER_COLORS = [
    '#00ff00', '#ff4444', '#44aaff', '#ffaa00',
    '#ff44ff', '#00ffcc', '#ffff44', '#aa88ff',
];

/* ── Styles (scoped inside Shadow DOM) ──────────────────── */
const WIDGET_CSS = /* css */ `
:host {
    display: block;
    width: var(--mntviz-width, 100%);
    height: var(--mntviz-height, 400px);
    contain: layout style;
}

/* ── Viewport (pan/zoom container) ──────────────────────── */

.mntviz-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    border-radius: 8px;
}
.mntviz-viewport:active { cursor: grabbing; }

.mntviz-canvas-container {
    position: relative;
    transform-origin: 0 0;
    box-shadow: 0 0 20px rgba(0,0,0,.5);
    transform: scale(1) translate(0,0);
}

.mntviz-img-layer {
    display: block;
    image-rendering: pixelated;
    pointer-events: none;
}

.mntviz-mnt-layer {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
}

.mntviz-overlay-layer {
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
    transition: opacity .2s;
}

/* minimap */
.mntviz-minimap-container {
    position: absolute; bottom: 10px; left: 10px;
    width: 150px; height: 150px;
    background: rgba(0,0,0,.5);
    border: 2px solid #fff;
    z-index: 100; display: none;
}
.mntviz-minimap-img {
    width: 100%; height: 100%;
    object-fit: contain; opacity: .7; display: block;
}
.mntviz-minimap-rect {
    position: absolute;
    border: 2px solid var(--clr-green,#6DB542);
    background: rgba(109,181,66,.15);
    pointer-events: none;
}

.mntviz-zoom-controls {
    position: absolute; bottom: 10px; right: 10px;
    background: rgba(0,0,0,.7); color: #fff;
    padding: 5px 10px; border-radius: 4px;
    font-size: 12px; pointer-events: none;
}

/* loading spinner */
.mntviz-spinner {
    border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
    border-radius: 50%; width: 30px; height: 30px;
    animation: mntviz-spin 1s linear infinite;
    position: absolute; top: 50%; left: 50%;
    margin: -15px 0 0 -15px; z-index: 200;
}
@keyframes mntviz-spin { to { transform: rotate(360deg); } }

/* inspector */
.mntviz-inspector-tooltip {
    position: absolute; z-index: 200;
    background: rgba(30,30,30,.95); color: #fff;
    border: 1px solid #555; border-radius: 6px;
    padding: 8px 10px; font-family: monospace;
    font-size: 11px; line-height: 1.5;
    pointer-events: none; white-space: nowrap;
    box-shadow: 0 2px 10px rgba(0,0,0,.5);
    opacity: 0; transition: opacity .12s;
}
.mntviz-inspector-tooltip.mntviz-inspector-visible { opacity: 1; }
.mntviz-inspector-tooltip.mntviz-inspector-expanded {
    pointer-events: auto; white-space: normal;
}
.mntviz-inspector-fields span { color: #999; }
.mntviz-inspector-patch {
    margin-top: 6px; position: relative;
    border: 1px solid #444; border-radius: 3px; overflow: hidden;
}
.mntviz-inspector-patch canvas { display: block; image-rendering: pixelated; }
.mntviz-inspector-patch svg {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%; pointer-events: none;
}
.mntviz-inspector-close {
    position: absolute; top: 2px; right: 6px;
    cursor: pointer; color: #999; font-size: 14px; line-height: 1;
}
.mntviz-inspector-close:hover { color: #fff; }

.mntviz-mnt-highlighted { filter: brightness(1.4); }

/* ── Widget-specific: drop zone & toolbar ───────────────── */

.widget-root {
    width: 100%; height: 100%;
    position: relative;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.dropzone {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: transparent;
    border: 3px dashed #bbb; border-radius: 8px;
    color: #888; cursor: pointer;
    transition: border-color .2s, background .2s;
    z-index: 50;
}
.dropzone.active {
    border-color: #6DB542; background: rgba(109,181,66,.08);
}
.dropzone.hidden { display: none; }

.dropzone-icon {
    font-size: 48px; margin-bottom: 12px;
    opacity: .6;
}
.dropzone-text {
    font-size: 14px; text-align: center;
    line-height: 1.6;
}
.dropzone-text small {
    display: block; color: #777;
    font-size: 11px; margin-top: 4px;
}

.viewer-container {
    width: 100%; height: 100%;
    display: none;
}
.viewer-container.active { display: block; }

/* Toolbar (top-right overlay) */
.toolbar {
    position: absolute; top: 8px; right: 8px;
    display: flex; gap: 6px;
    z-index: 110;
}
.toolbar button {
    background: rgba(0,0,0,.7); color: #ccc;
    border: 1px solid #555; border-radius: 4px;
    padding: 4px 10px; font-size: 12px;
    cursor: pointer; font-family: inherit;
    transition: background .15s;
}
.toolbar button:hover {
    background: rgba(0,0,0,.9); color: #fff;
}

/* Layer list (top-left overlay) */
.layer-list {
    position: absolute; top: 8px; left: 8px;
    z-index: 110;
    display: flex; flex-direction: column; gap: 4px;
}
.layer-chip {
    display: flex; align-items: center; gap: 6px;
    background: rgba(0,0,0,.7); color: #ccc;
    padding: 3px 8px; border-radius: 4px;
    font-size: 11px; font-family: monospace;
}
.layer-dot {
    width: 10px; height: 10px; border-radius: 50%;
    display: inline-block; flex-shrink: 0;
}
.layer-name {
    max-width: 140px; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
}
.layer-count { color: #888; }
.layer-remove {
    cursor: pointer; color: #888; margin-left: 4px;
    font-size: 13px;
}
.layer-remove:hover { color: #ff4444; }

/* drag overlay on viewer */
.drag-overlay {
    position: absolute; inset: 0;
    background: rgba(109,181,66,.15);
    border: 3px dashed #6DB542;
    border-radius: 8px;
    display: none; z-index: 120;
    align-items: center; justify-content: center;
    color: #6DB542; font-size: 16px;
    pointer-events: none;
}
.drag-overlay.visible {
    display: flex;
}
`;

/* ── Helper: read File as text or data-URL ──────────────── */

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsText(file);
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

/* ── File type detection ────────────────────────────────── */

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff', 'webp', 'gif']);
const MIN_EXTS = new Set(['min', 'txt', 'csv']);

function fileExt(name) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isImageFile(file) {
    return file.type.startsWith('image/') || IMAGE_EXTS.has(fileExt(file.name));
}

function isMinFile(file) {
    return MIN_EXTS.has(fileExt(file.name));
}

/* ── Custom Element ─────────────────────────────────────── */

class MntvizWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._viewer = null;
        this._renderer = null;
        this._layers = [];       // { name, minutiae, color }
        this._colorIdx = 0;
        this._defaultColor = '#00ff00';
        this._hasImage = false;
    }

    static get observedAttributes() {
        return ['width', 'height', 'color'];
    }

    connectedCallback() {
        this._defaultColor = this.getAttribute('color') || '#00ff00';

        // Apply sizing via CSS custom properties
        const w = this.getAttribute('width');
        const h = this.getAttribute('height');
        if (w) this.style.setProperty('--mntviz-width', w.includes('%') || w.includes('px') ? w : w + 'px');
        if (h) this.style.setProperty('--mntviz-height', h.includes('%') || h.includes('px') ? h : h + 'px');

        this._buildShadowDOM();
        this._bindEvents();
    }

    disconnectedCallback() {
        if (this._viewer) this._viewer.destroy();
    }

    /* ── Shadow-DOM construction ────────────────────────────── */

    _buildShadowDOM() {
        const style = document.createElement('style');
        style.textContent = WIDGET_CSS;

        const root = document.createElement('div');
        root.className = 'widget-root';
        root.innerHTML = `
            <!-- Drop zone (initial state) -->
            <div class="dropzone" part="dropzone">
                <div class="dropzone-icon">&#128270;</div>
                <div class="dropzone-text">
                    Drop image and <code>.min</code> files here<br>
                    or click to browse
                    <small>Supports: PNG, JPG, BMP, TIFF, WebP &bull; .min, .txt</small>
                </div>
                <input type="file" multiple accept="image/*,.min,.txt,.csv" style="display:none">
            </div>

            <!-- Viewer (shown after loading) -->
            <div class="viewer-container" part="viewer">
                <div class="layer-list"></div>
                <div class="toolbar">
                    <button class="btn-add" title="Add file">+ Add</button>
                    <button class="btn-reset" title="Reset view">&#x21BA; Reset</button>
                    <button class="btn-clear" title="Clear all">&#x2715; Clear</button>
                </div>
                <div class="drag-overlay">Drop files to add</div>
                <div class="viewer-root" style="width:100%;height:100%;"></div>
            </div>
        `;

        this.shadowRoot.append(style, root);

        // Cache references
        this._root = root;
        this._dropzone = root.querySelector('.dropzone');
        this._fileInput = root.querySelector('input[type=file]');
        this._viewerContainer = root.querySelector('.viewer-container');
        this._viewerRoot = root.querySelector('.viewer-root');
        this._layerList = root.querySelector('.layer-list');
        this._dragOverlay = root.querySelector('.drag-overlay');
        this._btnAdd = root.querySelector('.btn-add');
        this._btnReset = root.querySelector('.btn-reset');
        this._btnClear = root.querySelector('.btn-clear');
    }

    /* ── Events ─────────────────────────────────────────────── */

    _bindEvents() {
        const dz = this._dropzone;
        const vc = this._viewerContainer;

        // Click → open file picker
        dz.addEventListener('click', (e) => {
            if (e.target === this._fileInput) return;
            this._fileInput.click();
        });

        this._fileInput.addEventListener('change', () => {
            if (this._fileInput.files.length) {
                this._handleFiles(this._fileInput.files);
                this._fileInput.value = '';
            }
        });

        // Drag-and-drop on dropzone
        for (const evName of ['dragenter', 'dragover']) {
            dz.addEventListener(evName, (e) => { e.preventDefault(); dz.classList.add('active'); });
        }
        for (const evName of ['dragleave', 'drop']) {
            dz.addEventListener(evName, () => dz.classList.remove('active'));
        }
        dz.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) this._handleFiles(e.dataTransfer.files);
        });

        // Drag-and-drop on viewer (add more files)
        for (const evName of ['dragenter', 'dragover']) {
            vc.addEventListener(evName, (e) => {
                e.preventDefault();
                this._dragOverlay.classList.add('visible');
            });
        }
        for (const evName of ['dragleave', 'drop']) {
            vc.addEventListener(evName, () => this._dragOverlay.classList.remove('visible'));
        }
        vc.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) this._handleFiles(e.dataTransfer.files);
        });

        // Toolbar hidden file input for "Add" button
        this._addInput = document.createElement('input');
        this._addInput.type = 'file';
        this._addInput.multiple = true;
        this._addInput.accept = 'image/*,.min,.txt,.csv';
        this._addInput.style.display = 'none';
        this._root.appendChild(this._addInput);

        this._btnAdd.addEventListener('click', () => this._addInput.click());
        this._addInput.addEventListener('change', () => {
            if (this._addInput.files.length) {
                this._handleFiles(this._addInput.files);
                this._addInput.value = '';
            }
        });

        this._btnReset.addEventListener('click', () => {
            if (this._viewer) this._viewer.resetView();
        });

        this._btnClear.addEventListener('click', () => this._clearAll());
    }

    /* ── File handling ──────────────────────────────────────── */

    async _handleFiles(fileList) {
        const files = Array.from(fileList);
        const imageFiles = files.filter(isImageFile);
        const minFiles = files.filter(isMinFile);

        // Ensure viewer is initialized and visible before loading
        if (!this._viewer) this._initViewer();
        this._showViewer();

        // Small delay to let the container get layout dimensions
        await new Promise((r) => requestAnimationFrame(r));

        // Load first image found (replace existing)
        if (imageFiles.length > 0) {
            const dataUrl = await readFileAsDataURL(imageFiles[0]);
            await this._viewer.loadImage(dataUrl);
            this._hasImage = true;
        }

        // Load each .min file as a separate layer
        for (const f of minFiles) {
            const text = await readFileAsText(f);
            const minutiae = parseMinutiaeText(text);
            if (minutiae.length === 0) continue;

            const color = this._nextColor();
            this._layers.push({ name: f.name, minutiae, color });
        }

        // If no image loaded yet, set virtual viewport from minutiae bounding box
        if (!this._hasImage && this._layers.length > 0) {
            this._setViewportFromMinutiae();
        }

        // Redraw all minutiae
        this._redrawMinutiae();
    }

    _initViewer() {
        this._viewer = new Viewer(this._viewerRoot, { minimap: true });
        this._renderer = new MinutiaeRenderer(this._viewer.svgLayer);
        this._viewer.enableMinutiaeInspector();
    }

    /**
     * When no image is loaded, set a virtual viewport sized to
     * fit all minutiae so the viewer has valid dimensions.
     */
    _setViewportFromMinutiae() {
        const all = this._layers.flatMap((l) => l.minutiae);
        if (all.length === 0) return;

        let maxX = -Infinity, maxY = -Infinity;
        for (const m of all) {
            if (m.x > maxX) maxX = m.x;
            if (m.y > maxY) maxY = m.y;
        }

        // Add padding (20%, minimum 40px)
        const padX = Math.max(40, maxX * 0.2);
        const padY = Math.max(40, maxY * 0.2);
        this._viewer.setViewportSize(
            Math.ceil(maxX + padX),
            Math.ceil(maxY + padY),
        );
    }

    _nextColor() {
        // Use attribute color for first layer, then cycle palette
        if (this._colorIdx === 0 && this._defaultColor) {
            this._colorIdx++;
            return this._defaultColor;
        }
        const c = LAYER_COLORS[this._colorIdx % LAYER_COLORS.length];
        this._colorIdx++;
        return c;
    }

    _redrawMinutiae() {
        if (!this._renderer) return;
        this._renderer.clear();
        for (const layer of this._layers) {
            this._renderer.draw(layer.minutiae, layer.color, {
                markerSize: 3,
                segmentLength: 8,
                qualityAlpha: true,
                label: layer.name,
            });
        }
        this._updateLayerList();
    }

    _updateLayerList() {
        this._layerList.innerHTML = '';
        for (let i = 0; i < this._layers.length; i++) {
            const layer = this._layers[i];
            const chip = document.createElement('div');
            chip.className = 'layer-chip';
            chip.innerHTML = `
                <span class="layer-dot" style="background:${CSS.escape ? layer.color : layer.color}"></span>
                <span class="layer-name" title="${layer.name}">${layer.name}</span>
                <span class="layer-count">(${layer.minutiae.length})</span>
                <span class="layer-remove" title="Remove layer">&times;</span>
            `;
            // Sanitize the dot color separately
            chip.querySelector('.layer-dot').style.background = layer.color;

            chip.querySelector('.layer-remove').addEventListener('click', () => {
                this._layers.splice(i, 1);
                this._redrawMinutiae();
            });
            this._layerList.appendChild(chip);
        }
    }

    /* ── View switching ─────────────────────────────────────── */

    _showViewer() {
        this._dropzone.classList.add('hidden');
        this._viewerContainer.classList.add('active');
    }

    _clearAll() {
        this._layers = [];
        this._colorIdx = 0;
        this._hasImage = false;
        if (this._renderer) this._renderer.clear();
        if (this._viewer) {
            this._viewer.destroy();
            this._viewer = null;
            this._renderer = null;
            this._viewerRoot.innerHTML = '';
        }
        this._updateLayerList();
        this._dropzone.classList.remove('hidden');
        this._viewerContainer.classList.remove('active');
    }

    /* ── Public API ─────────────────────────────────────────── */

    /**
     * Programmatically load an image.
     * @param {string} src — URL or data-URI.
     */
    async loadImage(src) {
        if (!this._viewer) this._initViewer();
        await this._viewer.loadImage(src);
        this._hasImage = true;
        this._showViewer();
    }

    /**
     * Programmatically add minutiae from text.
     * @param {string} text — .min formatted text.
     * @param {object} [options]
     * @param {string} [options.name='minutiae'] — Layer name.
     * @param {string} [options.color] — CSS color.
     */
    addMinutiae(text, options = {}) {
        if (!this._viewer) this._initViewer();
        const minutiae = parseMinutiaeText(text);
        if (minutiae.length === 0) return;
        const color = options.color || this._nextColor();
        const name = options.name || 'minutiae';
        this._layers.push({ name, minutiae, color });
        this._redrawMinutiae();
        this._showViewer();
    }

    /** Clear everything and return to drop zone. */
    clear() {
        this._clearAll();
    }
}

customElements.define('mntviz-widget', MntvizWidget);
