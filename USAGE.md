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
- `LayerStack`, `Layer` from `src/layer-stack.js` (use `viewer.layers`)
- `Emitter`, `Selection` from `src/events.js`
- `singularityDataMap` from `src/singularity-renderer.js`

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
  markerVisibility: { left: 'paired', right: 'all' },   // per panel; see below
});

await mv.loadImages('/latent.png', '/reference.png');
```

#### Marker visibility — two independent layers

**Markers and connector lines are independent.** Connectors are positioned from the
minutiae *data*, not from the marker DOM, so hiding markers leaves the lines intact —
lines over a clean image is a valid state.

Each panel has its own marker visibility, cyclable at runtime from that panel's
**right-click menu** (`Points: all → paired → none`), or from code:

```javascript
mv.setMarkerVisibility('left', 'paired');   // 'left' | 'right' | 'both'
mv.getMarkerVisibility('left');             // → 'paired'
mv.setSegmentsVisible(false);               // the connectors (same state as double-click)
```

| mode | draws |
|---|---|
| `all` | every marker (default) |
| `paired` | only markers a connector lands on — the decluttered middle state: a dense panel drops to the endpoints you are actually reading, while the ridges stay legible |
| `none` | no markers |

`paired` is derived from the current `pairs` array, so it stays correct after
`setPairs()`. A panel showing fewer markers than there are pairs is not a bug — two
pairs may share one endpoint.

### Camadas, eventos e seleção

Cada viewer tem uma pilha de camadas (`viewer.layers`). Uma camada tem nome, tipo, z,
visibilidade e opacidade, e um elemento próprio dentro do container que o viewer transforma:
pan, zoom, rotação e espelho valem para todas sem sincronização manual.

```javascript
const v = new Viewer('#viewer');
await v.loadImage('/img/latente.png');

const seg = v.layers.add('segments', { kind: 'svg', z: 10 });       // <g> próprio
const mnt = v.layers.add('minutiae', { kind: 'svg', z: 20 });
new SegmentsRenderer(seg).draw(minutiae, segmentos);
const r = new MinutiaeRenderer(mnt);                                // aceita a camada
r.draw(minutiae, '#00ff00');
r.clear();                                                          // limpa só 'minutiae'

v.layers.get('segments').hide();            // oculta: sai também da exportação SVG
v.layers.get('minutiae').setOpacity(0.5);   // exporta como <g opacity="0.5">
v.layers.get('minutiae').setZ(5);           // reordena

const estado = v.layers.serialize();        // {version, layers: [{name, kind, z, visible, opacity}]}
outroViewer.layers.restore(estado);         // cria as que faltam, aplica z/visível/opacidade
```

Tipos de camada:

| `kind` | elemento | uso |
| --- | --- | --- |
| `svg` (padrão) | `<g class="mntviz-layer">` no SVG comum, acima de tudo | renderers |
| `canvas` | `<canvas>` no tamanho natural da imagem, abaixo do SVG | raster desenhado pelo app (`layer.ctx`) |
| `html` | `<div>` no tamanho natural da imagem, abaixo do SVG | hospedar um `OverlayLayer` ou DOM livre |

Os renderers recebem uma camada, um elemento SVG ou o próprio `Viewer` (SVG comum, como
antes). Num alvo próprio, `clear()` esvazia o alvo; no SVG comum, tira só o que aquele
renderer desenhou. `viewer.clear()` mantém as camadas (vazias).

Eventos do viewer (`on` devolve a função que cancela):

```javascript
v.on('pointer', (p) => status(`${p.px}, ${p.py}`));  // move|down|up|click|leave; x, y em coordenadas da imagem
v.on('select', ({ items, added, removed, source }) => ...);
v.on('change', (c) => ...);   // {source: 'layers'|'picker', type, ...}
v.on('view', (s) => ...);     // {scale, translateX, translateY, rotation, flipX}
```

`p.target` traz o marcador sob o cursor (`{layer, kind: 'minutia'|'singularity', id, data}`).
A seleção (`v.selection`) é uma `Selection`: `set`, `add`, `remove`, `toggle`, `clear`, com
evento `change`. Para ligar viewers e tabelas, use a mesma instância:
`v1.setSelection(sel); v2.setSelection(sel)`. Com `v.enableClickSelect()`, clicar num marcador
seleciona (Shift alterna; clique no vazio limpa) e o marcador ganha a classe `mntviz-selected`.

### Rotação, espelho e coordenadas

```javascript
v.rotate90();        // +90° (horário na tela); v.rotate90(-1) anti-horário
v.setFlip(true);     // espelho horizontal, antes da rotação, em torno do centro da imagem
v.fit();             // ajusta ao viewport mantendo rotação e espelho (resetView zera os dois)
v.setView({ scale: 2, rotation: 90, flipX: false, translateX: 10, translateY: 0 });

v.screenToImageCoords(e.clientX, e.clientY);   // tela → imagem (rotação e espelho incluídos)
v.imageToScreenCoords(x, y);                   // imagem → tela
v.viewMatrix();                                // DOMMatrix imagem → viewport
```

O `PointPicker`, o `FieldProbe` e o evento `pointer` usam essa mesma transformação, então
acertam o ponto com a imagem girada ou espelhada. `exportSVGView()` sem rotação nem espelho
usa um `viewBox` na região visível (coordenadas da imagem, como antes); com rotação ou espelho,
gera um SVG do tamanho do viewport com a transformação viva num `<g>`.

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
- `layers` (`LayerStack`: `add`, `ensure`, `get`, `has`, `remove`, `list`, `clear`, `serialize`, `restore`)
- `on(event, fn)`, `once`, `off` — eventos `pointer`, `select`, `change`, `view`
- `selection`, `setSelection(sel)`, `enableClickSelect({multiKey})`, `refreshSelection()`, `itemFromElement(el)`
- `rotate90(dir?)`, `setFlip(flipX)`, `toggleFlip()`, `flipX`, `fit()`, `getView()`, `setView(state)`
- `screenToImageCoords(x, y)`, `imageToScreenCoords(x, y)`, `viewMatrix()`, `visibleRegion()`

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
