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

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULTS = {
    leftMinutiae: [],
    rightMinutiae: [],
    pairs: [],
    leftTitle: null,
    rightTitle: null,
    markerColor: '#00ff00',
    rendererOptions: {},
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

        this._container.append(this._leftPanel, this._rightPanel, this._overlaySvg, this._popup);
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
            onTransform: () => this._updateSegments(),
        });
        this._rightViewer = new Viewer(this._rightHost, {
            minimap: false,
            onTransform: () => this._updateSegments(),
        });

        await Promise.all([
            this._leftViewer.loadImage(leftSrc),
            this._rightViewer.loadImage(rightSrc),
        ]);

        // Draw minutiae
        const opts = this._options;
        const rOpts = opts.rendererOptions;

        const leftRenderer = new MinutiaeRenderer(this._leftViewer.svgLayer);
        leftRenderer.draw(opts.leftMinutiae, opts.markerColor, rOpts);

        const rightRenderer = new MinutiaeRenderer(this._rightViewer.svgLayer);
        rightRenderer.draw(opts.rightMinutiae, opts.markerColor, rOpts);

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
        }

        this._bindEvents();

        // Show all segments if requested
        if (this._allSegmentsVisible) {
            this._showAllSegments();
        }
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

        // Click outside popup/markers to dismiss
        this._container.addEventListener('mousedown', (e) => {
            if (this._activePopupPairIdx < 0) return;
            if (this._popup.contains(e.target)) return;
            if (e.target.closest('.mntviz-mnt-marker')) return;
            this._hidePopup();
        }, sig);
    }

    _onSvgMouseDown(e) {
        this._mouseDownPos = { x: e.clientX, y: e.clientY };
        const marker = e.target.closest('.mntviz-mnt-marker');
        if (marker) {
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
        if (!marker) return;

        const m = minutiaDataMap.get(marker);
        if (!m) return;

        e.stopPropagation();

        // Collapse the MinutiaeInspector tooltip if expanded (we handle clicks ourselves)
        const viewer = side === 'left' ? this._leftViewer : this._rightViewer;
        if (viewer._minutiaeInspector) {
            viewer._minutiaeInspector._collapse();
        }

        this._onMarkerClick(side, m, e);
    }

    _onDblClick(e) {
        // Only toggle if the double-click was NOT on a marker
        if (e.target.closest('.mntviz-mnt-marker')) return;

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

    /* ── Segment management ───────────────────────────────── */

    _showSegment(idx) {
        if (this._segmentLines[idx]) {
            this._segmentLines[idx].style.display = '';
            this._segmentLines[idx].classList.add('mntviz-match-segment-active');
        }
        this._updateSegments();
    }

    _showAllSegments() {
        for (const line of this._segmentLines) {
            line.style.display = '';
            line.classList.remove('mntviz-match-segment-active');
        }
        this._updateSegments();
    }

    _hideAllSegments() {
        for (const line of this._segmentLines) {
            line.style.display = 'none';
            line.classList.remove('mntviz-match-segment-active');
        }
    }

    _hideActiveSegment() {
        if (this._activePopupPairIdx >= 0 && !this._allSegmentsVisible) {
            const line = this._segmentLines[this._activePopupPairIdx];
            if (line) {
                line.style.display = 'none';
                line.classList.remove('mntviz-match-segment-active');
            }
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
        }
    }

    /**
     * Convert image coordinates to container-relative pixel coords.
     */
    _imageToContainerCoords(viewer, imgX, imgY, containerRect) {
        const svgRect = viewer.svgLayer.getBoundingClientRect();
        const imgSize = viewer.imageSize;
        if (!imgSize.width || !imgSize.height) return { x: 0, y: 0 };

        const scaleX = svgRect.width / imgSize.width;
        const scaleY = svgRect.height / imgSize.height;

        return {
            x: svgRect.left - containerRect.left + imgX * scaleX,
            y: svgRect.top - containerRect.top + imgY * scaleY,
        };
    }

    /* ── Dual-patch popup ─────────────────────────────────── */

    _showDualPatchPopup(leftM, rightM, pairIdx, event) {
        this._hideActiveSegment();
        this._activePopupPairIdx = pairIdx;

        // Fields
        const pair = this._options.pairs[pairIdx];
        const color = pair.color || this._options.markerColor;
        this._popupFields.innerHTML = [
            `<span>pair:</span> <b style="color:${color}">#${pairIdx}</b>`,
            `<span>L:</span> (${Math.round(leftM.x)}, ${Math.round(leftM.y)}, ${Math.round(leftM.angle)}\u00b0)`
            + `  <span>R:</span> (${Math.round(rightM.x)}, ${Math.round(rightM.y)}, ${Math.round(rightM.angle)}\u00b0)`,
        ].join('<br>');

        // Extract and render patches
        const ps = this._options.patchSize;
        const ds = this._options.patchDisplaySize;

        this._renderOnePatch(this._leftPatchCanvas, this._leftPatchSvg, this._leftViewer, leftM, ps, ds);
        this._renderOnePatch(this._rightPatchCanvas, this._rightPatchSvg, this._rightViewer, rightM, ps, ds);

        // Show and position
        this._popup.style.display = '';
        this._popup.classList.add('mntviz-match-popup-visible');

        // Show the segment
        this._showSegment(pairIdx);

        requestAnimationFrame(() => this._positionPopup(event));
    }

    _renderOnePatch(canvas, svg, viewer, m, ps, ds) {
        const rotAngle = m.angle * (Math.PI / 180);

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
