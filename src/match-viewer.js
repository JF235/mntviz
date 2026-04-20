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
const PATCH_NEIGHBOR_ALPHA = 0.4;
const WHEEL_ROTATION_DEG_PER_TICK = 2;

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
        this._leftGhostCursor = null;
        this._rightGhostCursor = null;
        this._ghostSourceSide = null;
        this._coupledActive = false;
        this._coupledAnchorSide = null;
        this._syncingCoupled = false;
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

        // Right panel
        this._rightPanel = _el('div', 'mntviz-match-panel');
        if (this._options.rightTitle) {
            const t = _el('div', 'mntviz-match-title');
            t.textContent = this._options.rightTitle;
            this._rightPanel.appendChild(t);
        }
        this._rightHost = _el('div', 'mntviz-match-viewer-host');
        this._rightPanel.appendChild(this._rightHost);

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

        this._contextMenuCoupledBtn = _el('button', 'mntviz-context-menu-btn');
        this._contextMenuCoupledBtn.type = 'button';
        this._contextMenuCoupledBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleCoupled(this._contextMenuSide);
            this._hideContextMenu();
        });

        this._contextMenu.append(
            this._contextMenuAlignBtn,
            this._contextMenuGhostBtn,
            this._contextMenuCoupledBtn,
        );
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

        // Embed the live CSS transform (translate · scale · rotate around the image
        // center) inside a viewport-sized nested <svg>. The nested viewBox matches
        // the viewport, so clipping happens naturally and rotation is preserved.
        const embedView = (viewer, vpW, vpH, offsetX) => {
            const nested = document.createElementNS(SVG_NS, 'svg');
            nested.setAttribute('x', offsetX);
            nested.setAttribute('y', 0);
            nested.setAttribute('width', vpW);
            nested.setAttribute('height', vpH);
            nested.setAttribute('viewBox', `0 0 ${vpW} ${vpH}`);

            const { translateX: tx, translateY: ty, scale: s, rotation: r } = viewer.viewState;
            const { width: iw, height: ih } = viewer.imageSize;
            const ox = iw / 2;
            const oy = ih / 2;

            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute(
                'transform',
                `translate(${tx}, ${ty}) scale(${s}) translate(${ox}, ${oy}) rotate(${r}) translate(${-ox}, ${-oy})`,
            );

            // Background image at natural size — transform maps it into viewport space.
            const img = viewer.imageElement;
            if (img.src) {
                const canvas = document.createElement('canvas');
                canvas.width = iw;
                canvas.height = ih;
                canvas.getContext('2d').drawImage(img, 0, 0);

                const svgImg = document.createElementNS(SVG_NS, 'image');
                svgImg.setAttribute('href', canvas.toDataURL('image/png'));
                svgImg.setAttribute('width', iw);
                svgImg.setAttribute('height', ih);
                g.appendChild(svgImg);
            }

            // Minutiae + intra-panel segments (children authored in image-natural coords).
            const mntClone = viewer.svgLayer.cloneNode(true);
            while (mntClone.firstChild) g.appendChild(mntClone.firstChild);

            nested.appendChild(g);
            return nested;
        };

        svg.appendChild(embedView(this._leftViewer, lVpW, lVpH, 0));
        svg.appendChild(embedView(this._rightViewer, rVpW, rVpH, lVpW + gap));

        // Match segment lines — endpoints live in the outer SVG and must follow
        // each panel's live transform (rotation + zoom + pan).
        const opts = this._options;
        const segG = document.createElementNS(SVG_NS, 'g');
        for (let i = 0; i < opts.pairs.length; i++) {
            const domLine = this._segmentLines[i];
            if (domLine.style.display === 'none') continue;

            const p = opts.pairs[i];
            const lm = opts.leftMinutiae[p.leftIdx];
            const rm = opts.rightMinutiae[p.rightIdx];

            const lp = this._leftViewer.imageToElementCoords(lm.x, lm.y, this._leftViewer.viewport);
            const rp = this._rightViewer.imageToElementCoords(rm.x, rm.y, this._rightViewer.viewport);

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', lp.x);
            line.setAttribute('y1', lp.y);
            line.setAttribute('x2', lVpW + gap + rp.x);
            line.setAttribute('y2', rp.y);
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

        // Ctrl + wheel rotates the panel instead of zooming.
        // Capture phase + stopImmediatePropagation preempts the Viewer's own wheel-zoom.
        this._leftViewer.viewport.addEventListener(
            'wheel',
            (e) => this._onWheelRotate(e, 'left'),
            { capture: true, passive: false, ...sig },
        );
        this._rightViewer.viewport.addEventListener(
            'wheel',
            (e) => this._onWheelRotate(e, 'right'),
            { capture: true, passive: false, ...sig },
        );

        // Context menu for side-specific actions.
        this._leftViewer.viewport.addEventListener('contextmenu', (e) => this._onContextMenu(e, 'left'), sig);
        this._rightViewer.viewport.addEventListener('contextmenu', (e) => this._onContextMenu(e, 'right'), sig);
        window.addEventListener('click', () => {
            this._hideContextMenu();
        }, sig);
        window.addEventListener('blur', () => {
            this._hideContextMenu();
        }, sig);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._hideContextMenu();
            }
        }, sig);
    }

    _onWheelRotate(e, side) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const delta = e.deltaY > 0 ? -WHEEL_ROTATION_DEG_PER_TICK : WHEEL_ROTATION_DEG_PER_TICK;
        this._rotateSideBy(side, delta);
    }

    _onViewerTransform(side) {
        if (this._coupledActive && !this._syncingCoupled) {
            // Whichever panel the user just drove becomes the transient leader;
            // sync the other side. The guard above prevents the cascade when
            // our own sync writes back through setRotation/setScale/setTranslate.
            const followerSide = side === 'left' ? 'right' : 'left';
            this._applyCoupledFollower(followerSide);
        }
        this._updateSegments();
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
        if (this._contextMenuGhostBtn) {
            const ghostOn = side != null && this._ghostSourceSide === side;
            this._contextMenuGhostBtn.textContent = `${ghostOn ? '\u2713 ' : ''}Ghost`;
        }
        if (this._contextMenuCoupledBtn) {
            this._contextMenuCoupledBtn.textContent =
                `${this._coupledActive ? '\u2713 ' : ''}Coupled`;
            this._contextMenuCoupledBtn.disabled = !_isValidMatchTransform(this._options.matchTransform);
        }
    }

    _toggleGhostSource(side) {
        if (side !== 'left' && side !== 'right') return;
        this._ghostSourceSide = this._ghostSourceSide === side ? null : side;
        this._hideGhostCursor();
    }

    _toggleCoupled(side) {
        if (side !== 'left' && side !== 'right') return;
        if (!_isValidMatchTransform(this._options.matchTransform)) return;
        if (this._coupledActive) {
            this._coupledActive = false;
            this._coupledAnchorSide = null;
            return;
        }
        this._coupledActive = true;
        this._coupledAnchorSide = side;
        // Snap the other panel to match the right-clicked (anchor) panel's framing.
        const followerSide = side === 'left' ? 'right' : 'left';
        this._applyCoupledFollower(followerSide);
    }

    /**
     * Compute the follower viewer's (tx, ty, scale, rotation) so that its
     * image-space content aligns with the anchor panel under matchTransform.
     *
     * Derivation: both viewers use F_X(p) = o_X + t_X + s_X·R(r_X)·(p − o_X)
     * with rotation around the image center. matchTransform = { α, t } maps
     * right-image → left-image via p_L = R(−α)·p_R + t (CSS rotate convention).
     * Setting F_R(p_R) = F_L(R(−α)·p_R + t) for all p_R yields:
     *   s_R = s_L,  r_R = r_L − α,
     *   t_R = (o_L − o_R) + t_L + s_L·R(r_L)·(t − o_L) + s_L·R(r_L − α)·o_R.
     * The left-as-follower case is the symmetric inverse.
     */
    _computeCoupledFollowerState(followerSide) {
        const mt = this._options.matchTransform;
        if (!_isValidMatchTransform(mt)) return null;
        if (!this._leftViewer || !this._rightViewer) return null;

        const alpha = mt.angle;
        const tm = { x: mt.tx, y: mt.ty };
        const lSize = this._leftViewer.imageSize;
        const rSize = this._rightViewer.imageSize;
        const oL = { x: lSize.width / 2, y: lSize.height / 2 };
        const oR = { x: rSize.width / 2, y: rSize.height / 2 };

        if (followerSide === 'right') {
            const s = this._leftViewer.viewState;
            const rR = s.rotation - alpha;
            const a = _rotVec(s.scale, s.rotation, { x: tm.x - oL.x, y: tm.y - oL.y });
            const b = _rotVec(s.scale, rR, oR);
            return {
                scale: s.scale,
                rotation: rR,
                tx: (oL.x - oR.x) + s.translateX + a.x + b.x,
                ty: (oL.y - oR.y) + s.translateY + a.y + b.y,
            };
        }
        if (followerSide === 'left') {
            const s = this._rightViewer.viewState;
            const rL = s.rotation + alpha;
            const a = _rotVec(s.scale, rL, { x: oL.x - tm.x, y: oL.y - tm.y });
            const b = _rotVec(s.scale, s.rotation, oR);
            return {
                scale: s.scale,
                rotation: rL,
                tx: (oR.x - oL.x) + s.translateX + a.x - b.x,
                ty: (oR.y - oL.y) + s.translateY + a.y - b.y,
            };
        }
        return null;
    }

    _applyCoupledFollower(followerSide) {
        const next = this._computeCoupledFollowerState(followerSide);
        if (!next) return;
        const follower = followerSide === 'left' ? this._leftViewer : this._rightViewer;
        if (!follower) return;

        this._syncingCoupled = true;
        try {
            follower.setRotation(next.rotation);
            follower.setScale(next.scale);
            follower.setTranslate(next.tx, next.ty);
        } finally {
            this._syncingCoupled = false;
        }
    }

    _rotateSideBy(side, delta) {
        const viewer = side === 'left' ? this._leftViewer : this._rightViewer;
        viewer?.rotateBy(delta);
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
        } else if (side === 'right') {
            const leftRot = this._leftViewer?.viewState.rotation || 0;
            this._rightViewer?.setRotation(leftRot - angle);
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

        // Prefer the clicked segment's own color — segments may use a different
        // palette from minutia pairs (e.g. distinct hues per stream).
        const pairColor = pairIdx != null && pairIdx >= 0
            ? this._options.pairs[pairIdx]?.color
            : null;
        const color = segment.color || pairColor || this._options.markerColor;
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

function _isValidMatchTransform(t) {
    return t != null
        && Number.isFinite(t.angle)
        && Number.isFinite(t.tx)
        && Number.isFinite(t.ty);
}

/** scale * R_CSS(angleDeg) * v, where R_CSS uses CW-positive screen rotation. */
function _rotVec(scale, angleDeg, v) {
    const rad = angleDeg * (Math.PI / 180);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
        x: scale * (c * v.x - s * v.y),
        y: scale * (s * v.x + c * v.y),
    };
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
