/**
 * mntviz/segments-renderer.js — SVG segment drawing.
 *
 * Draws line segments that connect pairs of minutiae (by index) on an SVG
 * layer. Useful for visualizing minutiae graphs, SPG segments, Delaunay
 * triangulations, k-NN edges, etc.
 *
 * Each visible line gets a companion invisible "hit" line with a wider
 * stroke so the segment is easy to hover even when `width` is small.
 *
 * Usage:
 *   import { SegmentsRenderer, segmentDataMap } from './mntviz/index.js';
 *   const sr = new SegmentsRenderer(viewer.svgLayer);
 *   sr.draw(minutiae, [{ m1: 0, m2: 5, pair_id: 0 }]);
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Maps each visible segment `<line>` to its data object. */
export const segmentDataMap = new WeakMap();

const DEFAULTS = {
    color: '#00ff00',
    width: 1.0,
    alpha: 0.7,
    hitWidth: 8,  // stroke-width of the invisible hit-test line.
};

export class SegmentsRenderer {
    /**
     * @param {SVGElement} svgElement - Target SVG layer (e.g. Viewer.svgLayer).
     */
    constructor(svgElement) {
        this._svg = svgElement;
    }

    /**
     * Draw segments as straight lines between minutiae endpoints.
     *
     * @param {Array<{x:number, y:number}>} minutiae - Minutiae array. Segment
     *        endpoints are looked up by `m1`/`m2` indices into this array.
     * @param {Array<{m1:number, m2:number, color?:string, width?:number, alpha?:number, pair_id?:number, label?:string}>} segments
     * @param {object} [options] - Defaults for unspecified per-segment fields.
     * @returns {SVGElement[]} The visible `<line>` elements in input order.
     */
    draw(minutiae, segments, options = {}) {
        if (!segments || segments.length === 0) return [];
        const opts = { ...DEFAULTS, ...options };

        const g = document.createElementNS(SVG_NS, 'g');
        g.classList.add('mntviz-segments');
        g.setAttribute('fill', 'none');
        g.setAttribute('stroke-linecap', 'round');
        const visibleLines = [];

        for (const s of segments) {
            const a = minutiae[s.m1];
            const b = minutiae[s.m2];
            if (!a || !b) { visibleLines.push(null); continue; }

            const mg = document.createElementNS(SVG_NS, 'g');
            mg.classList.add('mntviz-segment-marker');
            mg.style.pointerEvents = 'auto';
            mg.style.cursor = 'crosshair';

            // Transparent hit-test line — wider than the visible stroke so
            // small segments are still easy to hover.
            const hit = document.createElementNS(SVG_NS, 'line');
            hit.setAttribute('x1', a.x);
            hit.setAttribute('y1', a.y);
            hit.setAttribute('x2', b.x);
            hit.setAttribute('y2', b.y);
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-width', opts.hitWidth);
            hit.setAttribute('fill', 'none');
            mg.appendChild(hit);

            const line = document.createElementNS(SVG_NS, 'line');
            line.classList.add('mntviz-segment');
            line.setAttribute('x1', a.x);
            line.setAttribute('y1', a.y);
            line.setAttribute('x2', b.x);
            line.setAttribute('y2', b.y);
            line.setAttribute('stroke', s.color || opts.color);
            line.setAttribute('stroke-width', s.width != null ? s.width : opts.width);
            line.setAttribute('stroke-opacity', s.alpha != null ? s.alpha : opts.alpha);
            mg.appendChild(line);

            segmentDataMap.set(mg, { ...s });
            visibleLines.push(mg);

            g.appendChild(mg);
        }

        this._svg.appendChild(g);
        return visibleLines;
    }

    /** Remove any previously-drawn segment group from this layer. */
    clear() {
        for (const el of this._svg.querySelectorAll('g.mntviz-segments')) {
            el.remove();
        }
    }
}
