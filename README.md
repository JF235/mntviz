# mntviz

Visualization toolkit for fingerprint minutiae and related overlays.

It has three parts:

- JavaScript runtime in `src/` (Viewer, MinutiaeRenderer, MinutiaeInspector, UVFieldRenderer, OverlayLayer)
- Embeddable Web Component in `widget/` (`<mntviz-widget>`) for drop-in usage in any HTML page
- Thin Python wrapper in `python/` for SVG/HTML export and Jupyter rendering, with support for custom marker shapes, colormaps, quality-based alpha, and multi-layer overlays

## Quick Start (JavaScript)

1. Copy `src/` into your static assets.
2. Include `mntviz.css`.
3. Import from `index.js`.

```html
<link rel="stylesheet" href="/static/mntviz/mntviz.css" />
<div id="viewer" style="width: 800px; height: 600px"></div>

<script type="module">
  import { Viewer, MinutiaeRenderer } from '/static/mntviz/index.js';

  const viewer = new Viewer('#viewer');
  await viewer.loadImage('/path/to/fingerprint.png');

  const renderer = new MinutiaeRenderer(viewer.svgLayer);
  renderer.draw([{ x: 150, y: 200, angle: 45, quality: 90 }], '#00ff00');
  viewer.enableMinutiaeInspector({ patchMode: 'visible' });
</script>
```

## Widget (zero-config)

The `<mntviz-widget>` Web Component provides a self-contained viewer with drag-and-drop support. Include it in any HTML or Markdown-rendered page:

```html
<script type="module" src="widget/mntviz-widget.js"></script>

<mntviz-widget style="width: 100%; height: 500px;"></mntviz-widget>
```

Drop image files (`.png`, `.jpg`, `.bmp`, `.tiff`, `.webp`) and minutiae files (`.min`, `.txt`) onto the widget. Multiple `.min` layers are supported with automatic color assignment.

See `widget/example.html` for a complete demo.

## Documentation

- Detailed JS usage/API: [USAGE.md](USAGE.md)
- Python wrapper docs: [python/README.md](python/README.md)
- Example notebook: `python/notebooks/mntviz_sd258_example.ipynb`

## Browser Requirements

Modern browsers with ES module support, `ResizeObserver`, and `AbortController`.
