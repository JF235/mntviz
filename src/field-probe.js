/**
 * mntviz/field-probe.js — Overlay value inspector on hover.
 *
 * Shows scalar field values from the viewer's overlay registry at the
 * cursor position.  Activated/deactivated via double-click (default: off).
 *
 * When a MinutiaeInspector tooltip is visible (marker hover), the probe
 * injects its content into the inspector tooltip so there is a single
 * unified popup.  Otherwise it shows its own standalone tooltip.
 *
 * For overlays with rawData (grayscale mode), the probe reads the scalar
 * value directly — no canvas re-rasterization needed.
 *
 * Usage:
 *   // Register overlays with colormaps in the viewer:
 *   viewer.addOverlay('Mask', new OverlayLayer(container, { colormap: 'RdYlGn' }));
 *   // Enable the probe — reads from viewer.getVisibleOverlays() automatically:
 *   viewer.enableFieldProbe();
 */

export class FieldProbe {
    /**
     * @param {import('./viewer.js').Viewer} viewer
     */
    constructor(viewer) {
        this._viewer = viewer;
        this._active = false;
        this._ac = null;
        this._rafPending = false;
        this._lastEvent = null;

        this._buildTooltip();
    }

    /* ── Public API ──────────────────────────────────────────── */

    enable() {
        if (this._ac) this._ac.abort();
        this._ac = new AbortController();
        const sig = { signal: this._ac.signal };
        const vp = this._viewer.viewport;

        vp.addEventListener('mousemove', (e) => this._onMouseMove(e), sig);
        vp.addEventListener('dblclick', (e) => this._onDblClick(e), sig);
        vp.addEventListener('mouseleave', () => this._hideOwn(), sig);
    }

    disable() {
        if (this._ac) { this._ac.abort(); this._ac = null; }
        this._active = false;
        this._viewer.viewport.classList.remove('mntviz-probe-active');
        this._hideOwn();
        this._clearInspectorProbe();
    }

    toggle() {
        this._active = !this._active;
        this._viewer.viewport.classList.toggle('mntviz-probe-active', this._active);
        if (!this._active) {
            this._hideOwn();
            this._clearInspectorProbe();
        }
    }

    get active() { return this._active; }

    destroy() {
        this.disable();
        if (this._tooltip && this._tooltip.parentNode) {
            this._tooltip.parentNode.removeChild(this._tooltip);
        }
        this._tooltip = null;
    }

    /* ── DOM ──────────────────────────────────────────────────── */

    _buildTooltip() {
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'mntviz-probe-tooltip';
        this._content = document.createElement('div');
        this._content.className = 'mntviz-probe-content';
        this._tooltip.appendChild(this._content);
        this._viewer.viewport.appendChild(this._tooltip);
    }

    /* ── Events ──────────────────────────────────────────────── */

    _onMouseMove(e) {
        if (!this._active) return;
        this._lastEvent = e;
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            if (this._lastEvent) this._sample(this._lastEvent);
        });
    }

    _onDblClick(e) {
        if (e.target.closest('.mntviz-mnt-marker')) return;
        this.toggle();
    }

    /* ── Sampling ────────────────────────────────────────────── */

    _sample(e) {
        const coords = this._mouseToImageCoords(e);
        const imgSize = this._viewer.imageSize;
        if (coords.x < 0 || coords.y < 0 || coords.x >= imgSize.width || coords.y >= imgSize.height) {
            this._hideOwn();
            this._clearInspectorProbe();
            return;
        }

        const lines = [];
        for (const { name, overlay, opts } of this._viewer.getVisibleOverlays()) {
            const value = this._readValue(overlay, opts, coords.x, coords.y);
            if (value === null) continue;
            const formatted = opts.valueMapper
                ? opts.valueMapper(value)
                : this._defaultFormat(value);
            lines.push(`<span class="mntviz-probe-label">${name}:</span> ${formatted}`);
        }

        if (lines.length === 0) {
            this._hideOwn();
            this._clearInspectorProbe();
            return;
        }

        const html = lines.join('<br>');

        const inspector = this._viewer._minutiaeInspector;
        if (inspector && inspector.isVisible) {
            inspector.setProbeContent(html);
            this._hideOwn();
        } else {
            this._clearInspectorProbe();
            this._content.innerHTML = html;
            this._positionTooltip(e);
            this._showOwn();
        }
    }

    /* ── Value reading ───────────────────────────────────────── */

    /**
     * Read the scalar value at (x, y) from an overlay.
     * Returns a number (0-255 raw) for grayscale overlays, or null if out of bounds.
     */
    _readValue(overlay, opts, x, y) {
        const raw = overlay.rawData;
        if (raw) {
            // Grayscale mode: direct array lookup
            const w = overlay.rawWidth;
            const h = overlay.rawHeight;
            if (x < 0 || y < 0 || x >= w || y >= h) return null;
            return raw[y * w + x];
        }
        return null;  // Legacy RGBA overlays not probed
    }

    _defaultFormat(v) {
        if (v === 0) return '--';
        // Map 1-255 back to ~0.00-1.00
        return ((v - 1) / 254).toFixed(2);
    }

    /* ── Coordinates ─────────────────────────────────────────── */

    _mouseToImageCoords(e) {
        const vpRect = this._viewer.viewport.getBoundingClientRect();
        const { scale, translateX, translateY } = this._viewer.viewState;
        return {
            x: Math.floor((e.clientX - vpRect.left - translateX) / scale),
            y: Math.floor((e.clientY - vpRect.top - translateY) / scale),
        };
    }

    /* ── Tooltip show/hide/position ──────────────────────────── */

    _showOwn() {
        this._tooltip.classList.add('mntviz-probe-visible');
    }

    _hideOwn() {
        this._tooltip.classList.remove('mntviz-probe-visible');
    }

    _clearInspectorProbe() {
        const inspector = this._viewer._minutiaeInspector;
        if (inspector) inspector.setProbeContent(null);
    }

    _positionTooltip(e) {
        const vpRect = this._viewer.viewport.getBoundingClientRect();
        const tipW = this._tooltip.offsetWidth;
        const tipH = this._tooltip.offsetHeight;

        let left = e.clientX - vpRect.left + 15;
        let top = e.clientY - vpRect.top - tipH / 2;

        if (left + tipW > vpRect.width) left = e.clientX - vpRect.left - tipW - 15;
        if (left < 5) left = 5;
        if (top < 5) top = 5;
        if (top + tipH > vpRect.height - 5) top = vpRect.height - tipH - 5;

        this._tooltip.style.left = `${left}px`;
        this._tooltip.style.top = `${top}px`;
    }
}
