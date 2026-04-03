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
import { OverlayLayer } from './overlay.js';
import { UVFieldRenderer } from './uv-renderer.js';
import { MatchViewer } from './match-viewer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Render a legend overlay inside the viewer viewport.
 *
 * @param {Viewer} viewer
 * @param {Array<{label: string, color: string, shape?: string}>} items
 */
function renderLegend(viewer, items) {
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

    return viewer;
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
        leftTitle: config.leftTitle ?? null,
        rightTitle: config.rightTitle ?? null,
        markerColor: config.markerColor ?? '#00ff00',
        rendererOptions: config.rendererOptions ?? {},
        showSegmentsOnLoad: config.showSegments ?? false,
    });
    await mv.loadImages(config.leftImageSrc, config.rightImageSrc);
    return mv;
}
