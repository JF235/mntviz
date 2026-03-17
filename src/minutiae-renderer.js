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
    qualityAlpha: true,
    markerShape: 'circle',
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

/**
 * Create an SVG marker element for the given shape.
 * @param {string} shape - 'circle' | 'triangle' | 'square' | 'diamond'
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {SVGElement}
 */
export function createMarkerShape(shape, cx, cy, r) {
    let el;
    switch (shape) {
        case 'square':
            el = document.createElementNS(SVG_NS, 'rect');
            el.setAttribute('x', cx - r);
            el.setAttribute('y', cy - r);
            el.setAttribute('width', 2 * r);
            el.setAttribute('height', 2 * r);
            el.setAttribute('fill', 'none');
            break;
        case 'diamond': {
            el = document.createElementNS(SVG_NS, 'polygon');
            el.setAttribute('points',
                `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`);
            el.setAttribute('fill', 'none');
            break;
        }
        case 'triangle': {
            el = document.createElementNS(SVG_NS, 'polygon');
            const cos = (a) => Math.cos(a * Math.PI / 180);
            const sin = (a) => Math.sin(a * Math.PI / 180);
            const pts = [90, 210, 330].map(
                a => `${cx + r * cos(a)},${cy - r * sin(a)}`
            ).join(' ');
            el.setAttribute('points', pts);
            el.setAttribute('fill', 'none');
            break;
        }
        default: // 'circle'
            el = document.createElementNS(SVG_NS, 'circle');
            el.setAttribute('cx', cx);
            el.setAttribute('cy', cy);
            el.setAttribute('r', r);
            el.setAttribute('fill', 'none');
            break;
    }
    return el;
}

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
        const { markerSize, lineWidth, segmentLength, baseOpacity, qualityAlpha, markerShape,
                showQuality, showAngles,
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
            const mntColor = m._color || color;
            const mntShape = m._shape || markerShape;
            const opacity = qualityAlpha
                ? baseOpacity * Math.min(1.0, Math.max(0.2, quality / 100))
                : baseOpacity;

            const mg = document.createElementNS(SVG_NS, 'g');
            mg.setAttribute('opacity', opacity);
            mg.setAttribute('stroke', mntColor);
            mg.classList.add('mntviz-mnt-marker');
            mg.style.pointerEvents = 'auto';
            mg.style.cursor = 'crosshair';
            minutiaDataMap.set(mg, { ...m, _color: mntColor, _shape: mntShape, _label: opts.label || null });

            // Invisible hit-test circle (easier to hover/click small markers)
            const hitCircle = document.createElementNS(SVG_NS, 'circle');
            hitCircle.setAttribute('cx', x);
            hitCircle.setAttribute('cy', y);
            hitCircle.setAttribute('r', markerSize + 4);
            hitCircle.setAttribute('fill', 'transparent');
            hitCircle.setAttribute('stroke', 'none');
            mg.appendChild(hitCircle);

            // Marker shape (per-minutia _shape overrides global markerShape)
            const marker = createMarkerShape(mntShape, x, y, markerSize);
            mg.appendChild(marker);

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
                qText.setAttribute('fill', mntColor);
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
                aText.setAttribute('fill', mntColor);
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
