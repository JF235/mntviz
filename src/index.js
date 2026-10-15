/**
 * mntviz — Biometric visualization library.
 *
 * Provides interactive viewers for fingerprint minutiae, UV direction fields,
 * heatmap overlays, and mask overlays.
 *
 * Usage:
 *   import { Viewer, MinutiaeRenderer, UVFieldRenderer, OverlayLayer, parseMinutiaeText } from './mntviz/index.js';
 *
 * Camadas, eventos e seleção: viewer.layers (LayerStack), viewer.on(...),
 * viewer.selection (Selection). Ver viewer.js e layer-stack.js.
 */

export { Viewer } from './viewer.js';
export { MinutiaeRenderer, createMarkerShape, parseMinutiaeText, minutiaDataMap } from './minutiae-renderer.js';
export { SegmentsRenderer, segmentDataMap } from './segments-renderer.js';
export { UVFieldRenderer } from './uv-renderer.js';
export { OverlayLayer } from './overlay.js';
export { MinutiaeInspector } from './minutiae-inspector.js';
export { FieldProbe } from './field-probe.js';
export { MatchViewer } from './match-viewer.js';
export { SingularityRenderer, parseSingularityText, singularityDataMap } from './singularity-renderer.js';
export { PointPicker } from './point-picker.js';
export { plotHuvThumbnail, renderLegend } from './plots.js';
export { applyColormap, COLORMAP_NAMES } from './colormaps.js';
export { MultiViewer } from './multi-viewer.js';
export { LayerStack, Layer } from './layer-stack.js';
export { Emitter, Selection } from './events.js';
// Editores e ferramentas de perito
export { ToolModes, History, GYRO, GYRO_KEYS, MODES, MODE_LABELS, DEFAULT_MODE_KEYS, isoAngle, uprightTransform } from './tools.js';
export { FeatureEditor, MINUTIA_TYPES } from './feature-editor.js';
export { ImageAdjust, buildLut, describeAdjust, ADJUST_OPS } from './image-adjust.js';
export { CorrespondenceEditor, PAIR_TYPES, PAIR_TYPE_LABELS, PAIR_COLORS, parseMatchText, formatMatchText,
    parseCorrText, formatCorrText, parsePairsText, detectPairsFormat } from './correspondence-editor.js';
export { mlsRigid, buildWarp, estimateTransform, estimateRigid, applyRigid, invertRigid, warpImage } from './registration.js';
export { Ruler, RidgeCount, ScaleBar, mmFromPx, ridgeProfile, smoothProfile, findRidges, scaleBarSVG } from './measure.js';
export { ReportExporter, MNTVIZ_VERSION, sha256Hex, sha256HexSync } from './report-exporter.js';
