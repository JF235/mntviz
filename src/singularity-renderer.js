/**
 * mntviz/singularity-renderer.js — SVG singularity (core/delta) drawing.
 *
 * Usage:
 *   import { SingularityRenderer, parseSingularityText } from './mntviz/index.js';
 *   const sr = new SingularityRenderer(viewer.svgLayer);
 *   const data = parseSingularityText(text);
 *   sr.draw(data, '#FF00FF', { markerSize: 5 });
 */

import { createMarkerShape } from './minutiae-renderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULTS = {
    markerSize: 5,
    lineWidth: 1.5,
    segmentLength: 12,
    baseOpacity: 1.0,
};

export class SingularityRenderer {
    /**
     * @param {SVGElement} svgElement - The SVG layer from Viewer.svgLayer.
     */
    constructor(svgElement) {
        this._svg = svgElement;
        // Anchor the tooltip on the nearest .mntviz-viewport ancestor — that
        // element is the un-transformed positioning context. Attaching it to
        // svgElement.parentNode directly would put the tooltip inside the
        // zoom/pan-transformed canvas container, throwing off pixel positions
        // at any zoom level other than 1.
        this._viewport = svgElement.closest('.mntviz-viewport') || svgElement.parentNode;
        this._tooltip = null;
        this._hideTimer = null;
    }

    _ensureTooltip() {
        if (this._tooltip) return;
        const tip = document.createElement('div');
        tip.className = 'mntviz-inspector-tooltip';
        this._viewport.appendChild(tip);
        this._tooltip = tip;
    }

    _showTooltip(html, markerEl) {
        this._ensureTooltip();
        clearTimeout(this._hideTimer);
        this._tooltip.innerHTML = html;
        this._tooltip.classList.add('mntviz-inspector-visible');
        this._positionTooltip(markerEl);
    }

    _hideTooltipSoon() {
        clearTimeout(this._hideTimer);
        this._hideTimer = setTimeout(() => {
            if (this._tooltip) {
                this._tooltip.classList.remove('mntviz-inspector-visible');
            }
        }, 60);
    }

    _positionTooltip(markerEl) {
        const mr = markerEl.getBoundingClientRect();
        const vr = this._viewport.getBoundingClientRect();
        const cx = mr.left + mr.width / 2 - vr.left;
        const cy = mr.top + mr.height / 2 - vr.top;
        const tw = this._tooltip.offsetWidth;
        const th = this._tooltip.offsetHeight;
        let left = cx + 15;
        let top = cy - th / 2;
        if (left + tw > vr.width) left = cx - tw - 15;
        if (left < 5) left = 5;
        if (top < 5) top = 5;
        if (top + th > vr.height - 5) top = vr.height - th - 5;
        this._tooltip.style.left = `${left}px`;
        this._tooltip.style.top = `${top}px`;
    }

    /**
     * Draw singularity points (core and delta).
     *
     * @param {Array<{type: string, x: number, y: number, angles: number[]}>} singularities
     * @param {string} color - CSS color.
     * @param {object} [options] - Override defaults.
     */
    draw(singularities, color, options = {}) {
        const opts = { ...DEFAULTS, ...options };
        const { markerSize, lineWidth, segmentLength, baseOpacity } = opts;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('stroke', color);
        g.setAttribute('fill', 'none');
        g.setAttribute('stroke-width', lineWidth);
        g.setAttribute('stroke-linecap', 'round');
        g.setAttribute('stroke-linejoin', 'round');

        for (const s of singularities) {
            const { type, x, y, angles } = s;
            // Confidence (when present in the .sin) modulates per-singularity
            // opacity so weak detections fade out without being filtered.
            const conf = (typeof s.confidence === 'number') ? s.confidence : 1.0;
            const sg = document.createElementNS(SVG_NS, 'g');
            sg.setAttribute('opacity', baseOpacity * conf);
            // ``mntviz-mnt-marker`` + ``mntviz-mnt-visual`` reuse the same
            // hover transitions/highlight CSS that minutiae use — same look
            // and feel without duplicating styles. ``mntviz-sin-marker`` is
            // kept as a semantic hook for callers that want to target only
            // singularity markers.
            sg.classList.add('mntviz-sin-marker', 'mntviz-mnt-marker');
            sg.style.pointerEvents = 'auto';
            sg.style.cursor = 'crosshair';

            // Invisible larger hit-test circle so hover catches the marker
            // even at small marker sizes. Kept OUTSIDE the visual group so
            // the highlight scale transform doesn't grow the hit target.
            const hit = document.createElementNS(SVG_NS, 'circle');
            hit.setAttribute('cx', x);
            hit.setAttribute('cy', y);
            hit.setAttribute('r', markerSize + 4);
            hit.setAttribute('fill', 'transparent');
            hit.setAttribute('stroke', 'none');
            sg.appendChild(hit);

            // Visible geometry — the target of the scale-on-hover transform.
            const visual = document.createElementNS(SVG_NS, 'g');
            visual.classList.add('mntviz-mnt-visual');

            // Marker shape: circle for core, triangle for delta
            const shape = type === 'delta' ? 'triangle' : 'circle';
            const marker = createMarkerShape(shape, x, y, markerSize);
            visual.appendChild(marker);

            // Direction lines — one per angle
            for (const angle of angles) {
                const rad = angle * (Math.PI / 180);
                const xEnd = x + segmentLength * Math.cos(rad);
                const yEnd = y - segmentLength * Math.sin(rad);

                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', x);
                line.setAttribute('y1', y);
                line.setAttribute('x2', xEnd);
                line.setAttribute('y2', yEnd);
                visual.appendChild(line);
            }

            sg.appendChild(visual);

            // Hover tooltip + highlight — custom overlay matching the
            // MinutiaeInspector look. Adding ``mntviz-mnt-highlighted`` to
            // the group triggers the same brightness/scale animation that
            // minutiae use on hover.
            const angsStr = angles.map(a => `${Math.round(a)}°`).join(', ');
            const html =
                `<span>${type.toUpperCase()}</span>  ` +
                `<span>x:</span> ${Math.round(x)}  <span>y:</span> ${Math.round(y)}<br>` +
                `<span>angle${angles.length > 1 ? 's' : ''}:</span> ${angsStr}<br>` +
                `<span>conf:</span> ${(conf * 100).toFixed(0)}`;
            sg.addEventListener('mouseenter', () => {
                sg.classList.add('mntviz-mnt-highlighted');
                this._showTooltip(html, sg);
            });
            sg.addEventListener('mouseleave', () => {
                sg.classList.remove('mntviz-mnt-highlighted');
                this._hideTooltipSoon();
            });

            g.appendChild(sg);
        }

        this._svg.appendChild(g);
    }

    /** Remove all drawn singularities. */
    clear() {
        this._svg.innerHTML = '';
        if (this._tooltip) {
            this._tooltip.classList.remove('mntviz-inspector-visible');
        }
    }
}

/**
 * Parse singularity text into objects.
 *
 * Supported line formats (header optional, comment lines start with `#`):
 *   ``CORE  x y angle  [confidence]``        → 1 angle, optional confidence
 *   ``DELTA x y a1 a2 a3 [confidence]``      → 3 angles, optional confidence
 *
 * The number of expected angles is determined by ``TYPE``; any one extra
 * trailing field is taken as a confidence in [0, 1]. This matches the
 * extended ``# TYPE X Y ANGLE [ANGLE2 ANGLE3] CONFIDENCE`` header written
 * by ``mntstitch`` ``extract_singularities.py combine``.
 *
 * @param {string} text - Singularity text content.
 * @returns {Array<{type: string, x: number, y: number,
 *                  angles: number[], confidence?: number}>}
 */
export function parseSingularityText(text) {
    const result = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.replace(/,/g, ' ').split(/\s+/);
        if (parts.length < 4) continue;
        const type = parts[0].toLowerCase();
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const expectedAngles = (type === 'delta') ? 3 : 1;
        const angleEnd = 3 + expectedAngles;
        if (parts.length < angleEnd) continue;
        const angles = parts.slice(3, angleEnd).map(Number);
        const out = { type, x, y, angles };
        if (parts.length > angleEnd) {
            const conf = Number(parts[angleEnd]);
            if (Number.isFinite(conf)) out.confidence = conf;
        }
        result.push(out);
    }
    return result;
}
