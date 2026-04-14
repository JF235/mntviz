# mntviz Usage

Detailed usage and API reference for the JavaScript runtime and Python wrapper.

## JavaScript

### Public Modules

- `Viewer` from `src/viewer.js`
- `MatchViewer` from `src/match-viewer.js`
- `MinutiaeRenderer`, `createMarkerShape`, `parseMinutiaeText`, and `minutiaDataMap` from `src/minutiae-renderer.js`
- `MinutiaeInspector` from `src/minutiae-inspector.js`
- `UVFieldRenderer` from `src/uv-renderer.js`
- `OverlayLayer` from `src/overlay.js`
- `plotHuvThumbnail` from `src/plots.js`

Import through `src/index.js`:

```javascript
import {
  Viewer,
  MatchViewer,
  MinutiaeRenderer,
  createMarkerShape,
  minutiaDataMap,
  MinutiaeInspector,
  parseMinutiaeText,
  UVFieldRenderer,
  OverlayLayer,
  plotHuvThumbnail,
} from './mntviz/index.js';
```

### Minimal Viewer + Minutiae (with image)

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

### Match Viewer

```javascript
const mv = new MatchViewer('#viewer', {
  leftMinutiae,
  rightMinutiae,
  pairs: [{ leftIdx: 0, rightIdx: 3 }, { leftIdx: 1, rightIdx: 7 }],
  leftTitle: 'latent',
  rightTitle: 'reference',
  showSegmentsOnLoad: true,
});

await mv.loadImages('/latent.png', '/reference.png');
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
- `setViewportSize(width, height)` — set a virtual canvas size without loading an image (useful for minutiae-only views)
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

#### `minutiaDataMap` (WeakMap)

A `WeakMap<SVGElement, Object>` that associates each rendered SVG marker element with its original minutia data object. Useful for building custom interactions on top of rendered minutiae (e.g. click handlers that need the underlying `{x, y, angle, quality}` record).

#### `plotHuvThumbnail(host, config)` (async)

Renders a lightweight static SVG thumbnail of an HUV plot inside `host`. Clicking the thumbnail opens a full interactive viewer in a modal. The `config` object follows the same schema as the internal `plotHuv` config (image source, overlay, arrows, arrow options). Returns the wrapper `HTMLElement`.

### Minutiae-Only View (no image)

```javascript
const viewer = new Viewer('#viewer');
viewer.setViewportSize(500, 500);

const renderer = new MinutiaeRenderer(viewer.svgLayer);
renderer.draw(
  [{ x: 150, y: 200, angle: 45, quality: 90 }],
  '#00ff00',
  { markerSize: 3, segmentLength: 8 }
);
```

When `loadImage()` is called later, the virtual viewport is replaced by the real image dimensions.

---

## Widget (`<mntviz-widget>`)

Self-contained Web Component with drag-and-drop file loading. Include it in any HTML page:

```html
<script type="module" src="widget/mntviz-widget.js"></script>

<mntviz-widget style="width: 100%; height: 500px;"></mntviz-widget>
```

### Attributes

| Attribute | Default   | Description                       |
|-----------|-----------|-----------------------------------|
| `width`   | `100%`    | CSS width of the widget           |
| `height`  | `400px`   | CSS height of the widget          |
| `color`   | `#00ff00` | Default minutiae color            |

### Drag-and-Drop

Drop image files (`.png`, `.jpg`, `.bmp`, `.tiff`, `.webp`) and minutiae files (`.min`, `.txt`, `.csv`) onto the widget. Multiple `.min` layers are rendered with automatic color cycling.

### Programmatic API

```javascript
const widget = document.querySelector('mntviz-widget');

// Load an image
await widget.loadImage('path/to/image.png');

// Add minutiae from .min-format text
widget.addMinutiae('418 371 337 52\n393 438 331 33', {
  name: 'probe',
  color: '#ff4444',
});

// Clear everything
widget.clear();
```

### Toolbar

- **+ Add** — open file picker to add more images or minutiae files
- **↺ Reset** — fit the view to the viewport
- **✕ Clear** — remove all layers and return to the drop zone

---

## Python Wrapper

Python docs are in `python/README.md`.

Quick reminder:

- Wrapper role: data prep + config JSON → JS does all rendering
- Output formats: `html` (standalone page) or `jupyter` (inline display object)

```python
from mntviz import minutiae_from_min, plot_mnt

arr = minutiae_from_min('examples/sd258/000/minutiae/sd258_000_11-00_latent_bad.min')
fig = plot_mnt(arr, output_format='jupyter')
```

For a complete runnable notebook, see:

- `python/notebooks/mntviz_sd258_example.ipynb`
