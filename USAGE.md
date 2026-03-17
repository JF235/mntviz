# mntviz Usage

Detailed usage and API reference for the JavaScript runtime and Python wrapper.

## JavaScript

### Public Modules

- `Viewer` from `src/viewer.js`
- `MinutiaeRenderer`, `createMarkerShape`, and `parseMinutiaeText` from `src/minutiae-renderer.js`
- `MinutiaeInspector` from `src/minutiae-inspector.js`
- `UVFieldRenderer` from `src/uv-renderer.js`
- `OverlayLayer` from `src/overlay.js`

Import through `src/index.js`:

```javascript
import {
  Viewer,
  MinutiaeRenderer,
  createMarkerShape,
  MinutiaeInspector,
  parseMinutiaeText,
  UVFieldRenderer,
  OverlayLayer,
} from './mntviz/index.js';
```

### Minimal Viewer + Minutiae

```javascript
const viewer = new Viewer('#viewer');
await viewer.loadImage('/path/to/fingerprint.png');

const renderer = new MinutiaeRenderer(viewer.svgLayer);
renderer.draw(
  [
    { x: 150, y: 200, angle: 45, quality: 90 },
    { x: 300, y: 180, angle: 120, quality: 60 },
  ],
  '#00ff00',
  { markerSize: 3, segmentLength: 8 }
);
```

### Minutiae Inspector (hover/click)

Recommended lifecycle via `Viewer`:

```javascript
viewer.enableMinutiaeInspector({
  getAllMinutiae: () => allMinutiae,
  patchMode: 'visible', // none | visible | all
});

// later
viewer.disableMinutiaeInspector();
```

Or manual usage:

```javascript
const inspector = new MinutiaeInspector(viewer, {
  getAllMinutiae: () => allMinutiae,
  patchMode: 'visible',
});
inspector.enable();
```

### API Summary

#### `Viewer(container, options?)`

- `options.minimap` (default `true`)
- `options.onResize` callback

Main members:

- `svgLayer`
- `canvasContainer`
- `imageSize`
- `loadImage(src)`
- `clear()`
- `resetView()`
- `destroy()`
- `enableMinutiaeInspector(options?)`
- `disableMinutiaeInspector()`

#### `MinutiaeRenderer(svgElement)`

- `draw(minutiae, color, options?)`
- `clear()`

`minutiae` format:

- `Array<{x, y, angle, quality}>`

draw options:

- `markerSize` (default `2`)
- `segmentLength` (default `5`)
- `lineWidth` (default `1`)
- `baseOpacity` (default `1.0`)
- `qualityAlpha` (default `true`) — modulate opacity by `quality/100`; set to `false` for uniform opacity
- `markerShape` (default `'circle'`) — `'circle'`, `'triangle'`, `'square'`, or `'diamond'`
- `showQuality` (default `false`)
- `showAngles` (default `false`)
- `label` (optional source tag)

Per-minutia color: if a minutia object has a `_color` field, it overrides the `color` argument for that marker.

#### `MinutiaeInspector(viewer, options?)`

- `enable()` / `disable()`
- `setOptions(options)`
- `destroy()`

Common options:

- `getAllMinutiae`
- `patchMode` (`none`, `visible`, `all`)
- `patchSize`, `patchDisplaySize`, `nearbyRadius`
- `patchUseColors`, `patchAlphaMultiplier`

#### `parseMinutiaeText(text)`

Parses text rows in format `x y angle [quality]` (`#` comments supported).

#### `UVFieldRenderer(svgElement)`

- `draw(arrows, options?)`
- `clear()`

`arrows` format:

- `Array<[x, y, dx, dy, confidence]>`

#### `OverlayLayer(container, options?)`

- `load(src)`
- `show()` / `hide()` / `toggle()`
- `setOpacity(value)`
- `clear()`
- `destroy()`

## Python Wrapper

Python docs are in `python/README.md`.

Quick reminder:

- Wrapper role: render/export (`svg`, `html`, `jupyter`)
- JS runtime handles hover/click minutiae interaction

```python
from mntviz import minutiae_from_min, plot_mnt

arr = minutiae_from_min('examples/sd258/000/minutiae/sd258_000_11-00_latent_bad.min')
fig = plot_mnt(arr, output_format='jupyter')
```

For a complete runnable notebook, see:

- `python/notebooks/mntviz_sd258_example.ipynb`
