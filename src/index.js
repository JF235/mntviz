/**
 * mntviz — Biometric visualization library.
 *
 * Provides interactive viewers for fingerprint minutiae, UV direction fields,
 * heatmap overlays, and mask overlays.
 *
 * Usage:
 *   import { Viewer, MinutiaeRenderer, UVFieldRenderer, OverlayLayer, parseMinutiaeText } from './mntviz/index.js';
 */

export { Viewer } from './viewer.js';
export { MinutiaeRenderer, createMarkerShape, parseMinutiaeText, minutiaDataMap } from './minutiae-renderer.js';
export { UVFieldRenderer } from './uv-renderer.js';
export { OverlayLayer } from './overlay.js';
export { MinutiaeInspector } from './minutiae-inspector.js';
export { MatchViewer } from './match-viewer.js';
