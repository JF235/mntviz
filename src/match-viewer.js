/**
 * mntviz/match-viewer.js — Side-by-side match viewer with connecting segments.
 *
 * Usage:
 *   import { MatchViewer } from './mntviz/index.js';
 *   const mv = new MatchViewer('#container', {
 *       leftMinutiae: [...], rightMinutiae: [...],
 *       pairs: [{ leftIdx: 0, rightIdx: 0, color: '#f00', alpha: 0.6, width: 1 }, ...],
 *   });
 *   await mv.loadImages(leftSrc, rightSrc);
 */

import { Viewer } from './viewer.js';
import { MinutiaeRenderer, minutiaDataMap, createMarkerShape } from './minutiae-renderer.js';
import { SegmentsRenderer, segmentDataMap } from './segments-renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PANEL_ROTATION_SLIDER_RANGE = 180;
const PATCH_NEIGHBOR_ALPHA = 0.4;

const DEFAULTS = {
    leftMinutiae: [],
    rightMinutiae: [],
    pairs: [],
    leftSegments: [],
    rightSegments: [],
    dominantAngle: null,
    matchTransform: null,
    leftTitle: null,
    rightTitle: null,
    markerColor: '#00ff00',
    rendererOptions: {},
    segmentOptions: {},
    patchSize: 128,
    patchDisplaySize: 192,
    showSegmentsOnLoad: false,
};

export class MatchViewer {
    /**
     * @param {string|HTMLElement} container
     * @param {object} [options]
     */
    constructor(container, options = {}) {
        this._el = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        if (!this._el) throw new Error('mntviz MatchViewer: container not found');

        this._options = { ...DEFAULTS, ...options };
        this._leftViewer = null;
        this._rightViewer = null;
        this._allSegmentsVisible = this._options.showSegmentsOnLoad;
        this._activePopupPairIdx = -1;
        this._segmentLines = [];
        this._xMntPeer = null;
        this._xSegSelf = null;
        this._xSegPeer = null;
        this._xMatchLine = null;
        this._activePanelMenuSide = null;
        this._leftGhostCursor = null;
        this._rightGhostCursor = null;
        this._ghostSourceSide = null;
        this._ac = new AbortController();

        this._buildDOM();
    }

    /* ── DOM construction ─────────────────────────────────── */

    _buildDOM() {
        this._el.innerHTML = '';

        this._container = _el('div', 'mntviz-match-container');

        // Left panel
        this._leftPanel = _el('div', 'mntviz-match-panel');
        if (this._options.leftTitle) {
            const t = _el('div', 'mntviz-match-title');
            t.textContent = this._options.leftTitle;
            this._leftPanel.appendChild(t);
        }
        this._leftHost = _el('div', 'mntviz-match-viewer-host');
        this._leftPanel.appendChild(this._leftHost);
        this._buildPanelTools('left', this._leftPanel, Boolean(this._options.leftTitle));

        // Right panel
        this._rightPanel = _el('div', 'mntviz-match-panel');
        if (this._options.rightTitle) {
            const t = _el('div', 'mntviz-match-title');
            t.textContent = this._options.rightTitle;
            this._rightPanel.appendChild(t);
        }
        this._rightHost = _el('div', 'mntviz-match-viewer-host');
        this._rightPanel.appendChild(this._rightHost);
        this._buildPanelTools('right', this._rightPanel, Boolean(this._options.rightTitle));

        // Overlay SVG for segments (no viewBox — uses CSS pixel coords)
        this._overlaySvg = document.createElementNS(SVG_NS, 'svg');
        this._overlaySvg.classList.add('mntviz-match-overlay');
        this._overlaySvg.setAttribute('width', '100%');
        this._overlaySvg.setAttribute('height', '100%');

        // Popup
        this._popup = _el('div', 'mntviz-match-popup');
        this._popup.style.display = 'none';
        this._buildPopup();

        // Context menu
        this._contextMenu = _el('div', 'mntviz-context-menu');
        this._contextMenu.style.display = 'none';
        this._buildContextMenu();

        // SVG export buttons
        this._exportBtnWrap = _el('div', 'mntviz-export-btns');

        this._exportBtn = _el('button', 'mntviz-export-svg-btn');
        this._exportBtn.textContent = 'SVG';
        this._exportBtn.title = 'Download full match as SVG';
        this._exportBtn.addEventListener('click', () => this.downloadSVG());

        this._exportViewBtn = _el('button', 'mntviz-export-svg-btn');
        this._exportViewBtn.textContent = 'View';
        this._exportViewBtn.title = 'Download current view as SVG';
        this._exportViewBtn.addEventListener('click', () => this.downloadSVGView());

        this._exportBtnWrap.append(this._exportBtn, this._exportViewBtn);

        this._container.append(
            this._leftPanel,
            this._rightPanel,
            this._overlaySvg,
            this._popup,
            this._contextMenu,
            this._exportBtnWrap,
        );
        this._el.appendChild(this._container);
    }

    _buildPopup() {
        this._popupClose = _el('span', 'mntviz-match-popup-close');
        this._popupClose.textContent = '\u00d7';
        this._popupClose.addEventListener('click', (e) => {
            e.stopPropagation();
            this._hidePopup();
        });

        this._popupFields = _el('div', 'mntviz-match-popup-fields');

        this._popupPatchesWrap = _el('div', 'mntviz-match-popup-patches');

        // Left patch
        this._leftPatchWrap = _el('div', 'mntviz-match-popup-patch');
        this._leftPatchCanvas = document.createElement('canvas');
        this._leftPatchSvg = document.createElementNS(SVG_NS, 'svg');
        const leftLabel = _el('div', 'mntviz-match-popup-patch-label');
        leftLabel.textContent = 'L';
        this._leftPatchWrap.append(this._leftPatchCanvas, this._leftPatchSvg, leftLabel);

        // Right patch
        this._rightPatchWrap = _el('div', 'mntviz-match-popup-patch');
        this._rightPatchCanvas = document.createElement('canvas');
        this._rightPatchSvg = document.createElementNS(SVG_NS, 'svg');
        const rightLabel = _el('div', 'mntviz-match-popup-patch-label');
        rightLabel.textContent = 'R';
        this._rightPatchWrap.append(this._rightPatchCanvas, this._rightPatchSvg, rightLabel);

        this._popupPatchesWrap.append(this._leftPatchWrap, this._rightPatchWrap);
        this._popup.append(this._popupClose, this._popupFields, this._popupPatchesWrap);

        // Draggable popup via fields area
        this._popupFields.classList.add('mntviz-drag-handle');
        this._popupFields.addEventListener('mousedown', (e) => {
            this._dragOffset = {
                x: e.clientX - this._popup.offsetLeft,
                y: e.clientY - this._popup.offsetTop,
            };
            this._popupFields.classList.add('mntviz-dragging');

            const onMove = (ev) => {
                this._popup.style.left = `${ev.clientX - this._dragOffset.x}px`;
                this._popup.style.top = `${ev.clientY - this._dragOffset.y}px`;
            };
            const onUp = () => {
                this._popupFields.classList.remove('mntviz-dragging');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    _buildContextMenu() {
        this._contextMenuAlignBtn = _el('button', 'mntviz-context-menu-btn');
        this._contextMenuAlignBtn.type = 'button';
        this._contextMenuAlignBtn.textContent = 'Align';
        this._contextMenuAlignBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._alignSelectedSide();
            this._hideContextMenu();
        });

        this._contextMenuGhostBtn = _el('button', 'mntviz-context-menu-btn');
        this._contextMenuGhostBtn.type = 'button';
        this._contextMenuGhostBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleGhostSource(this._contextMenuSide);
            this._hideContextMenu();
        });

        this._contextMenu.append(this._contextMenuAlignBtn, this._contextMenuGhostBtn);
    }

    _buildPanelTools(side, panel, hasTitle = false) {
        const wrap = _el('div', 'mntviz-panel-tools');
        if (hasTitle) wrap.classList.add('mntviz-panel-tools-under-title');
        const gearBtn = _el('button', 'mntviz-panel-gear-btn');
        gearBtn.type = 'button';
        gearBtn.textContent = '\u2699';

        const menu = _el('div', 'mntviz-panel-menu');
        const currentValue = document.createElement('b');
        currentValue.className = 'mntviz-panel-angle-readout';
        currentValue.textContent = '+0.0\u00b0';

        const angleSlider = document.createElement('input');
        angleSlider.className = 'mntviz-panel-angle-slider';
        angleSlider.type = 'range';
        angleSlider.min = String(-PANEL_ROTATION_SLIDER_RANGE);
        angleSlider.max = String(PANEL_ROTATION_SLIDER_RANGE);
        angleSlider.step = '0.5';
        angleSlider.value = '0';

        menu.append(currentValue, angleSlider);
        wrap.append(gearBtn, menu);
        panel.appendChild(wrap);

        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePanelMenu(side);
        });
        menu.addEventListener('click', (e) => e.stopPropagation());
        angleSlider.addEventListener('input', () => {
            this._applyPanelSliderRotation(side);
        });

        this[`_${side}PanelTools`] = {
            wrap,
            gearBtn,
            menu,
            currentValue,
            angleSlider,
        };
    }

    /* ── Public API ───────────────────────────────────────── */

    /**
     * Load images into both viewers and draw minutiae.
     * @param {string} leftSrc
     * @param {string} rightSrc
     */
    async loadImages(leftSrc, rightSrc) {
        // Create viewers with onTransform to keep segments in sync
        this._leftViewer = new Viewer(this._leftHost, {
            minimap: false,
            onTransform: () => this._onViewerTransform('left'),
        });
        this._rightViewer = new Viewer(this._rightHost, {
            minimap: false,
            onTransform: () => this._onViewerTransform('right'),
        });

        await Promise.all([
            this._leftViewer.loadImage(leftSrc),
            this._rightViewer.loadImage(rightSrc),
        ]);

        // Draw minutiae
        const opts = this._options;
        const rOpts = opts.rendererOptions;

        // Intra-panel segments (SPG minutiae graph, Delaunay, etc.) are drawn
        // first so they sit under the minutiae markers. Keep references to
        // each segment's <g> wrapper indexed by pair_id for cross-highlight.
        this._leftSegEls = [];
        this._rightSegEls = [];
        this._leftSegByPair = new Map();
        this._rightSegByPair = new Map();
        this._leftSegDataByPair = new Map();
        this._rightSegDataByPair = new Map();
        if (opts.leftSegments && opts.leftSegments.length) {
            const lsr = new SegmentsRenderer(this._leftViewer.svgLayer);
            this._leftSegEls = lsr.draw(opts.leftMinutiae, opts.leftSegments, opts.segmentOptions);
            for (let i = 0; i < opts.leftSegments.length; i++) {
                const pid = opts.leftSegments[i].pair_id;
                if (pid != null) {
                    if (this._leftSegEls[i]) this._leftSegByPair.set(pid, this._leftSegEls[i]);
                    this._leftSegDataByPair.set(pid, opts.leftSegments[i]);
                }
            }
        }
        if (opts.rightSegments && opts.rightSegments.length) {
            const rsr = new SegmentsRenderer(this._rightViewer.svgLayer);
            this._rightSegEls = rsr.draw(opts.rightMinutiae, opts.rightSegments, opts.segmentOptions);
            for (let i = 0; i < opts.rightSegments.length; i++) {
                const pid = opts.rightSegments[i].pair_id;
                if (pid != null) {
                    if (this._rightSegEls[i]) this._rightSegByPair.set(pid, this._rightSegEls[i]);
                    this._rightSegDataByPair.set(pid, opts.rightSegments[i]);
                }
            }
        }

        const leftRenderer = new MinutiaeRenderer(this._leftViewer.svgLayer);
        leftRenderer.draw(opts.leftMinutiae, opts.markerColor, rOpts);

        const rightRenderer = new MinutiaeRenderer(this._rightViewer.svgLayer);
        rightRenderer.draw(opts.rightMinutiae, opts.markerColor, rOpts);

        this._leftGhostCursor = this._createGhostCursor(this._leftViewer.svgLayer);
        this._rightGhostCursor = this._createGhostCursor(this._rightViewer.svgLayer);

        // Index minutia <g> markers by pair_id so hovering one side lights
        // up the matching one on the other side.
        this._leftMntByPair = _indexMarkersByPair(this._leftViewer.svgLayer);
        this._rightMntByPair = _indexMarkersByPair(this._rightViewer.svgLayer);

        // Floating tooltip for segment hover info — anchored to the outer
        // container so it overlays both panels.
        this._segTooltip = _el('div', 'mntviz-seg-tooltip');
        this._segTooltip.style.display = 'none';
        this._container.appendChild(this._segTooltip);

        // Enable hover tooltips via MinutiaeInspector on both viewers
        this._leftViewer.enableMinutiaeInspector({
            getAllMinutiae: () => opts.leftMinutiae,
            patchMode: 'visible',
        });
        this._rightViewer.enableMinutiaeInspector({
            getAllMinutiae: () => opts.rightMinutiae,
            patchMode: 'visible',
        });

        // Build segment line elements (initially hidden)
        this._segmentLines = [];
        this._segmentHitLines = [];
        for (let i = 0; i < opts.pairs.length; i++) {
            const p = opts.pairs[i];
            const line = document.createElementNS(SVG_NS, 'line');
            line.classList.add('mntviz-match-segment');
            line.setAttribute('stroke', p.color || opts.markerColor);
            line.setAttribute('stroke-opacity', p.alpha != null ? p.alpha : 0.6);
            line.setAttribute('stroke-width', p.width != null ? p.width : 1.0);
            line.style.display = 'none';
            this._overlaySvg.appendChild(line);
            this._segmentLines.push(line);

            const hitLine = document.createElementNS(SVG_NS, 'line');
            hitLine.classList.add('mntviz-match-segment-hitbox');
            hitLine.dataset.pairIndex = String(i);
            hitLine.style.display = 'none';
            this._overlaySvg.appendChild(hitLine);
            this._segmentHitLines.push(hitLine);
        }

        this._bindEvents();

        // Show all segments if requested
        if (this._allSegmentsVisible) {
            this._showAllSegments();
        }

        this._updatePanelControls('left');
        this._updatePanelControls('right');
    }

    /**
     * Serialize the full match view as a standalone SVG string.
     * Both images, minutiae, and visible segment lines are included.
     * @param {number} [gap=4] - Pixel gap between left and right panels.
     * @returns {string} SVG markup.
     */
    exportSVG(gap = 4) {
        const lSize = this._leftViewer.imageSize;
        const rSize = this._rightViewer.imageSize;
        const totalW = lSize.width + gap + rSize.width;
        const totalH = Math.max(lSize.height, rSize.height);

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('xmlns', SVG_NS);
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svg.setAttribute('width', totalW);
        svg.setAttribute('height', totalH);
        svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

        // Helper: embed a viewer's image + minutiae into a <g>
        const embedPanel = (viewer, offsetX) => {
            const g = document.createElementNS(SVG_NS, 'g');
            if (offsetX) g.setAttribute('transform', `translate(${offsetX}, 0)`);

            // Background image
            const img = viewer.imageElement;
            if (img.src) {
                const canvas = document.createElement('canvas');
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0);
                const dataUri = canvas.toDataURL('image/png');

                const svgImg = document.createElementNS(SVG_NS, 'image');
                svgImg.setAttribute('href', dataUri);
                svgImg.setAttribute('width', w);
                svgImg.setAttribute('height', h);
                g.appendChild(svgImg);
            }

            // Minutiae layer
            const mntClone = viewer.svgLayer.cloneNode(true);
            mntClone.removeAttribute('class');
            mntClone.removeAttribute('style');
            g.appendChild(mntClone);

            return g;
        };

        svg.appendChild(embedPanel(this._leftViewer, 0));
        svg.appendChild(embedPanel(this._rightViewer, lSize.width + gap));

        // Visible segment lines (in image coordinates)
        const opts = this._options;
        const segG = document.createElementNS(SVG_NS, 'g');
        for (let i = 0; i < opts.pairs.length; i++) {
            const domLine = this._segmentLines[i];
            if (domLine.style.display === 'none') continue;

            const p = opts.pairs[i];
            const lm = opts.leftMinutiae[p.leftIdx];
            const rm = opts.rightMinutiae[p.rightIdx];

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', lm.x);
            line.setAttribute('y1', lm.y);
            line.setAttribute('x2', rm.x + lSize.width + gap);
            line.setAttribute('y2', rm.y);
            line.setAttribute('stroke', domLine.getAttribute('stroke'));
            line.setAttribute('stroke-opacity', domLine.getAttribute('stroke-opacity'));
            line.setAttribute('stroke-width', domLine.getAttribute('stroke-width'));
            line.setAttribute('stroke-linecap', 'round');
            segG.appendChild(line);
        }
        svg.appendChild(segG);

        return new XMLSerializer().serializeToString(svg);
    }

    /**
     * Download the match view as an SVG file.
     * @param {string} [filename='match.svg'] - Download filename.
     */
    downloadSVG(filename = 'match.svg') {
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
     * Serialize the currently visible viewport of both panels as SVG.
     * @param {number} [gap=4] - Pixel gap between panels.
     * @returns {string} SVG markup.
     */
    exportSVGView(gap = 4) {
        const lRegion = this._leftViewer.visibleRegion();
        const rRegion = this._rightViewer.visibleRegion();
        const lVpW = this._leftViewer.viewport.clientWidth;
        const lVpH = this._leftViewer.viewport.clientHeight;
        const rVpW = this._rightViewer.viewport.clientWidth;
        const rVpH = this._rightViewer.viewport.clientHeight;
        const totalW = lVpW + gap + rVpW;
        const totalH = Math.max(lVpH, rVpH);

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('xmlns', SVG_NS);
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svg.setAttribute('width', totalW);
        svg.setAttribute('height', totalH);
        svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

        // Helper: embed a viewer's visible region as a nested <svg> with viewBox clipping
        const embedView = (viewer, region, vpW, vpH, offsetX) => {
            const nested = document.createElementNS(SVG_NS, 'svg');
            nested.setAttribute('x', offsetX);
            nested.setAttribute('y', 0);
            nested.setAttribute('width', vpW);
            nested.setAttribute('height', vpH);
            nested.setAttribute('viewBox', `${region.x} ${region.y} ${region.w} ${region.h}`);

            // Background image
            const img = viewer.imageElement;
            if (img.src) {
                const canvas = document.createElement('canvas');
                const nw = img.naturalWidth;
                const nh = img.naturalHeight;
                canvas.width = nw;
                canvas.height = nh;
                canvas.getContext('2d').drawImage(img, 0, 0);

                const svgImg = document.createElementNS(SVG_NS, 'image');
                svgImg.setAttribute('href', canvas.toDataURL('image/png'));
                svgImg.setAttribute('width', nw);
                svgImg.setAttribute('height', nh);
                nested.appendChild(svgImg);
            }

            // Minutiae
            const mntClone = viewer.svgLayer.cloneNode(true);
            mntClone.removeAttribute('class');
            mntClone.removeAttribute('style');
            while (mntClone.firstChild) nested.appendChild(mntClone.firstChild);

            return nested;
        };

        svg.appendChild(embedView(this._leftViewer, lRegion, lVpW, lVpH, 0));
        svg.appendChild(embedView(this._rightViewer, rRegion, rVpW, rVpH, lVpW + gap));

        // Visible segment lines — convert image coords to combined SVG pixel coords
        const opts = this._options;
        const segG = document.createElementNS(SVG_NS, 'g');
        for (let i = 0; i < opts.pairs.length; i++) {
            const domLine = this._segmentLines[i];
            if (domLine.style.display === 'none') continue;

            const p = opts.pairs[i];
            const lm = opts.leftMinutiae[p.leftIdx];
            const rm = opts.rightMinutiae[p.rightIdx];

            // Map image coords → pixel coords in the combined SVG
            const x1 = (lm.x - lRegion.x) / lRegion.w * lVpW;
            const y1 = (lm.y - lRegion.y) / lRegion.h * lVpH;
            const x2 = lVpW + gap + (rm.x - rRegion.x) / rRegion.w * rVpW;
            const y2 = (rm.y - rRegion.y) / rRegion.h * rVpH;

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', domLine.getAttribute('stroke'));
            line.setAttribute('stroke-opacity', domLine.getAttribute('stroke-opacity'));
            line.setAttribute('stroke-width', domLine.getAttribute('stroke-width'));
            line.setAttribute('stroke-linecap', 'round');
            segG.appendChild(line);
        }
        svg.appendChild(segG);

        return new XMLSerializer().serializeToString(svg);
    }

    /**
     * Download the current view as an SVG file.
     * @param {string} [filename='match_view.svg'] - Download filename.
     */
    downloadSVGView(filename = 'match_view.svg') {
        const svg = this.exportSVGView();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    destroy() {
        this._ac.abort();
        if (this._leftViewer) this._leftViewer.destroy();
        if (this._rightViewer) this._rightViewer.destroy();
        this._el.innerHTML = '';
    }

    /* ── Event binding ────────────────────────────────────── */

    _bindEvents() {
        const sig = { signal: this._ac.signal };

        // Click on markers in left SVG
        this._leftViewer.svgLayer.addEventListener('mousedown', (e) => this._onSvgMouseDown(e), sig);
        this._leftViewer.svgLayer.addEventListener('mouseup', (e) => this._onSvgMouseUp(e, 'left'), sig);

        // Click on markers in right SVG
        this._rightViewer.svgLayer.addEventListener('mousedown', (e) => this._onSvgMouseDown(e), sig);
        this._rightViewer.svgLayer.addEventListener('mouseup', (e) => this._onSvgMouseUp(e, 'right'), sig);

        // Double-click on either viewport to toggle all segments
        this._leftViewer.viewport.addEventListener('dblclick', (e) => this._onDblClick(e), sig);
        this._rightViewer.viewport.addEventListener('dblclick', (e) => this._onDblClick(e), sig);

        // Cross-panel highlight on hover — minutiae and segments.
        this._leftViewer.svgLayer.addEventListener('mouseover', (e) => this._onHoverIn(e, 'left'), sig);
        this._leftViewer.svgLayer.addEventListener('mouseout',  (e) => this._onHoverOut(e, 'left'), sig);
        this._rightViewer.svgLayer.addEventListener('mouseover', (e) => this._onHoverIn(e, 'right'), sig);
        this._rightViewer.svgLayer.addEventListener('mouseout',  (e) => this._onHoverOut(e, 'right'), sig);
        this._leftViewer.viewport.addEventListener('mousemove', (e) => this._onViewportPointerMove(e, 'left'), sig);
        this._rightViewer.viewport.addEventListener('mousemove', (e) => this._onViewportPointerMove(e, 'right'), sig);
        this._overlaySvg.addEventListener('mousemove', (e) => this._onOverlayPointerMove(e), sig);
        this._container.addEventListener('mouseleave', () => {
            this._hideGhostCursor();
        }, sig);
        for (const line of this._segmentHitLines) {
            line.addEventListener('mouseover', (e) => this._onMatchLineHoverIn(e), sig);
            line.addEventListener('mouseout', (e) => this._onMatchLineHoverOut(e), sig);
            line.addEventListener('mousemove', (e) => this._onOverlayPointerMove(e), sig);
        }

        // Context menu for side-specific actions.
        this._leftViewer.viewport.addEventListener('contextmenu', (e) => this._onContextMenu(e, 'left'), sig);
        this._rightViewer.viewport.addEventListener('contextmenu', (e) => this._onContextMenu(e, 'right'), sig);
        window.addEventListener('click', () => {
            this._hideContextMenu();
            this._hidePanelMenus();
        }, sig);
        window.addEventListener('blur', () => {
            this._hideContextMenu();
            this._hidePanelMenus();
        }, sig);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._hideContextMenu();
                this._hidePanelMenus();
            }
        }, sig);
    }

    _onViewerTransform(side) {
        this._updateSegments();
        this._updatePanelControls(side);
    }

    /* ── Cross-panel hover highlighting ───────────────────── */

    _onHoverIn(e, side) {
        // Minutia hover → highlight paired minutia on the opposite side.
        const marker = e.target.closest('.mntviz-mnt-marker');
        if (marker) {
            this._clearCrossMinutiaHighlight();
            const m = minutiaDataMap.get(marker);
            if (m && m._pairIndex != null && m._pairIndex >= 0) {
                const otherMap = side === 'left' ? this._rightMntByPair : this._leftMntByPair;
                const peer = otherMap.get(m._pairIndex);
                if (peer) {
                    peer.classList.add('mntviz-mnt-cross-highlighted');
                    peer.parentNode?.appendChild(peer);
                }
                this._xMntPeer = peer || null;
            }
            return;
        }

        // Segment hover → highlight this segment + paired segment, show info.
        const seg = e.target.closest('.mntviz-segment-marker');
        if (seg) {
            this._clearSegmentHighlights();
            const data = segmentDataMap.get(seg);
            if (!data) return;
            seg.classList.add('mntviz-seg-highlighted');
            seg.parentNode?.appendChild(seg);
            this._xSegSelf = seg;
            if (data.pair_id != null) {
                const otherMap = side === 'left' ? this._rightSegByPair : this._leftSegByPair;
                const peer = otherMap.get(data.pair_id);
                if (peer) {
                    peer.classList.add('mntviz-seg-cross-highlighted');
                    peer.parentNode?.appendChild(peer);
                    this._xSegPeer = peer;
                }
            }
            this._showSegTooltip(data, e);
        }
    }

    _onHoverOut(e, side) {
        const marker = e.target.closest('.mntviz-mnt-marker');
        if (marker) {
            this._clearCrossMinutiaHighlight();
        }
        const seg = e.target.closest('.mntviz-segment-marker');
        if (seg) {
            this._clearSegmentHighlights();
            this._hideSegTooltip();
        }
    }

    _onHoverMove(e) {
        if (this._segTooltip && this._segTooltip.style.display !== 'none') {
            this._positionSegTooltip(e);
        }
    }

    _onViewportPointerMove(e, side) {
        this._onHoverMove(e);
        if (side === this._ghostSourceSide) {
            this._updateGhostCursor(side, e);
        } else {
            this._hideGhostCursor();
        }
    }

    _onOverlayPointerMove(e) {
        this._onHoverMove(e);
        const side = this._inferPointerSide(e.clientX, e.clientY);
        if (side === this._ghostSourceSide) {
            this._updateGhostCursor(side, e);
        } else {
            this._hideGhostCursor();
        }
    }

    _onMatchLineHoverIn(e) {
        const hitLine = e.currentTarget;
        const pairIdx = Number(hitLine?.dataset?.pairIndex);
        if (!Number.isInteger(pairIdx) || pairIdx < 0) return;
        const pair = this._options.pairs[pairIdx];
        if (!pair) return;
        const line = this._segmentLines[pairIdx];
        if (!line) return;
        line.classList.add('mntviz-match-segment-hovered');
        this._xMatchLine = line;
        this._showMatchLineTooltip(pairIdx, e);
    }

    _onMatchLineHoverOut() {
        if (this._xMatchLine) {
            this._xMatchLine.classList.remove('mntviz-match-segment-hovered');
            this._xMatchLine = null;
        }
        this._hideSegTooltip();
    }

    _showSegTooltip(data, event) {
        const parts = [];
        if (data.pair_id != null) {
            parts.push(`<span>pair:</span> <b style="color:${data.color || '#fff'}">#${data.pair_id}</b>`);
        }
        parts.push(`<span>m1:</span> ${data.m1}  <span>m2:</span> ${data.m2}`);
        parts.push(..._formatSegmentMetaLines(data.label, 'seg'));
        parts.push(..._formatSegmentMetaLines(data.info, 'info'));
        this._segTooltip.innerHTML = parts.join('<br>');
        this._segTooltip.style.display = '';
        this._positionSegTooltip(event);
    }

    _showMatchLineTooltip(pairIdx, event) {
        const pair = this._options.pairs[pairIdx];
        if (!pair) return;
        const parts = [
            `<span>pair:</span> <b style="color:${pair.color || '#fff'}">#${pairIdx}</b>`,
            `<span>L idx:</span> ${pair.leftIdx}  <span>R idx:</span> ${pair.rightIdx}`,
        ];
        if (_isFiniteNumber(pair.similarity)) {
            parts.push(`<span>sim:</span> ${_fmtSimilarity(pair.similarity)}`);
        }
        this._segTooltip.innerHTML = parts.join('<br>');
        this._segTooltip.style.display = '';
        this._positionSegTooltip(event);
    }

    _positionSegTooltip(event) {
        const rect = this._container.getBoundingClientRect();
        const x = event.clientX - rect.left + 12;
        const y = event.clientY - rect.top + 12;
        const w = this._segTooltip.offsetWidth;
        const h = this._segTooltip.offsetHeight;
        const left = Math.min(rect.width - w - 4, x);
        const top  = Math.min(rect.height - h - 4, y);
        this._segTooltip.style.left = `${Math.max(0, left)}px`;
        this._segTooltip.style.top  = `${Math.max(0, top)}px`;
    }

    _hideSegTooltip() {
        if (this._segTooltip) this._segTooltip.style.display = 'none';
    }

    _inferPointerSide(clientX, clientY) {
        const leftRect = this._leftViewer?.viewport?.getBoundingClientRect();
        if (leftRect && _pointInRect(clientX, clientY, leftRect)) return 'left';
        const rightRect = this._rightViewer?.viewport?.getBoundingClientRect();
        if (rightRect && _pointInRect(clientX, clientY, rightRect)) return 'right';
        return null;
    }

    _createGhostCursor(svgRoot) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.classList.add('mntviz-ghost-cursor');
        g.style.display = 'none';

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('r', '4');
        circle.setAttribute('cx', '0');
        circle.setAttribute('cy', '0');
        g.append(circle);
        svgRoot.appendChild(g);
        return g;
    }

    _updateGhostCursor(side, event) {
        const sourceViewer = side === 'left' ? this._leftViewer : this._rightViewer;
        const targetSide = side === 'left' ? 'right' : 'left';
        const { x, y } = sourceViewer.screenToImageCoords(event.clientX, event.clientY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            this._hideGhostCursor(targetSide);
            return;
        }

        const sourceSize = sourceViewer.imageSize;
        if (x < 0 || y < 0 || x > sourceSize.width || y > sourceSize.height) {
            this._hideGhostCursor(targetSide);
            return;
        }

        const mapped = this._mapMatchPoint(side, x, y);
        if (!mapped) {
            this._hideGhostCursor(targetSide);
            return;
        }

        const targetViewer = side === 'left' ? this._rightViewer : this._leftViewer;
        const targetSize = targetViewer.imageSize;
        if (
            mapped.x < 0 || mapped.y < 0
            || mapped.x > targetSize.width || mapped.y > targetSize.height
        ) {
            this._hideGhostCursor(targetSide);
            return;
        }

        this._showGhostCursor(targetSide, mapped.x, mapped.y);
    }

    _mapMatchPoint(side, x, y) {
        const t = this._options.matchTransform;
        if (!t) return null;
        const angle = Number(t.angle);
        const tx = Number(t.tx);
        const ty = Number(t.ty);
        if (!Number.isFinite(angle) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;

        const rad = angle * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        if (side === 'right') {
            return {
                x: x * cos + y * sin + tx,
                y: -x * sin + y * cos + ty,
            };
        }

        const ux = x - tx;
        const uy = y - ty;
        return {
            x: ux * cos - uy * sin,
            y: ux * sin + uy * cos,
        };
    }

    _showGhostCursor(side, x, y) {
        const ghost = side === 'left' ? this._leftGhostCursor : this._rightGhostCursor;
        if (!ghost) return;
        ghost.style.display = '';
        ghost.setAttribute('transform', `translate(${x} ${y})`);
    }

    _hideGhostCursor(side = null) {
        const cursors = side === 'left'
            ? [this._leftGhostCursor]
            : side === 'right'
                ? [this._rightGhostCursor]
                : [this._leftGhostCursor, this._rightGhostCursor];
        for (const ghost of cursors) {
            if (!ghost) continue;
            ghost.style.display = 'none';
        }
    }

    _onContextMenu(e, side) {
        e.preventDefault();
        e.stopPropagation();
        this._showContextMenu(e, side);
    }

    _showContextMenu(event, side) {
        this._contextMenuSide = side;
        const hasAngle = Number.isFinite(this._options.dominantAngle);
        this._contextMenuAlignBtn.disabled = !hasAngle;
        this._updateContextMenuButtons(side);

        this._contextMenu.style.display = '';
        const rect = this._container.getBoundingClientRect();
        const menuW = this._contextMenu.offsetWidth;
        const menuH = this._contextMenu.offsetHeight;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const left = Math.min(Math.max(4, x), Math.max(4, rect.width - menuW - 4));
        const top = Math.min(Math.max(4, y), Math.max(4, rect.height - menuH - 4));
        this._contextMenu.style.left = `${left}px`;
        this._contextMenu.style.top = `${top}px`;
    }

    _hideContextMenu() {
        if (!this._contextMenu) return;
        this._contextMenu.style.display = 'none';
        this._contextMenuSide = null;
    }

    _updateContextMenuButtons(side) {
        if (!this._contextMenuGhostBtn) return;
        const enabled = side != null && this._ghostSourceSide === side;
        this._contextMenuGhostBtn.textContent = `${enabled ? '\u2713 ' : ''}Ghost`;
    }

    _toggleGhostSource(side) {
        if (side !== 'left' && side !== 'right') return;
        this._ghostSourceSide = this._ghostSourceSide === side ? null : side;
        this._hideGhostCursor();
    }

    _togglePanelMenu(side) {
        const tools = this[`_${side}PanelTools`];
        if (!tools) return;
        if (this._activePanelMenuSide === side && tools.wrap.classList.contains('mntviz-open')) {
            this._hidePanelMenus();
            return;
        }
        this._hidePanelMenus(side);
        this._updatePanelControls(side);
        tools.wrap.classList.add('mntviz-open');
        tools.gearBtn.classList.add('mntviz-open');
        this._activePanelMenuSide = side;
    }

    _hidePanelMenus(exceptSide = null) {
        for (const side of ['left', 'right']) {
            if (side === exceptSide) continue;
            const tools = this[`_${side}PanelTools`];
            if (!tools) continue;
            tools.wrap.classList.remove('mntviz-open');
            tools.gearBtn.classList.remove('mntviz-open');
        }
        if (!exceptSide) this._activePanelMenuSide = null;
    }

    _updatePanelControls(side) {
        const tools = this[`_${side}PanelTools`];
        const viewer = side === 'left' ? this._leftViewer : this._rightViewer;
        if (!tools || !viewer) return;

        const rot = viewer.viewState.rotation || 0;
        tools.currentValue.textContent = `${rot >= 0 ? '+' : ''}${rot.toFixed(1)}\u00b0`;
        tools.angleSlider.value = String(rot);
    }

    _applyPanelSliderRotation(side) {
        const tools = this[`_${side}PanelTools`];
        if (!tools) return;
        const sliderValue = Number(tools.angleSlider.value);
        if (!Number.isFinite(sliderValue)) return;
        this._setSideRotation(side, sliderValue);
    }

    _setSideRotation(side, angle) {
        const viewer = side === 'left' ? this._leftViewer : this._rightViewer;
        viewer?.setRotation(angle);
        this._updatePanelControls(side);
    }

    _rotateSideBy(side, delta) {
        const viewer = side === 'left' ? this._leftViewer : this._rightViewer;
        viewer?.rotateBy(delta);
        this._updatePanelControls(side);
    }

    _alignSelectedSide() {
        if (!this._contextMenuSide) return;
        this._alignSide(this._contextMenuSide);
    }

    _alignSide(side) {
        if (!Number.isFinite(this._options.dominantAngle)) return;
        const angle = this._options.dominantAngle;
        if (side === 'left') {
            const rightRot = this._rightViewer?.viewState.rotation || 0;
            this._leftViewer?.setRotation(rightRot + angle);
            this._updatePanelControls('left');
        } else if (side === 'right') {
            const leftRot = this._leftViewer?.viewState.rotation || 0;
            this._rightViewer?.setRotation(leftRot - angle);
            this._updatePanelControls('right');
        }
    }

    _clearCrossMinutiaHighlight() {
        if (!this._xMntPeer) return;
        this._xMntPeer.classList.remove('mntviz-mnt-cross-highlighted');
        this._xMntPeer = null;
    }

    _clearSegmentHighlights() {
        if (this._xSegSelf) this._xSegSelf.classList.remove('mntviz-seg-highlighted');
        if (this._xSegPeer) this._xSegPeer.classList.remove('mntviz-seg-cross-highlighted');
        this._xSegSelf = null;
        this._xSegPeer = null;
    }

    _onSvgMouseDown(e) {
        this._mouseDownPos = { x: e.clientX, y: e.clientY };
        const marker = e.target.closest('.mntviz-mnt-marker');
        const segment = e.target.closest('.mntviz-segment-marker');
        if (marker || segment) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    _onSvgMouseUp(e, side) {
        if (!this._mouseDownPos) return;
        const dx = e.clientX - this._mouseDownPos.x;
        const dy = e.clientY - this._mouseDownPos.y;
        this._mouseDownPos = null;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return; // drag, not click

        const marker = e.target.closest('.mntviz-mnt-marker');
        const viewer = side === 'left' ? this._leftViewer : this._rightViewer;
        if (marker) {
            const m = minutiaDataMap.get(marker);
            if (!m) return;

            e.stopPropagation();

            // Collapse the MinutiaeInspector tooltip if expanded (we handle clicks ourselves)
            if (viewer._minutiaeInspector) {
                viewer._minutiaeInspector._collapse();
            }

            this._onMarkerClick(side, m, e);
            return;
        }

        const segment = e.target.closest('.mntviz-segment-marker');
        if (!segment) return;

        const data = segmentDataMap.get(segment);
        if (!data) return;

        e.stopPropagation();
        if (viewer._minutiaeInspector) {
            viewer._minutiaeInspector._collapse();
        }
        this._onSegmentClick(side, data, e);
    }

    _onDblClick(e) {
        // Only toggle if the double-click was NOT on a marker
        if (e.target.closest('.mntviz-mnt-marker') || e.target.closest('.mntviz-segment-marker')) return;

        this._allSegmentsVisible = !this._allSegmentsVisible;

        if (this._allSegmentsVisible) {
            this._showAllSegments();
        } else {
            this._hideAllSegments();
        }

        // Hide popup on double-click
        this._hidePopup();
    }

    /* ── Marker click → segment + dual patch popup ────────── */

    _onMarkerClick(side, minutia, event) {
        const pairIdx = minutia._pairIndex;

        // Unpaired minutia: let the default inspector handle it
        if (pairIdx == null || pairIdx < 0) return;

        const pair = this._options.pairs[pairIdx];
        if (!pair) return;

        const leftM = this._options.leftMinutiae[pair.leftIdx];
        const rightM = this._options.rightMinutiae[pair.rightIdx];

        // Show this pair's segment
        this._showSegment(pairIdx);
        this._updateSegments();

        // Show dual-patch popup
        this._showDualPatchPopup(leftM, rightM, pairIdx, event);
    }

    _onSegmentClick(side, segment, event) {
        const pairIdx = segment.pair_id;
        if (pairIdx != null && pairIdx >= 0) {
            this._showSegment(pairIdx);
            this._updateSegments();
        }
        this._showSegmentMetadataPopup(side, segment, event);
    }

    /* ── Segment management ───────────────────────────────── */

    _showSegment(idx) {
        if (this._segmentLines[idx]) {
            this._segmentLines[idx].style.display = '';
            this._segmentLines[idx].classList.add('mntviz-match-segment-active');
        }
        if (this._segmentHitLines[idx]) {
            this._segmentHitLines[idx].style.display = '';
        }
        this._updateSegments();
    }

    _showAllSegments() {
        for (let i = 0; i < this._segmentLines.length; i++) {
            const line = this._segmentLines[i];
            line.style.display = '';
            line.classList.remove('mntviz-match-segment-active');
            if (this._segmentHitLines[i]) this._segmentHitLines[i].style.display = '';
        }
        this._updateSegments();
    }

    _hideAllSegments() {
        for (let i = 0; i < this._segmentLines.length; i++) {
            const line = this._segmentLines[i];
            line.style.display = 'none';
            line.classList.remove('mntviz-match-segment-active');
            if (this._segmentHitLines[i]) this._segmentHitLines[i].style.display = 'none';
        }
    }

    _hideActiveSegment() {
        if (this._activePopupPairIdx >= 0 && !this._allSegmentsVisible) {
            const line = this._segmentLines[this._activePopupPairIdx];
            const hitLine = this._segmentHitLines[this._activePopupPairIdx];
            if (line) {
                line.style.display = 'none';
                line.classList.remove('mntviz-match-segment-active');
            }
            if (hitLine) hitLine.style.display = 'none';
        } else if (this._activePopupPairIdx >= 0 && this._allSegmentsVisible) {
            const line = this._segmentLines[this._activePopupPairIdx];
            if (line) line.classList.remove('mntviz-match-segment-active');
        }
    }

    /**
     * Recompute all visible segment positions.
     * Called on every pan/zoom via onTransform callback.
     */
    _updateSegments() {
        if (!this._segmentLines.length || !this._leftViewer || !this._rightViewer) return;
        const containerRect = this._container.getBoundingClientRect();
        const pairs = this._options.pairs;

        for (let i = 0; i < pairs.length; i++) {
            const line = this._segmentLines[i];
            const hitLine = this._segmentHitLines[i];
            if (line.style.display === 'none') continue;

            const p = pairs[i];
            const lm = this._options.leftMinutiae[p.leftIdx];
            const rm = this._options.rightMinutiae[p.rightIdx];

            const lp = this._imageToContainerCoords(this._leftViewer, lm.x, lm.y, containerRect);
            const rp = this._imageToContainerCoords(this._rightViewer, rm.x, rm.y, containerRect);

            line.setAttribute('x1', lp.x);
            line.setAttribute('y1', lp.y);
            line.setAttribute('x2', rp.x);
            line.setAttribute('y2', rp.y);
            if (hitLine) {
                hitLine.setAttribute('x1', lp.x);
                hitLine.setAttribute('y1', lp.y);
                hitLine.setAttribute('x2', rp.x);
                hitLine.setAttribute('y2', rp.y);
            }
        }
    }

    /**
     * Convert image coordinates to container-relative pixel coords.
     */
    _imageToContainerCoords(viewer, imgX, imgY, containerRect) {
        return viewer.imageToElementCoords(imgX, imgY, this._container);
    }

    /* ── Dual-patch popup ─────────────────────────────────── */

    _showDualPatchPopup(leftM, rightM, pairIdx, event) {
        this._hideActiveSegment();
        this._activePopupPairIdx = pairIdx;

        // Fields
        const pair = this._options.pairs[pairIdx];
        const color = pair.color || this._options.markerColor;
        const lines = [
            `<span>pair:</span> <b style="color:${color}">#${pairIdx}</b>`,
            `<span>L:</span> (${Math.round(leftM.x)}, ${Math.round(leftM.y)}, ${Math.round(leftM.angle)}\u00b0)`
            + `  <span>R:</span> (${Math.round(rightM.x)}, ${Math.round(rightM.y)}, ${Math.round(rightM.angle)}\u00b0)`,
        ];
        if (_isFiniteNumber(pair.similarity)) {
            lines.push(`<span>sim:</span> ${_fmtSimilarity(pair.similarity)}`);
        }
        this._popupFields.innerHTML = lines.join('<br>');

        // Extract and render patches
        const ps = this._options.patchSize;
        const ds = this._options.patchDisplaySize;

        this._renderOnePatch(
            this._leftPatchCanvas,
            this._leftPatchSvg,
            this._leftViewer,
            leftM,
            this._options.leftMinutiae,
            ps,
            ds,
        );
        this._renderOnePatch(
            this._rightPatchCanvas,
            this._rightPatchSvg,
            this._rightViewer,
            rightM,
            this._options.rightMinutiae,
            ps,
            ds,
        );

        // Show and position
        this._popupPatchesWrap.style.display = '';
        this._popup.style.display = '';
        this._popup.classList.add('mntviz-match-popup-visible');

        // Show the segment
        this._showSegment(pairIdx);

        requestAnimationFrame(() => this._positionPopup(event));
    }

    _showSegmentMetadataPopup(side, segment, event) {
        const pairIdx = segment.pair_id;
        this._hideActiveSegment();
        this._activePopupPairIdx = (pairIdx != null && pairIdx >= 0) ? pairIdx : -1;

        const leftSeg = pairIdx != null && pairIdx >= 0
            ? (this._leftSegDataByPair.get(pairIdx) || (side === 'left' ? segment : null))
            : (side === 'left' ? segment : null);
        const rightSeg = pairIdx != null && pairIdx >= 0
            ? (this._rightSegDataByPair.get(pairIdx) || (side === 'right' ? segment : null))
            : (side === 'right' ? segment : null);

        const color = pairIdx != null && pairIdx >= 0
            ? (this._options.pairs[pairIdx]?.color || segment.color || this._options.markerColor)
            : (segment.color || this._options.markerColor);
        const meta = leftSeg || rightSeg || segment;
        const lines = [];

        if (pairIdx != null && pairIdx >= 0) {
            lines.push(`<span>pair:</span> <b style="color:${color}">#${pairIdx}</b>`);
        }

        if (leftSeg && rightSeg) {
            lines.push(`<span>L seg:</span> ${_fmtIndex(leftSeg.idx)}  <span>R seg:</span> ${_fmtIndex(rightSeg.idx)}`);
            lines.push(`<span>L m1:</span> ${leftSeg.m1}  <span>L m2:</span> ${leftSeg.m2}`);
            lines.push(`<span>R m1:</span> ${rightSeg.m1}  <span>R m2:</span> ${rightSeg.m2}`);
            if (_isFiniteNumber(leftSeg.len) || _isFiniteNumber(rightSeg.len)) {
                lines.push(`<span>L len:</span> ${_fmtNumber(leftSeg.len)}  <span>R len:</span> ${_fmtNumber(rightSeg.len)}`);
            }
            if (_isFiniteNumber(leftSeg.slope) || _isFiniteNumber(rightSeg.slope)) {
                lines.push(`<span>L th:</span> ${_fmtAngle(leftSeg.slope)}  <span>R th:</span> ${_fmtAngle(rightSeg.slope)}`);
            }
        } else {
            const localKey = side === 'left' ? 'L' : 'R';
            lines.push(`<span>${localKey} seg:</span> ${_fmtIndex(segment.idx)}`);
            lines.push(`<span>m1:</span> ${segment.m1}  <span>m2:</span> ${segment.m2}`);
            if (_isFiniteNumber(segment.len)) lines.push(`<span>len:</span> ${_fmtNumber(segment.len)}`);
            if (_isFiniteNumber(segment.slope)) lines.push(`<span>th:</span> ${_fmtAngle(segment.slope)}`);
        }

        if (leftSeg && rightSeg && (
            _isFiniteNumber(leftSeg.a1) || _isFiniteNumber(rightSeg.a1)
            || _isFiniteNumber(leftSeg.a2) || _isFiniteNumber(rightSeg.a2)
        )) {
            lines.push(`<span>L a1:</span> ${_fmtAngle(leftSeg.a1)}  <span>R a1:</span> ${_fmtAngle(rightSeg.a1)}`);
            lines.push(`<span>L a2:</span> ${_fmtAngle(leftSeg.a2)}  <span>R a2:</span> ${_fmtAngle(rightSeg.a2)}`);
        } else if (_isFiniteNumber(meta.a1) || _isFiniteNumber(meta.a2)) {
            lines.push(`<span>a1:</span> ${_fmtAngle(meta.a1)}  <span>a2:</span> ${_fmtAngle(meta.a2)}`);
        }
        if (_isFiniteNumber(meta.dtheta) || _isFiniteNumber(meta.da1) || _isFiniteNumber(meta.da2)) {
            lines.push(
                `<span>dth:</span> ${_fmtAngle(meta.dtheta)}  `
                + `<span>da1:</span> ${_fmtAngle(meta.da1)}  `
                + `<span>da2:</span> ${_fmtAngle(meta.da2)}`
            );
        }
        if (meta.inverted != null) {
            lines.push(`<span>inv:</span> ${meta.inverted ? 'yes' : 'no'}`);
        }

        this._popupFields.innerHTML = lines.join('<br>');
        this._popupPatchesWrap.style.display = 'none';
        this._popup.style.display = '';
        this._popup.classList.add('mntviz-match-popup-visible');

        if (pairIdx != null && pairIdx >= 0) {
            this._showSegment(pairIdx);
        }

        requestAnimationFrame(() => this._positionPopup(event));
    }

    _renderOnePatch(canvas, svg, viewer, m, allMinutiae, ps, ds) {
        const rotAngle = m.angle * (Math.PI / 180);
        const cos = Math.cos(rotAngle);
        const sin = Math.sin(rotAngle);

        // Extract patch from image
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = ps;
        tmpCanvas.height = ps;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.translate(ps / 2, ps / 2);
        tmpCtx.rotate(rotAngle);
        tmpCtx.drawImage(viewer.imageElement, -m.x, -m.y);

        // Draw onto display canvas
        canvas.width = ps;
        canvas.height = ps;
        canvas.style.width = `${ds}px`;
        canvas.style.height = `${ds}px`;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tmpCanvas, 0, 0);

        // SVG overlay: draw the minutia marker at center (direction = 0° in patch)
        svg.setAttribute('viewBox', `0 0 ${ps} ${ps}`);
        svg.innerHTML = '';

        const color = m._color || this._options.markerColor;
        const shape = m._shape || this._options.rendererOptions.markerShape || 'circle';

        for (const other of allMinutiae || []) {
            if (other === m) continue;

            const dx = other.x - m.x;
            const dy = other.y - m.y;
            const px = dx * cos - dy * sin + ps / 2;
            const py = dx * sin + dy * cos + ps / 2;
            if (px < 0 || px > ps || py < 0 || py > ps) continue;

            const pa = ((other.angle - m.angle) % 360 + 360) % 360;
            const otherColor = other._color || this._options.markerColor;
            const otherShape = other._shape || this._options.rendererOptions.markerShape || 'circle';
            this._drawPatchMarker(svg, px, py, pa, otherColor, PATCH_NEIGHBOR_ALPHA, otherShape);
        }

        this._drawPatchMarker(svg, ps / 2, ps / 2, 0, color, 1.0, shape);
    }

    _drawPatchMarker(svg, x, y, angleDeg, color, opacity, shape = 'circle') {
        const r = 3;
        const segLen = 7;
        const rad = angleDeg * (Math.PI / 180);
        const xEnd = x + segLen * Math.cos(rad);
        const yEnd = y - segLen * Math.sin(rad);

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('opacity', opacity);
        g.setAttribute('stroke', color);
        g.setAttribute('fill', 'none');
        g.setAttribute('stroke-width', '1');

        const marker = createMarkerShape(shape, x, y, r);
        g.appendChild(marker);

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', y);
        line.setAttribute('x2', xEnd);
        line.setAttribute('y2', yEnd);
        g.appendChild(line);

        svg.appendChild(g);
    }

    _positionPopup(event) {
        const containerRect = this._container.getBoundingClientRect();
        const tipW = this._popup.offsetWidth;
        const tipH = this._popup.offsetHeight;

        // Position near the click event
        const clickX = event.clientX - containerRect.left;
        const clickY = event.clientY - containerRect.top;

        let left = clickX + 15;
        let top = clickY - tipH / 2;

        if (left + tipW > containerRect.width) left = clickX - tipW - 15;
        if (left < 5) left = 5;
        if (top < 5) top = 5;
        if (top + tipH > containerRect.height - 5) top = containerRect.height - tipH - 5;

        this._popup.style.left = `${left}px`;
        this._popup.style.top = `${top}px`;
    }

    _hidePopup() {
        this._hideActiveSegment();
        this._activePopupPairIdx = -1;
        this._hideGhostCursor();
        this._popup.classList.remove('mntviz-match-popup-visible');
        this._popup.style.display = 'none';
    }
}

/* ── Helpers ────────────────────────────────────────────── */

function _el(tag, className) {
    const el = document.createElement(tag);
    el.className = className;
    return el;
}

function _isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function _fmtNumber(value, digits = 1) {
    return _isFiniteNumber(value) ? value.toFixed(digits) : '-';
}

function _fmtAngle(value, digits = 1) {
    return _isFiniteNumber(value) ? `${value.toFixed(digits)}\u00b0` : '-';
}

function _fmtIndex(value) {
    return _isFiniteNumber(value) ? `#${Math.round(value)}` : '-';
}

function _fmtSimilarity(value, digits = 3) {
    return _isFiniteNumber(value) ? value.toFixed(digits) : '-';
}

function _escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function _normalizeSegmentMetaKey(key, fallback) {
    const normalized = String(key)
        .trim()
        .toLowerCase()
        .replaceAll('α₁', 'a1')
        .replaceAll('α₂', 'a2')
        .replaceAll('α1', 'a1')
        .replaceAll('α2', 'a2');
    return normalized || fallback;
}

function _formatSegmentMetaLines(raw, fallbackKey) {
    if (raw == null) return [];

    const text = String(raw).trim();
    if (!text) return [];

    const chunks = text
        .split(/\s{2,}|<br\s*\/?>/i)
        .map(part => part.trim())
        .filter(Boolean);

    const lines = [];
    for (const chunk of (chunks.length ? chunks : [text])) {
        const segMatch = chunk.match(/^seg\s*#\s*(\d+)$/i);
        if (segMatch) {
            lines.push(`<span>seg:</span> #${_escapeHtml(segMatch[1])}`);
            continue;
        }

        const kvMatches = Array.from(
            chunk.matchAll(/([^\s:=]+)\s*=\s*(.+?)(?=\s+[^\s:=]+\s*=|$)/gu)
        );
        if (kvMatches.length) {
            for (const [, rawKey, rawValue] of kvMatches) {
                const key = _normalizeSegmentMetaKey(rawKey, fallbackKey);
                lines.push(`<span>${_escapeHtml(key)}:</span> ${_escapeHtml(rawValue.trim())}`);
            }
            continue;
        }

        lines.push(`<span>${_escapeHtml(fallbackKey)}:</span> ${_escapeHtml(chunk)}`);
    }

    return lines;
}

function _pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Walk an SVG layer and index minutia <g> markers by their _pairIndex. */
function _indexMarkersByPair(svgLayer) {
    const map = new Map();
    for (const el of svgLayer.querySelectorAll('.mntviz-mnt-marker')) {
        const m = minutiaDataMap.get(el);
        if (m && m._pairIndex != null && m._pairIndex >= 0) {
            map.set(m._pairIndex, el);
        }
    }
    return map;
}
