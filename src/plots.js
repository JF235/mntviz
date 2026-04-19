/**
 * High-level plotting facade for mntviz.
 *
 * Each function receives a host DOM element and a JSON-serializable config
 * object, creates the appropriate viewers/renderers, and returns the primary
 * object (Viewer or MatchViewer) for further interaction.
 *
 * These functions are the bridge between the Python wrapper (which builds the
 * config) and the low-level JS components.
 */

import { Viewer } from './viewer.js';
import { MinutiaeRenderer, createMarkerShape } from './minutiae-renderer.js';
import { SegmentsRenderer } from './segments-renderer.js';
import { OverlayLayer } from './overlay.js';
import { UVFieldRenderer } from './uv-renderer.js';
import { MatchViewer } from './match-viewer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element from a shape descriptor.
 *
 * Supported types:
 * - polygon: { type: 'polygon', points: [[x,y],...], stroke, strokeWidth, fill, opacity }
 * - cross:   { type: 'cross', x, y, size, stroke, strokeWidth, opacity }
 * - path:    { type: 'path', d, stroke, strokeWidth, fill, opacity }
 *
 * @param {Object} shape
 * @returns {SVGElement|null}
 */
function _createShapeElement(shape) {
    if (shape.type === 'polygon') {
        const poly = document.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute('points', shape.points.map(p => p.join(',')).join(' '));
        poly.setAttribute('stroke', shape.stroke || '#ff0000');
        poly.setAttribute('stroke-width', shape.strokeWidth || 2);
        poly.setAttribute('fill', shape.fill || 'none');
        if (shape.opacity != null) poly.setAttribute('opacity', shape.opacity);
        return poly;
    }
    if (shape.type === 'cross') {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('stroke', shape.stroke || '#00ff00');
        g.setAttribute('stroke-width', shape.strokeWidth || 1);
        const s = shape.size || 10;
        const h = document.createElementNS(SVG_NS, 'line');
        h.setAttribute('x1', shape.x - s / 2); h.setAttribute('y1', shape.y);
        h.setAttribute('x2', shape.x + s / 2); h.setAttribute('y2', shape.y);
        const v = document.createElementNS(SVG_NS, 'line');
        v.setAttribute('x1', shape.x); v.setAttribute('y1', shape.y - s / 2);
        v.setAttribute('x2', shape.x); v.setAttribute('y2', shape.y + s / 2);
        g.append(h, v);
        if (shape.opacity != null) g.setAttribute('opacity', shape.opacity);
        return g;
    }
    if (shape.type === 'minutia') {
        // Circle + direction segment, like a minutia marker.
        // angle is in degrees, image convention (CW from right).
        const g = document.createElementNS(SVG_NS, 'g');
        const color = shape.stroke || '#00ff00';
        g.setAttribute('stroke', color);
        g.setAttribute('fill', 'none');
        g.setAttribute('stroke-width', shape.strokeWidth || 1.5);
        const r = shape.radius || 6;
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', shape.x);
        circle.setAttribute('cy', shape.y);
        circle.setAttribute('r', r);
        g.appendChild(circle);
        const segLen = shape.segmentLength || r * 2;
        const rad = (shape.angle || 0) * Math.PI / 180;
        const dx = Math.cos(rad) * segLen;
        const dy = Math.sin(rad) * segLen;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', shape.x);
        line.setAttribute('y1', shape.y);
        line.setAttribute('x2', shape.x + dx);
        line.setAttribute('y2', shape.y + dy);
        g.appendChild(line);
        if (shape.opacity != null) g.setAttribute('opacity', shape.opacity);
        return g;
    }
    if (shape.type === 'path') {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', shape.d);
        path.setAttribute('stroke', shape.stroke || '#ff0000');
        path.setAttribute('stroke-width', shape.strokeWidth || 2);
        path.setAttribute('fill', shape.fill || 'none');
        if (shape.opacity != null) path.setAttribute('opacity', shape.opacity);
        return path;
    }
    return null;
}

/**
 * Append shape overlays to an SVG element.
 * @param {SVGElement} svgTarget
 * @param {Array<Object>} shapes
 */
function _renderShapes(svgTarget, shapes) {
    if (!shapes || shapes.length === 0) return;
    const g = document.createElementNS(SVG_NS, 'g');
    for (const shape of shapes) {
        const el = _createShapeElement(shape);
        if (el) g.appendChild(el);
    }
    svgTarget.appendChild(g);
}

/**
 * Render a legend overlay inside the viewer viewport.
 *
 * @param {Viewer} viewer
 * @param {Array<{label: string, color: string, shape?: string}>} items
 */
export function renderLegend(viewer, items) {
    if (!items || items.length === 0) return;

    const wrap = document.createElement('div');
    wrap.classList.add('mntviz-legend');

    for (const { label, color, shape } of items) {
        const row = document.createElement('div');
        row.classList.add('mntviz-legend-item');

        // SVG marker swatch
        const size = 16;
        const r = 5;
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.classList.add('mntviz-legend-marker');

        const marker = createMarkerShape(shape || 'circle', size / 2, size / 2, r);
        marker.setAttribute('stroke', color);
        marker.setAttribute('fill', 'none');
        marker.setAttribute('stroke-width', '1.5');
        svg.appendChild(marker);

        const text = document.createElement('span');
        text.classList.add('mntviz-legend-label');
        text.textContent = label;

        row.append(svg, text);
        wrap.appendChild(row);
    }

    viewer.viewport.appendChild(wrap);
}

/**
 * Render minutiae on an image with interactive inspection.
 *
 * @param {HTMLElement} host
 * @param {Object} config
 * @param {string}  config.imageSrc        - Data URI or URL of the background image.
 * @param {Array}   config.minutiae        - Array of {x, y, angle, quality, _color?, _shape?, _label?}.
 * @param {string}  [config.color]         - Default marker color (CSS).
 * @param {Object}  [config.rendererOptions] - Options forwarded to MinutiaeRenderer.draw().
 * @param {Object|false} [config.inspectorOptions] - Options for enableMinutiaeInspector(). Pass false to disable.
 * @returns {Promise<Viewer>}
 */
export async function plotMinutiae(host, config) {
    const viewer = new Viewer(host, { minimap: true });
    await viewer.loadImage(config.imageSrc);

    // Segments are drawn first so they sit under the minutiae markers.
    if (config.segments && config.segments.length) {
        const sr = new SegmentsRenderer(viewer.svgLayer);
        sr.draw(config.minutiae, config.segments, config.segmentOptions ?? {});
    }

    const renderer = new MinutiaeRenderer(viewer.svgLayer);
    renderer.draw(config.minutiae, config.color ?? '#00ff00', config.rendererOptions ?? {});

    if (config.inspectorOptions !== false) {
        viewer.enableMinutiaeInspector({
            getAllMinutiae: () => config.minutiae,
            patchMode: 'visible',
            ...(config.inspectorOptions ?? {}),
        });
    }

    if (config.legend) {
        renderLegend(viewer, config.legend);
    }

    return viewer;
}

/**
 * Render a colormapped overlay on an image.
 *
 * @param {HTMLElement} host
 * @param {Object} config
 * @param {string}  config.imageSrc        - Background image data URI.
 * @param {string}  [config.overlaySrc]    - Overlay image data URI (RGBA PNG).
 * @param {number}  [config.overlayOpacity] - Overlay opacity (0-1).
 * @returns {Promise<Viewer>}
 */
export async function plotOverlay(host, config) {
    const viewer = new Viewer(host, { minimap: true });
    await viewer.loadImage(config.imageSrc);

    if (config.overlaySrc) {
        const overlay = new OverlayLayer(viewer.canvasContainer, {
            opacity: config.overlayOpacity ?? 1.0,
            insertBefore: viewer.svgLayer,
        });
        await overlay.load(config.overlaySrc);
        overlay.show();
    }

    return viewer;
}

/**
 * Render a heatmap overlay with UV orientation field arrows.
 *
 * @param {HTMLElement} host
 * @param {Object} config
 * @param {string}  config.imageSrc        - Background image data URI.
 * @param {string}  [config.overlaySrc]    - Heatmap overlay data URI.
 * @param {number}  [config.overlayOpacity] - Overlay opacity.
 * @param {Array}   [config.arrows]        - Array of [x, y, dx, dy, confidence].
 * @param {Object}  [config.arrowOptions]  - Options forwarded to UVFieldRenderer.draw().
 * @returns {Promise<Viewer>}
 */
export async function plotHuv(host, config) {
    const viewer = new Viewer(host, { minimap: true });
    await viewer.loadImage(config.imageSrc);

    if (config.overlaySrc) {
        const overlay = new OverlayLayer(viewer.canvasContainer, {
            opacity: config.overlayOpacity ?? 1.0,
            insertBefore: viewer.svgLayer,
        });
        await overlay.load(config.overlaySrc);
        overlay.show();
    }

    if (config.arrows && config.arrows.length > 0) {
        const uvRenderer = new UVFieldRenderer(viewer.svgLayer);
        uvRenderer.draw(config.arrows, config.arrowOptions ?? {});
    }

    // Shape overlays
    _renderShapes(viewer.svgLayer, config.shapes);

    return viewer;
}

/**
 * Load an image and return its natural dimensions.
 * @param {string} src - Data URI or URL.
 * @returns {Promise<{w: number, h: number}>}
 */
function _loadImageDimensions(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Create a static SVG element showing the HUV composite (background image,
 * heatmap overlay, and UV arrows) without any interactive pan/zoom.
 *
 * @param {Object} config - Same config as plotHuv.
 * @param {number} w - Image width in pixels.
 * @param {number} h - Image height in pixels.
 * @returns {SVGSVGElement}
 */
function _createStaticHuvSvg(config, w, h) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (config.pixelated) svg.style.imageRendering = 'pixelated';

    // Background image
    const bgImage = document.createElementNS(SVG_NS, 'image');
    bgImage.setAttribute('href', config.imageSrc);
    bgImage.setAttribute('width', w);
    bgImage.setAttribute('height', h);
    if (config.pixelated) bgImage.setAttribute('image-rendering', 'pixelated');
    svg.appendChild(bgImage);

    // Heatmap overlay
    if (config.overlaySrc) {
        const ovImage = document.createElementNS(SVG_NS, 'image');
        ovImage.setAttribute('href', config.overlaySrc);
        ovImage.setAttribute('width', w);
        ovImage.setAttribute('height', h);
        ovImage.setAttribute('opacity', config.overlayOpacity ?? 1.0);
        if (config.pixelated) ovImage.setAttribute('image-rendering', 'pixelated');
        svg.appendChild(ovImage);
    }

    // UV arrows
    if (config.arrows && config.arrows.length > 0) {
        const arrowGroup = document.createElementNS(SVG_NS, 'g');
        svg.appendChild(arrowGroup);
        const uvRenderer = new UVFieldRenderer(arrowGroup);
        uvRenderer.draw(config.arrows, config.arrowOptions ?? {});
    }

    // Shape overlays
    _renderShapes(svg, config.shapes);

    return svg;
}

/**
 * Open a modal dialog containing a full interactive plotHuv viewer.
 * Only one modal can be open at a time.
 *
 * @param {Object} config - Same config as plotHuv.
 */
function _openHuvModal(config) {
    // Prevent duplicate modals
    const existing = document.querySelector('.mntviz-modal-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'mntviz-modal-backdrop';

    const content = document.createElement('div');
    content.className = 'mntviz-modal-content';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'mntviz-modal-close';
    closeBtn.textContent = '\u00D7';

    function close() {
        backdrop.remove();
        document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
        if (e.key === 'Escape') close();
    }

    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    content.appendChild(closeBtn);
    backdrop.appendChild(content);
    document.body.appendChild(backdrop);

    // Wait two frames so the browser fully computes layout before
    // the Viewer measures its container for resetView().
    requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
            const viewer = await plotHuv(content, config);
            viewer.resetView();
        });
    });
}

/**
 * Render a lightweight static thumbnail of an HUV plot.
 * Clicking the thumbnail opens a full interactive viewer in a modal.
 *
 * @param {HTMLElement} host - Container element.
 * @param {Object} config - Same config as plotHuv.
 * @returns {Promise<HTMLElement>} The wrapper element.
 */
export async function plotHuvThumbnail(host, config) {
    const { w, h } = await _loadImageDimensions(config.imageSrc);
    const svg = _createStaticHuvSvg(config, w, h);

    const wrap = document.createElement('div');
    wrap.className = 'mntviz-thumbnail-wrap';
    wrap.appendChild(svg);
    wrap.addEventListener('click', () => _openHuvModal(config));

    host.appendChild(wrap);
    return wrap;
}

/**
 * Render a side-by-side match comparison viewer.
 *
 * @param {HTMLElement} host
 * @param {Object} config
 * @param {Object}  config.matchData                - Match data object.
 * @param {Array}   config.matchData.leftMinutiae   - Left-side minutiae.
 * @param {Array}   config.matchData.rightMinutiae  - Right-side minutiae.
 * @param {Array}   config.matchData.pairs          - Pair definitions.
 * @param {string}  config.leftImageSrc             - Left image data URI.
 * @param {string}  config.rightImageSrc            - Right image data URI.
 * @param {string}  [config.markerColor]            - Default marker color.
 * @param {Object}  [config.rendererOptions]        - Options for MinutiaeRenderer.
 * @param {boolean} [config.showSegments]           - Show pair segments on load.
 * @param {string}  [config.leftTitle]              - Left panel title.
 * @param {string}  [config.rightTitle]             - Right panel title.
 * @returns {Promise<MatchViewer>}
 */
export async function plotMatch(host, config) {
    const mv = new MatchViewer(host, {
        leftMinutiae: config.matchData.leftMinutiae,
        rightMinutiae: config.matchData.rightMinutiae,
        pairs: config.matchData.pairs,
        leftSegments: config.matchData.leftSegments ?? [],
        rightSegments: config.matchData.rightSegments ?? [],
        dominantAngle: config.matchData.dominantAngle ?? null,
        matchTransform: config.matchData.matchTransform ?? null,
        leftTitle: config.leftTitle ?? null,
        rightTitle: config.rightTitle ?? null,
        markerColor: config.markerColor ?? '#00ff00',
        rendererOptions: config.rendererOptions ?? {},
        segmentOptions: config.segmentOptions ?? {},
        showSegmentsOnLoad: config.showSegments ?? false,
    });
    await mv.loadImages(config.leftImageSrc, config.rightImageSrc);
    return mv;
}
