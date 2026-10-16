/**
 * mntviz/orientation-field.js — Decode a single-channel angle map into direction segments.
 *
 * Orientation fields are often stored as an 8-bit image, one angle per cell. This reads such an
 * image and samples it on a regular grid, producing `[x, y, dx, dy, 1]` entries that
 * `UVFieldRenderer.draw(segments, { style: 'segment' })` draws as short centred line segments.
 *
 * Usage:
 *   import { Viewer, UVFieldRenderer, orientationSegments } from './mntviz/index.js';
 *   const layer = viewer.layers.add('orientation', { kind: 'svg', z: 15 });
 *   const segments = await orientationSegments('/maps/ori.png', { stride: 10 });
 *   new UVFieldRenderer(layer).draw(segments, { style: 'segment', segmentLength: 10 });
 */

/** Default decoding: byte = round(theta_deg + 90), theta in [-90, 90); byte 0 = no data. */
const defaultDecode = (byte) => (byte === 0 ? null : byte - 90);

/** Waits for an <img> to finish loading (resolves immediately when it already has). */
function whenLoaded(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve(img);
    return new Promise((resolve, reject) => {
        img.addEventListener('load', () => resolve(img), { once: true });
        img.addEventListener('error', () => reject(new Error('mntviz: cannot decode the orientation map')), { once: true });
    });
}

/** Reads any accepted source into `{ data, width, height, channels }` (`channels` = values per pixel in `data`). */
async function readPixels(src) {
    if (src && typeof src === 'object' && src.data && Number.isFinite(src.width) && Number.isFinite(src.height)) {
        const { data, width, height } = src;
        const channels = Math.max(1, Math.round(data.length / Math.max(1, width * height)));
        return { data, width, height, channels };
    }
    let drawable = src;
    if (typeof src === 'string') {
        const img = new Image();
        img.src = src;
        drawable = await whenLoaded(img);
    } else if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
        drawable = await whenLoaded(src);
    }
    const width = drawable.naturalWidth || drawable.width;
    const height = drawable.naturalHeight || drawable.height;
    if (!width || !height) throw new Error('mntviz: the orientation map is empty');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(drawable, 0, 0);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height, channels: 4 };
}

/**
 * Decodes a single-channel angle map (default: byte = round(theta_deg + 90), theta in [-90, 90), 0 = no data) into
 * [x, y, dx, dy, 1] segments for UVFieldRenderer ('segment' style). Samples every `stride` px of the map, starting at
 * stride/2; (dx, dy) = (cos, +sin) in image coordinates (y down); x, y are multiplied by scaleX/scaleY so a map on a
 * resampled grid lands on the displayed image.
 * @param {string|HTMLImageElement|ImageBitmap|{data: ArrayLike<number>, width: number, height: number}} src
 *        An image URL, a loaded image, or raw pixels (one value per pixel, or RGBA with the angle in R).
 * @param {{stride?: number, scaleX?: number, scaleY?: number, decode?: (byte: number) => number|null}} [opts]
 *        `decode` maps a byte to the angle in degrees (image coordinates, y down) or to null/NaN to skip the cell.
 * @returns {Promise<Array<[number, number, number, number, number]>>}
 */
export async function orientationSegments(src, opts = {}) {
    const stride = Math.max(1, Math.round(opts.stride ?? 10));
    const scaleX = opts.scaleX ?? 1;
    const scaleY = opts.scaleY ?? 1;
    const decode = opts.decode ?? defaultDecode;
    const { data, width, height, channels } = await readPixels(src);

    const segments = [];
    const start = Math.floor(stride / 2);
    for (let y = start; y < height; y += stride) {
        for (let x = start; x < width; x += stride) {
            const angle = decode(data[(y * width + x) * channels]);
            if (angle == null || !Number.isFinite(angle)) continue;
            const rad = (angle * Math.PI) / 180;
            segments.push([x * scaleX, y * scaleY, Math.cos(rad), Math.sin(rad), 1]);
        }
    }
    return segments;
}
