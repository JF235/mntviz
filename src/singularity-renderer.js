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
            const sg = document.createElementNS(SVG_NS, 'g');
            sg.setAttribute('opacity', baseOpacity);

            // Marker shape: circle for core, triangle for delta
            const shape = type === 'delta' ? 'triangle' : 'circle';
            const marker = createMarkerShape(shape, x, y, markerSize);
            marker.setAttribute('stroke', color);
            sg.appendChild(marker);

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
                sg.appendChild(line);
            }

            g.appendChild(sg);
        }

        this._svg.appendChild(g);
    }

    /** Remove all drawn singularities. */
    clear() {
        this._svg.innerHTML = '';
    }
}

/**
 * Parse singularity text (TYPE X Y ANGLE [ANGLE2 ANGLE3] per line) into objects.
 *
 * @param {string} text - Singularity text content.
 * @returns {Array<{type: string, x: number, y: number, angles: number[]}>}
 */
export function parseSingularityText(text) {
    const result = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 4) continue;
        const type = parts[0].toLowerCase();
        const x = Number(parts[1]);
        const y = Number(parts[2]);
        const angles = parts.slice(3).map(Number);
        result.push({ type, x, y, angles });
    }
    return result;
}
