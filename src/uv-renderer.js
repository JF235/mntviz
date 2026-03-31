/**
 * mntviz/uv-renderer.js — SVG directional field (UV arrows) rendering.
 *
 * Usage:
 *   import { UVFieldRenderer } from './mntviz/index.js';
 *   const uv = new UVFieldRenderer(viewer.svgLayer);
 *   uv.draw(arrows, { arrowSize: 3, opacity: 0.8 });
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULTS = {
    /** Rendering style: 'arrow' (directed, with arrowhead) or 'segment' (centered, no arrowhead). */
    style: 'arrow',
    arrowSize: 3.0,
    lineWidth: 1.2,
    /** Segment length for 'segment' style — rescales direction vectors client-side. */
    segmentLength: 6.0,
    opacity: 1.0,
    color: '#43C4E4',
    /** Minimum alpha to render (skip near-invisible arrows). */
    alphaThreshold: 0.05,
};

export class UVFieldRenderer {
    /**
     * @param {SVGElement} svgElement - The SVG layer from Viewer.svgLayer or a dedicated SVG.
     */
    constructor(svgElement) {
        this._svg = svgElement;
    }

    /**
     * Draw a UV vector field as arrows with confidence-modulated size and opacity.
     *
     * @param {Array<[number, number, number, number, number]>} arrows
     *   Each arrow is [x, y, dx, dy, confidence] where:
     *   - (x, y): origin in image coordinates
     *   - (dx, dy): direction vector (already scaled to segment length)
     *   - confidence: 0-1 value controlling opacity and size
     * @param {object} [options] - Override defaults.
     */
    draw(arrows, options = {}) {
        const opts = { ...DEFAULTS, ...options };
        const { style, arrowSize, lineWidth, segmentLength, opacity, color, alphaThreshold } = opts;

        this._svg.innerHTML = '';

        for (const [x, y, dx, dy, conf] of arrows) {
            const alpha = conf * opacity;
            if (alpha < alphaThreshold) continue;

            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('opacity', alpha);
            g.setAttribute('stroke', color);
            g.setAttribute('fill', color);
            g.setAttribute('stroke-linecap', 'round');

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('stroke-width', lineWidth);

            if (style === 'segment') {
                // Centered segment: rescale direction to segmentLength
                const mag = Math.hypot(dx, dy);
                const scale = mag > 1e-6 ? segmentLength / mag : 0;
                const sdx = dx * scale * 0.5;
                const sdy = dy * scale * 0.5;
                line.setAttribute('x1', x - sdx);
                line.setAttribute('y1', y - sdy);
                line.setAttribute('x2', x + sdx);
                line.setAttribute('y2', y + sdy);
            } else {
                // Arrow mode (default): shaft from origin along direction
                line.setAttribute('x1', x);
                line.setAttribute('y1', y);
                line.setAttribute('x2', x + dx);
                line.setAttribute('y2', y + dy);
            }

            g.appendChild(line);

            // Arrowhead (arrow mode only)
            if (style !== 'segment') {
                const mag = Math.hypot(dx, dy);
                const size = arrowSize * (0.3 + 0.7 * conf);
                if (mag > 1e-6) {
                    const nx = dx / mag;
                    const ny = dy / mag;
                    const px = -ny;
                    const py = nx;

                    const headW = size * 0.8;
                    const headL = size * 0.6;

                    const bx = x + dx;
                    const by = y + dy;
                    const tipX = bx + nx * headL;
                    const tipY = by + ny * headL;
                    const lx = bx + px * (headW / 2);
                    const ly = by + py * (headW / 2);
                    const rx = bx - px * (headW / 2);
                    const ry = by - py * (headW / 2);

                    const polygon = document.createElementNS(SVG_NS, 'polygon');
                    polygon.setAttribute('points', `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`);
                    polygon.setAttribute('stroke', 'none');
                    g.appendChild(polygon);
                }
            }

            this._svg.appendChild(g);
        }
    }

    /** Remove all drawn arrows. */
    clear() {
        this._svg.innerHTML = '';
    }
}
