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
    if (shape.type === 'circle') {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', shape.x);
        c.setAttribute('cy', shape.y);
        c.setAttribute('r', shape.r != null ? shape.r : 3);
        c.setAttribute('fill', shape.fill != null ? shape.fill : 'none');
        if (shape.stroke != null) c.setAttribute('stroke', shape.stroke);
        if (shape.strokeWidth != null) c.setAttribute('stroke-width', shape.strokeWidth);
        if (shape.opacity != null) c.setAttribute('opacity', shape.opacity);
        return c;
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
    if (shape.type === 'conic-ring') {
        // Stroked ring with a smooth angular (conic) color gradient.
        // Uses the canonical recipe: an SVG <mask> shaped like an annulus,
        // applied to a <foreignObject> whose <div> background is a CSS
        // conic-gradient. This is the only way to get a truly smooth conic
        // sweep on a circle stroke (SVG's native gradients are linear/radial
        // only; SVG2 conicGradient is not implemented in any browser).
        //
        // shape: { x, y, r, strokeWidth?, opacity?, fromAngle?, gradient }
        //   gradient: array of CSS color strings (uniformly spaced 0..360°)
        //             OR a raw CSS conic-gradient stops string.
        const g = document.createElementNS(SVG_NS, 'g');
        if (shape.opacity != null) g.setAttribute('opacity', shape.opacity);

        const cx = shape.x, cy = shape.y, r = shape.r;
        const sw = shape.strokeWidth != null ? shape.strokeWidth : 2;
        const pad = sw;
        const bx = cx - r - pad, by = cy - r - pad;
        const bs = (r + pad) * 2;

        const maskId = 'mntviz-conic-mask-' + Math.random().toString(36).slice(2, 10);
        const defs = document.createElementNS(SVG_NS, 'defs');
        const mask = document.createElementNS(SVG_NS, 'mask');
        mask.setAttribute('id', maskId);
        mask.setAttribute('maskUnits', 'userSpaceOnUse');
        mask.setAttribute('x', bx); mask.setAttribute('y', by);
        mask.setAttribute('width', bs); mask.setAttribute('height', bs);

        const bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('x', bx); bg.setAttribute('y', by);
        bg.setAttribute('width', bs); bg.setAttribute('height', bs);
        bg.setAttribute('fill', 'black');
        mask.appendChild(bg);

        const ringCircle = document.createElementNS(SVG_NS, 'circle');
        ringCircle.setAttribute('cx', cx); ringCircle.setAttribute('cy', cy);
        ringCircle.setAttribute('r', r);
        ringCircle.setAttribute('fill', 'none');
        ringCircle.setAttribute('stroke', 'white');
        ringCircle.setAttribute('stroke-width', sw);
        mask.appendChild(ringCircle);

        defs.appendChild(mask);
        g.appendChild(defs);

        // Build CSS conic-gradient stops.
        let stops;
        if (Array.isArray(shape.gradient)) {
            const arr = shape.gradient;
            const n = arr.length;
            if (n < 2) {
                stops = (arr[0] || '#000') + ' 0deg, ' + (arr[0] || '#000') + ' 360deg';
            } else {
                stops = arr.map((c, i) => `${c} ${(i / (n - 1) * 360).toFixed(3)}deg`).join(', ');
            }
        } else {
            stops = String(shape.gradient || 'red, yellow, lime, cyan, blue, magenta, red');
        }
        const fromDeg = shape.fromAngle != null ? shape.fromAngle : 0;

        const fo = document.createElementNS(SVG_NS, 'foreignObject');
        fo.setAttribute('x', bx); fo.setAttribute('y', by);
        fo.setAttribute('width', bs); fo.setAttribute('height', bs);
        fo.setAttribute('mask', `url(#${maskId})`);

        const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.style.width = '100%';
        div.style.height = '100%';
        div.style.background = `conic-gradient(from ${fromDeg}deg at 50% 50%, ${stops})`;
        fo.appendChild(div);
        g.appendChild(fo);
        return g;
    }
    if (shape.type === 'lines') {
        // Group of <line> elements. Each line may either pick a uniform
        // color via `stroke`, or a smooth gradient along its own length via
        // `colorStart` + `colorEnd` (a per-segment <linearGradient> is
        // generated and referenced — useful to render an angularly-graded
        // ring without color discontinuities at segment joints).
        // shape.lines: [{x1, y1, x2, y2, stroke?, colorStart?, colorEnd?, opacity?}, ...]
        const g = document.createElementNS(SVG_NS, 'g');
        if (shape.strokeWidth != null) g.setAttribute('stroke-width', shape.strokeWidth);
        if (shape.stroke != null) g.setAttribute('stroke', shape.stroke);
        if (shape.opacity != null) g.setAttribute('opacity', shape.opacity);
        if (shape.linecap != null) g.setAttribute('stroke-linecap', shape.linecap);

        let defs = null;
        let gradPrefix = null;

        const lineList = shape.lines || [];
        for (let i = 0; i < lineList.length; i++) {
            const l = lineList[i];
            const ln = document.createElementNS(SVG_NS, 'line');
            ln.setAttribute('x1', l.x1); ln.setAttribute('y1', l.y1);
            ln.setAttribute('x2', l.x2); ln.setAttribute('y2', l.y2);
            if (l.colorStart != null && l.colorEnd != null) {
                if (defs == null) {
                    defs = document.createElementNS(SVG_NS, 'defs');
                    gradPrefix = 'mntviz-grad-' + Math.random().toString(36).slice(2, 8);
                    g.insertBefore(defs, g.firstChild);
                }
                const id = `${gradPrefix}-${i}`;
                const grad = document.createElementNS(SVG_NS, 'linearGradient');
                grad.setAttribute('id', id);
                grad.setAttribute('gradientUnits', 'userSpaceOnUse');
                grad.setAttribute('x1', l.x1); grad.setAttribute('y1', l.y1);
                grad.setAttribute('x2', l.x2); grad.setAttribute('y2', l.y2);
                const s0 = document.createElementNS(SVG_NS, 'stop');
                s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', l.colorStart);
                const s1 = document.createElementNS(SVG_NS, 'stop');
                s1.setAttribute('offset', '100%'); s1.setAttribute('stop-color', l.colorEnd);
                grad.append(s0, s1);
                defs.appendChild(grad);
                ln.setAttribute('stroke', `url(#${id})`);
            } else if (l.stroke != null) {
                ln.setAttribute('stroke', l.stroke);
            }
            if (l.strokeWidth != null) ln.setAttribute('stroke-width', l.strokeWidth);
            if (l.opacity != null) ln.setAttribute('opacity', l.opacity);
            g.appendChild(ln);
        }
        return g;
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
    g.setAttribute('class', 'mntviz-shapes-layer');
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
    // Stash raw items so SVG export can rebuild a native-SVG version.
    wrap._legendItems = items;

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

    _maybeEnablePicker(viewer, config);

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

    _maybeEnablePicker(viewer, config);

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

    _maybeEnablePicker(viewer, config);

    return viewer;
}

/**
 * If config.picker is truthy, enable the picker on the viewer and forward
 * picker events to config.onPickerChange. Lets every top-level plot* share
 * the integration without duplicating boilerplate.
 */
function _maybeEnablePicker(viewer, config) {
    if (!config.picker) return null;
    const opts = (config.picker === true) ? {} : config.picker;
    const picker = viewer.enablePointPicker(opts);
    if (typeof config.onPickerChange === 'function') {
        picker.on('change', config.onPickerChange);
    }
    return picker;
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
