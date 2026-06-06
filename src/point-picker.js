/**
 * mntviz/point-picker.js — Click-to-add interactive point picker.
 *
 * Wraps a Viewer's viewport with a mousedown/mouseup pair to detect clicks
 * (vs. pan-drag), captures image-space coordinates, renders markers on the
 * SVG layer, and emits events so consumers (HTML page, web component,
 * anywidget bridge) can observe state changes without coupling to a transport.
 *
 * Usage:
 *   const viewer = new Viewer(host);
 *   await viewer.loadImage(src);
 *   const picker = new PointPicker(viewer);
 *   picker.enable();
 *   picker.on('change', pts => console.log(pts));
 *   picker.setPoints([{x: 100, y: 200}]);
 *
 * Events:
 *   'change' (points)  — fired after any add/remove/set/clear
 *   'add'    (point)   — fired when a click adds a point
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_OPTIONS = {
    color: '#22c55e',
    markerRadius: 8,
    strokeWidth: 1.6,
    showLabels: true,
    labelFontSize: 11,
    // Drag distance (image px) below which the release is treated as a
    // pure click — point recorded without an angle. Above the threshold,
    // the angle is atan2(dy, dx) in CW image convention.
    angleThreshold: 5,
    segmentLength: null,    // defaults to markerRadius * 2 if null
    // Double-click detection (window — first click is left to the Viewer
    // for pan; second click + optional drag adds the point).
    doubleClickMs: 350,
    doubleClickDistPx: 8,
};

export class PointPicker {
    /**
     * @param {Viewer} viewer
     * @param {Object} [options]
     */
    constructor(viewer, options = {}) {
        this._viewer = viewer;
        this._options = { ...DEFAULT_OPTIONS, ...options };
        this._points = [];                 // [{x, y, angle?, ...meta}]
        this._listeners = new Map();        // event -> Set<fn>
        this._ac = null;
        this._dragStart = null;             // active angle-drag (after dblclick)
        this._rightDownPos = null;          // active right-mouse press
        this._previewLine = null;           // SVG preview during drag
        this._lastClickTime = 0;             // for manual double-click detection
        this._lastClickPos = null;

        // Persistent SVG group above other renderers.
        this._group = document.createElementNS(SVG_NS, 'g');
        this._group.setAttribute('class', 'mntviz-picker-layer');
        this._group.setAttribute('pointer-events', 'none');
        this._viewer.svgLayer.appendChild(this._group);
    }

    /* ── Public API ────────────────────────────────────────────── */

    enable() {
        if (this._ac) this._ac.abort();
        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        const vp = this._viewer.viewport;
        // Capture phase: we need to run before the Viewer's pan handler so
        // that the *second* click of a double-click can take ownership.
        // The first click falls through to the Viewer (pan works normally).
        vp.addEventListener('mousedown',     (e) => this._onMouseDown(e), { ...sig, capture: true });
        window.addEventListener('mousemove', (e) => this._onMouseMove(e), { ...sig, capture: true });
        window.addEventListener('mouseup',   (e) => this._onMouseUp(e),   { ...sig, capture: true });
        vp.addEventListener('contextmenu',   (e) => this._onContextMenu(e), sig);
        // Suppress the browser's native dblclick so it doesn't select text
        // or fire after our second-click drag has started.
        vp.addEventListener('dblclick',      (e) => { e.preventDefault(); e.stopPropagation(); },
                            { ...sig, capture: true });
        vp.classList.add('mntviz-picker-active');
        this._render();
    }

    disable() {
        if (this._ac) { this._ac.abort(); this._ac = null; }
        this._dragStart = null;
        this._rightDownPos = null;
        this._lastClickTime = 0;
        this._lastClickPos = null;
        this._hidePreview();
        this._viewer.viewport.classList.remove('mntviz-picker-active');
    }

    isEnabled() { return this._ac !== null; }

    destroy() {
        this.disable();
        if (this._group && this._group.parentNode) {
            this._group.parentNode.removeChild(this._group);
        }
        this._listeners.clear();
    }

    getPoints() {
        return this._points.map(p => ({ ...p }));
    }

    setPoints(points) {
        this._points = (points || []).map(p => ({
            x: Number(p.x),
            y: Number(p.y),
            ...(p.angle != null ? { angle: Number(p.angle) } : {}),
            ...(p.label != null ? { label: p.label } : {}),
        })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        this._render();
        this._emit('change', this.getPoints());
    }

    addPoint(x, y, meta = {}) {
        this._points.push({ x: Number(x), y: Number(y), ...meta });
        this._render();
        this._emit('add', { x, y, ...meta });
        this._emit('change', this.getPoints());
    }

    removeLast() {
        if (this._points.length === 0) return null;
        const removed = this._points.pop();
        this._render();
        this._emit('change', this.getPoints());
        return removed;
    }

    /**
     * Remove the point nearest to (x, y) in image space. The implicit hit
     * radius scales with `markerRadius` and the current zoom so right-click
     * stays usable when zoomed out.
     */
    removeNearest(x, y, radius = null) {
        if (this._points.length === 0) return null;
        const scale = (this._viewer.viewState && this._viewer.viewState.scale) || 1;
        const r = radius != null
            ? radius
            : Math.max(6, this._options.markerRadius * 2) / scale;
        let bestIdx = -1, bestD2 = r * r;
        for (let i = 0; i < this._points.length; i++) {
            const p = this._points[i];
            const dx = p.x - x, dy = p.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= bestD2) { bestD2 = d2; bestIdx = i; }
        }
        if (bestIdx < 0) return null;
        const removed = this._points.splice(bestIdx, 1)[0];
        this._render();
        this._emit('change', this.getPoints());
        return removed;
    }

    clear() {
        if (this._points.length === 0) return;
        this._points = [];
        this._render();
        this._emit('change', this.getPoints());
    }

    setOptions(options) {
        this._options = { ...this._options, ...options };
        this._render();
    }

    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return () => this._listeners.get(event)?.delete(fn);
    }

    off(event, fn) {
        this._listeners.get(event)?.delete(fn);
    }

    /* ── Pointer handling ──────────────────────────────────────── */

    _onMouseDown(e) {
        if (e.button === 2) {
            // Right-click: suppress the Viewer's pan handler; we'll handle
            // removal on mouseup.
            e.preventDefault();
            e.stopPropagation();
            this._rightDownPos = { clientX: e.clientX, clientY: e.clientY };
            return;
        }
        if (e.button !== 0) return;        // left-button only

        const now = Date.now();
        const last = this._lastClickPos;
        const isDouble = last
            && (now - this._lastClickTime) <= this._options.doubleClickMs
            && Math.abs(e.clientX - last.x) <= this._options.doubleClickDistPx
            && Math.abs(e.clientY - last.y) <= this._options.doubleClickDistPx;

        if (!isDouble) {
            // First click → leave it to the Viewer for pan; just remember
            // timing so a quick second click can claim the point.
            this._lastClickTime = now;
            this._lastClickPos = { x: e.clientX, y: e.clientY };
            return;
        }

        // Second click of a double-click — take ownership and start the
        // angle drag. Pan handler never sees this mousedown.
        e.preventDefault();
        e.stopPropagation();
        this._lastClickTime = 0;
        this._lastClickPos = null;
        if (e.target && e.target.closest && e.target.closest('.mntviz-mnt-marker')) return;

        const { x, y } = this._mouseToImage(e);
        const sz = this._viewer.imageSize;
        if (x < 0 || y < 0 || x >= sz.width || y >= sz.height) return;
        this._dragStart = { x, y };
        this._showPreview(x, y, x, y);
    }

    _onMouseMove(e) {
        if (!this._dragStart) return;
        const { x, y } = this._mouseToImage(e);
        this._showPreview(this._dragStart.x, this._dragStart.y, x, y);
    }

    _onMouseUp(e) {
        if (e.button === 2 && this._rightDownPos) {
            const dx = e.clientX - this._rightDownPos.clientX;
            const dy = e.clientY - this._rightDownPos.clientY;
            this._rightDownPos = null;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return;  // ignore right-drag
            const { x, y } = this._mouseToImage(e);
            this.removeNearest(x, y);
            return;
        }
        if (e.button !== 0 || !this._dragStart) return;

        const start = this._dragStart;
        this._dragStart = null;
        this._hidePreview();

        const { x, y } = this._mouseToImage(e);
        const dx = x - start.x;
        const dy = y - start.y;
        const distSq = dx * dx + dy * dy;
        const thr = this._options.angleThreshold;

        const meta = {};
        if (distSq >= thr * thr) {
            // ISO/.min convention: angle is CCW from +x with 90° = image top
            // (y grows downward, so negate dy). Matches MinutiaeRenderer /
            // SingularityRenderer, which draw the segment as y2 = y − sin(angle).
            const ang = (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
            meta.angle = ang;
        }
        this.addPoint(start.x, start.y, meta);
    }

    _onContextMenu(e) {
        // Prevent the browser menu so right-click is consumed by removeNearest.
        e.preventDefault();
    }

    _mouseToImage(e) {
        const vpRect = this._viewer.viewport.getBoundingClientRect();
        const { scale, translateX, translateY } = this._viewer.viewState;
        return {
            x: Math.round((e.clientX - vpRect.left - translateX) / scale),
            y: Math.round((e.clientY - vpRect.top  - translateY) / scale),
        };
    }

    /* ── Rendering ─────────────────────────────────────────────── */

    _render() {
        // Preserve the preview line across re-renders.
        const preview = this._previewLine;
        while (this._group.firstChild) this._group.removeChild(this._group.firstChild);
        const { color, markerRadius: r, strokeWidth, showLabels, labelFontSize } = this._options;
        const segLen = this._options.segmentLength != null
            ? this._options.segmentLength
            : r * 2;

        this._points.forEach((p, i) => {
            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'mntviz-picker-point');

            const c = document.createElementNS(SVG_NS, 'circle');
            c.setAttribute('cx', p.x);
            c.setAttribute('cy', p.y);
            c.setAttribute('r', r);
            c.setAttribute('fill', `${color}33`);
            c.setAttribute('stroke', color);
            c.setAttribute('stroke-width', strokeWidth);
            g.appendChild(c);

            // small dot for precise center
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', p.x);
            dot.setAttribute('cy', p.y);
            dot.setAttribute('r', Math.max(1, r * 0.2));
            dot.setAttribute('fill', color);
            g.appendChild(dot);

            // Direction segment (ISO: CCW from +x, y2 = y − sin so 90° points up).
            if (p.angle != null && Number.isFinite(p.angle)) {
                const rad = p.angle * Math.PI / 180;
                const x2 = p.x + Math.cos(rad) * segLen;
                const y2 = p.y - Math.sin(rad) * segLen;
                const seg = document.createElementNS(SVG_NS, 'line');
                seg.setAttribute('x1', p.x);
                seg.setAttribute('y1', p.y);
                seg.setAttribute('x2', x2);
                seg.setAttribute('y2', y2);
                seg.setAttribute('stroke', color);
                seg.setAttribute('stroke-width', strokeWidth);
                seg.setAttribute('stroke-linecap', 'round');
                g.appendChild(seg);
            }

            if (showLabels) {
                const t = document.createElementNS(SVG_NS, 'text');
                t.setAttribute('x', p.x + r + 2);
                t.setAttribute('y', p.y - r - 2);
                t.setAttribute('font-size', labelFontSize);
                t.setAttribute('font-family', 'monospace');
                t.setAttribute('fill', color);
                t.setAttribute('paint-order', 'stroke');
                t.setAttribute('stroke', 'rgba(0,0,0,0.6)');
                t.setAttribute('stroke-width', '0.4');
                t.textContent = p.label != null ? String(p.label) : String(i + 1);
                g.appendChild(t);
            }

            this._group.appendChild(g);
        });

        // Re-attach the preview if a drag is in flight.
        if (preview && this._previewLine === preview) {
            this._group.appendChild(preview);
        }
    }

    _showPreview(x1, y1, x2, y2) {
        const { color, strokeWidth } = this._options;
        if (!this._previewLine) {
            this._previewLine = document.createElementNS(SVG_NS, 'line');
            this._previewLine.setAttribute('class', 'mntviz-picker-preview');
            this._previewLine.setAttribute('stroke', color);
            this._previewLine.setAttribute('stroke-width', strokeWidth);
            this._previewLine.setAttribute('stroke-dasharray', '4 3');
            this._previewLine.setAttribute('stroke-linecap', 'round');
            this._previewLine.setAttribute('opacity', '0.85');
            this._group.appendChild(this._previewLine);
        }
        this._previewLine.setAttribute('x1', x1);
        this._previewLine.setAttribute('y1', y1);
        this._previewLine.setAttribute('x2', x2);
        this._previewLine.setAttribute('y2', y2);
    }

    _hidePreview() {
        if (this._previewLine && this._previewLine.parentNode) {
            this._previewLine.parentNode.removeChild(this._previewLine);
        }
        this._previewLine = null;
    }

    _emit(event, payload) {
        const subs = this._listeners.get(event);
        if (!subs) return;
        for (const fn of subs) {
            try { fn(payload); } catch (err) { console.error('PointPicker listener error', err); }
        }
    }
}
