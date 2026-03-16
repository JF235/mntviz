/**
 * mntviz/minutiae-renderer.js — SVG minutiae drawing.
 *
 * Usage:
 *   import { MinutiaeRenderer } from './mntviz/index.js';
 *   const mr = new MinutiaeRenderer(viewer.svgLayer);
 *   mr.draw(minutiae, '#FF0000', { markerSize: 5 });
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Maps each minutia SVG <g> element to its data object. */
export const minutiaDataMap = new WeakMap();

const DEFAULTS = {
    markerSize: 2,
    lineWidth: 1,
    segmentLength: 5,
    baseOpacity: 1.0,
    showQuality: false,
    showAngles: false,
    qualityFontSize: 5,
    qualityXShift: 0,
    qualityYShift: 10,
    angleFontSize: 5,
    angleXShift: 0,
    angleYShift: -10,
    label: null,
};

export class MinutiaeRenderer {
    /**
     * @param {SVGElement} svgElement - The SVG layer from Viewer.svgLayer.
     */
    constructor(svgElement) {
        this._svg = svgElement;
    }

    /**
     * Draw a set of minutiae as circle + direction line.
     *
     * @param {Array<{x: number, y: number, angle: number, quality: number}>} minutiae
     * @param {string} color - CSS color (e.g. '#FF0000').
     * @param {object} [options] - Override defaults.
     */
    draw(minutiae, color, options = {}) {
        const opts = { ...DEFAULTS, ...options };
        const { markerSize, lineWidth, segmentLength, baseOpacity, showQuality, showAngles,
                qualityFontSize, qualityXShift, qualityYShift,
                angleFontSize, angleXShift, angleYShift } = opts;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('stroke', color);
        g.setAttribute('fill', color);
        g.setAttribute('stroke-width', lineWidth);
        g.setAttribute('stroke-linecap', 'round');
        g.setAttribute('stroke-linejoin', 'round');

        // Separate group for text labels (always opacity=1, not affected by minutiae alpha)
        const textGroup = document.createElementNS(SVG_NS, 'g');
        textGroup.setAttribute('stroke', 'none');
        textGroup.setAttribute('fill', color);

        for (const m of minutiae) {
            const { x, y, angle, quality } = m;
            const qFactor = Math.min(1.0, Math.max(0.2, quality / 100));
            const opacity = baseOpacity * qFactor;

            const mg = document.createElementNS(SVG_NS, 'g');
            mg.setAttribute('opacity', opacity);
            mg.classList.add('mntviz-mnt-marker');
            mg.style.pointerEvents = 'auto';
            mg.style.cursor = 'crosshair';
            minutiaDataMap.set(mg, { ...m, _color: color, _label: opts.label || null });

            // Invisible hit-test circle (easier to hover/click small markers)
            const hitCircle = document.createElementNS(SVG_NS, 'circle');
            hitCircle.setAttribute('cx', x);
            hitCircle.setAttribute('cy', y);
            hitCircle.setAttribute('r', markerSize + 4);
            hitCircle.setAttribute('fill', 'transparent');
            hitCircle.setAttribute('stroke', 'none');
            mg.appendChild(hitCircle);

            // Circle
            const circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', markerSize);
            circle.setAttribute('fill', 'none');
            mg.appendChild(circle);

            // Direction line
            const rad = angle * (Math.PI / 180);
            const xEnd = x + segmentLength * Math.cos(rad);
            const yEnd = y - segmentLength * Math.sin(rad);

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', x);
            line.setAttribute('y1', y);
            line.setAttribute('x2', xEnd);
            line.setAttribute('y2', yEnd);
            mg.appendChild(line);

            g.appendChild(mg);

            // Quality text (separate, always alpha=1)
            if (showQuality) {
                const qText = document.createElementNS(SVG_NS, 'text');
                qText.setAttribute('x', x + qualityXShift);
                qText.setAttribute('y', y + qualityYShift);
                qText.setAttribute('text-anchor', 'middle');
                qText.setAttribute('font-size', `${qualityFontSize}px`);
                qText.textContent = `Q:${Math.round(quality)}`;
                textGroup.appendChild(qText);
            }

            // Angle text (separate, always alpha=1)
            if (showAngles) {
                const aText = document.createElementNS(SVG_NS, 'text');
                aText.setAttribute('x', x + angleXShift);
                aText.setAttribute('y', y + angleYShift);
                aText.setAttribute('text-anchor', 'middle');
                aText.setAttribute('font-size', `${angleFontSize}px`);
                aText.textContent = `${Math.round(angle)}\u00B0`;
                textGroup.appendChild(aText);
            }
        }

        this._svg.appendChild(g);
        if (showQuality || showAngles) {
            this._svg.appendChild(textGroup);
        }
    }

    /** Remove all drawn minutiae. */
    clear() {
        this._svg.innerHTML = '';
    }
}

/**
 * Parse minutiae text (x y angle [quality] per line) into objects.
 *
 * @param {string} text - Minutiae text content.
 * @returns {Array<{x: number, y: number, angle: number, quality: number}>}
 */
export function parseMinutiaeText(text) {
    const result = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.replace(/,/g, ' ').split(/\s+/).map(Number);
        if (parts.length >= 3) {
            const [x, y, angle] = parts;
            const quality = parts.length > 3 ? parts[3] : 100;
            const obj = { x, y, angle, quality };
            if (parts.length > 4) obj.extra = parts.slice(4);
            result.push(obj);
        }
    }
    return result;
}
