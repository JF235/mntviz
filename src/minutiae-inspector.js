/**
 * mntviz/minutiae-inspector.js — Hover tooltip + click-to-patch inspector.
 *
 * Usage:
 *   import { Viewer, MinutiaeRenderer, MinutiaeInspector } from './mntviz/index.js';
 *   const viewer = new Viewer('#container');
 *   const renderer = new MinutiaeRenderer(viewer.svgLayer);
 *   const inspector = new MinutiaeInspector(viewer, {
 *       getAllMinutiae: () => allMinutiae,
 *   });
 *   inspector.enable();
 */

import { minutiaDataMap, createMarkerShape } from './minutiae-renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Patch overlay modes
const PATCH_MODE_NONE = 'none';
const PATCH_MODE_VISIBLE = 'visible';
const PATCH_MODE_ALL = 'all';

const DEFAULTS = {
    patchSize: 128,
    patchDisplaySize: 256,
    nearbyRadius: 64,
    markerColor: '#00ff00',
    getAllMinutiae: null,
    // Patch overlay settings
    patchMode: PATCH_MODE_VISIBLE,   // none | visible | all
    patchUseColors: true,
    patchAlphaMultiplier: 0.4,
};

export class MinutiaeInspector {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     * @param {object} [options]
     */
    constructor(viewer, options = {}) {
        this._viewer = viewer;
        this._options = { ...DEFAULTS, ...options };
        this._isExpanded = false;
        this._activeMinutia = null;
        this._activeMarkerEl = null;
        this._hoveredMarkerEl = null;
        this._ac = null;
        this._hideTimer = null;
        this._mouseDownPos = null;

        this._buildTooltip();
    }

    enable() {
        if (this._ac) this._ac.abort();
        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        const svg = this._viewer.svgLayer;

        svg.addEventListener('mouseover', (e) => this._onMouseOver(e), sig);
        svg.addEventListener('mouseout', (e) => this._onMouseOut(e), sig);
        svg.addEventListener('mousedown', (e) => this._onSvgMouseDown(e), sig);
        svg.addEventListener('mouseup', (e) => this._onSvgMouseUp(e), sig);
        this._viewer.viewport.addEventListener('mousedown', (e) => this._onViewportMouseDown(e), sig);
    }

    disable() {
        if (this._ac) { this._ac.abort(); this._ac = null; }
        this._unhighlight();
        this._hide();
    }

    setOptions(opts) {
        Object.assign(this._options, opts);
        this._rerenderPatch();
    }

    destroy() {
        this.disable();
        if (this._tooltip && this._tooltip.parentNode) {
            this._tooltip.parentNode.removeChild(this._tooltip);
        }
        this._tooltip = null;
    }

    /* ── DOM ──────────────────────────────────────────────── */

    _buildTooltip() {
        const tip = document.createElement('div');
        tip.className = 'mntviz-inspector-tooltip';

        this._fields = document.createElement('div');
        this._fields.className = 'mntviz-inspector-fields';

        this._patchWrap = document.createElement('div');
        this._patchWrap.className = 'mntviz-inspector-patch';
        this._patchWrap.style.display = 'none';

        this._patchCanvas = document.createElement('canvas');
        this._patchSvg = document.createElementNS(SVG_NS, 'svg');
        this._patchWrap.append(this._patchCanvas, this._patchSvg);

        this._closeBtn = document.createElement('span');
        this._closeBtn.className = 'mntviz-inspector-close';
        this._closeBtn.textContent = '\u00d7';
        this._closeBtn.style.display = 'none';
        this._closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._collapse();
        });

        tip.append(this._closeBtn, this._fields, this._patchWrap);
        this._tooltip = tip;
        this._viewer.viewport.appendChild(tip);

        // Draggable tooltip via fields area (only when expanded)
        this._fields.classList.add('mntviz-drag-handle');
        this._fields.addEventListener('mousedown', (e) => {
            if (!this._isExpanded) return;
            e.stopPropagation();
            this._dragOffset = {
                x: e.clientX - this._tooltip.offsetLeft,
                y: e.clientY - this._tooltip.offsetTop,
            };
            this._fields.classList.add('mntviz-dragging');

            const onMove = (ev) => {
                this._tooltip.style.left = `${ev.clientX - this._dragOffset.x}px`;
                this._tooltip.style.top = `${ev.clientY - this._dragOffset.y}px`;
            };
            const onUp = () => {
                this._fields.classList.remove('mntviz-dragging');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    /* ── Event handlers ───────────────────────────────────── */

    _onMouseOver(e) {
        const marker = e.target.closest('.mntviz-mnt-marker');
        if (!marker) return;
        if (this._isExpanded) return;
        clearTimeout(this._hideTimer);

        const m = minutiaDataMap.get(marker);
        if (!m) return;

        this._activeMinutia = m;
        this._activeMarkerEl = marker;
        this._highlight(marker);
        this._updateFields(m);
        this._patchWrap.style.display = 'none';
        this._closeBtn.style.display = 'none';
        this._tooltip.classList.remove('mntviz-inspector-expanded');
        this._positionTooltip(m.x, m.y);
        this._show();
    }

    _onMouseOut(e) {
        const marker = e.target.closest('.mntviz-mnt-marker');
        if (!marker) return;
        if (this._isExpanded) return;
        this._unhighlight();
        this._hideTimer = setTimeout(() => this._hide(), 60);
    }

    _onSvgMouseDown(e) {
        const marker = e.target.closest('.mntviz-mnt-marker');
        this._mouseDownPos = { x: e.clientX, y: e.clientY };
        // Prevent pan when clicking on a marker
        if (marker) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    _onSvgMouseUp(e) {
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
        this._expand(m, marker);
    }

    _onViewportMouseDown(e) {
        // no-op: popup is dismissed only via the close button
    }

    /* ── Highlight ────────────────────────────────────────── */

    _highlight(marker) {
        this._unhighlight();
        this._hoveredMarkerEl = marker;
        marker.classList.add('mntviz-mnt-highlighted');
        // Bring to front within its parent group
        marker.parentNode.appendChild(marker);
    }

    _unhighlight() {
        if (this._hoveredMarkerEl) {
            this._hoveredMarkerEl.classList.remove('mntviz-mnt-highlighted');
            this._hoveredMarkerEl = null;
        }
    }

    /* ── Show / hide ──────────────────────────────────────── */

    _show() {
        this._tooltip.classList.add('mntviz-inspector-visible');
    }

    _hide() {
        this._tooltip.classList.remove('mntviz-inspector-visible');
        this._tooltip.classList.remove('mntviz-inspector-expanded');
        this._isExpanded = false;
    }

    _collapse() {
        this._isExpanded = false;
        this._unhighlight();
        this._patchWrap.style.display = 'none';
        this._closeBtn.style.display = 'none';
        this._tooltip.classList.remove('mntviz-inspector-expanded');
        this._hide();
    }

    /* ── Expand with patch ────────────────────────────────── */

    _expand(m, marker) {
        this._isExpanded = true;
        this._activeMinutia = m;
        this._activeMarkerEl = marker;

        this._highlight(marker);
        this._updateFields(m);
        this._renderPatch(m);

        this._patchWrap.style.display = '';
        this._closeBtn.style.display = '';
        this._tooltip.classList.add('mntviz-inspector-expanded');
        this._show();
        requestAnimationFrame(() => this._positionTooltip(m.x, m.y));
    }

    _rerenderPatch() {
        if (!this._isExpanded || !this._activeMinutia) return;
        this._renderPatch(this._activeMinutia);
    }

    /* ── Fields ───────────────────────────────────────────── */

    _updateFields(m) {
        const lines = [];
        if (m._label) {
            lines.push(`<span>src:</span> <b style="color:${m._color || '#fff'}">${m._label}</b>`);
        }
        lines.push(
            `<span>x:</span> ${Math.round(m.x)}  <span>y:</span> ${Math.round(m.y)}`,
            `<span>\u03b8:</span> ${Math.round(m.angle)}\u00b0  <span>Q:</span> ${Math.round(m.quality ?? 100)}`,
        );
        if (m.extra && m.extra.length) {
            lines.push(`<span>extra:</span> ${m.extra.join(' ')}`);
        }
        this._fields.innerHTML = lines.join('<br>');
    }

    /* ── Tooltip positioning ──────────────────────────────── */

    _positionTooltip(mx, my) {
        const svgRect = this._viewer.svgLayer.getBoundingClientRect();
        const vpRect = this._viewer.viewport.getBoundingClientRect();
        const imgSize = this._viewer.imageSize;
        if (!imgSize.width || !imgSize.height) return;

        const scaleX = svgRect.width / imgSize.width;
        const scaleY = svgRect.height / imgSize.height;

        const screenX = svgRect.left - vpRect.left + mx * scaleX;
        const screenY = svgRect.top - vpRect.top + my * scaleY;

        const tipW = this._tooltip.offsetWidth;
        const tipH = this._tooltip.offsetHeight;

        let left = screenX + 15;
        let top = screenY - tipH / 2;

        if (left + tipW > vpRect.width) left = screenX - tipW - 15;
        if (left < 5) left = 5;
        if (top < 5) top = 5;
        if (top + tipH > vpRect.height - 5) top = vpRect.height - tipH - 5;

        this._tooltip.style.left = `${left}px`;
        this._tooltip.style.top = `${top}px`;
    }

    /* ── Patch extraction ─────────────────────────────────── */

    _extractPatch(mx, my, angleDeg) {
        const ps = this._options.patchSize;
        // Convention: angle is CCW from +x.  Canvas rotate() is CW.
        // To align minutia direction with +x, rotate CW by angleDeg.
        const rotAngle = angleDeg * (Math.PI / 180);

        const canvas = document.createElement('canvas');
        canvas.width = ps;
        canvas.height = ps;
        const ctx = canvas.getContext('2d');
        ctx.translate(ps / 2, ps / 2);
        ctx.rotate(rotAngle);
        ctx.drawImage(this._viewer.imageElement, -mx, -my);
        return canvas;
    }

    _renderPatch(m) {
        const ps = this._options.patchSize;
        const ds = this._options.patchDisplaySize;
        const patchCanvas = this._extractPatch(m.x, m.y, m.angle);

        this._patchCanvas.width = ps;
        this._patchCanvas.height = ps;
        this._patchCanvas.style.width = `${ds}px`;
        this._patchCanvas.style.height = `${ds}px`;
        const ctx = this._patchCanvas.getContext('2d');
        ctx.drawImage(patchCanvas, 0, 0);

        // SVG overlay for markers on patch
        this._patchSvg.setAttribute('viewBox', `0 0 ${ps} ${ps}`);
        this._patchSvg.innerHTML = '';

        const mode = this._options.patchMode;
        if (mode === PATCH_MODE_NONE) return;

        const rotAngle = m.angle * (Math.PI / 180);
        const useColors = this._options.patchUseColors;
        const alphaMul = this._options.patchAlphaMultiplier;

        // Draw the clicked minutia marker (direction = 0° in patch, i.e. pointing right)
        const clickedColor = useColors ? (m._color || this._options.markerColor) : this._options.markerColor;
        const clickedShape = m._shape || this._options.markerShape || 'circle';
        this._drawPatchMarker(ps / 2, ps / 2, 0, clickedColor, 1.0, clickedShape);

        // Draw nearby minutiae
        if (mode !== PATCH_MODE_NONE && this._options.getAllMinutiae) {
            const all = this._options.getAllMinutiae();
            const r = this._options.nearbyRadius;
            const visibleKeys = mode === PATCH_MODE_VISIBLE ? this._getVisibleMinutiaeKeys() : null;

            for (const o of all) {
                if (o.x === m.x && o.y === m.y && o.angle === m.angle) continue;
                const dx = o.x - m.x;
                const dy = o.y - m.y;
                if (dx * dx + dy * dy > r * r) continue;

                // Filter by visibility mode
                if (visibleKeys && !visibleKeys.has(`${o.x},${o.y},${o.angle}`)) continue;

                const cos = Math.cos(rotAngle);
                const sin = Math.sin(rotAngle);
                const px = dx * cos - dy * sin + ps / 2;
                const py = dx * sin + dy * cos + ps / 2;
                const pa = ((o.angle - m.angle) % 360 + 360) % 360;

                if (px < 0 || px > ps || py < 0 || py > ps) continue;

                const color = useColors ? (o._color || '#fff') : '#fff';
                const oShape = o._shape || this._options.markerShape || 'circle';
                const qFactor = Math.min(1.0, Math.max(0.2, (o.quality ?? 100) / 100));
                const alpha = qFactor * alphaMul;
                this._drawPatchMarker(px, py, pa, color, alpha, oShape);
            }
        }
    }

    _getVisibleMinutiaeKeys() {
        // Collect keys of all minutiae currently in the SVG layer
        const keys = new Set();
        const markers = this._viewer.svgLayer.querySelectorAll('.mntviz-mnt-marker');
        for (const el of markers) {
            const d = minutiaDataMap.get(el);
            if (d) keys.add(`${d.x},${d.y},${d.angle}`);
        }
        return keys;
    }

    _drawPatchMarker(x, y, angleDeg, color, opacity, shape = 'circle') {
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

        this._patchSvg.appendChild(g);
    }
}
