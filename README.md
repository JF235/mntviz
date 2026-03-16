# mntviz

Visualization toolkit for fingerprint minutiae and related overlays.

It has two parts:

- JavaScript runtime in `src/` (Viewer, MinutiaeRenderer, MinutiaeInspector, UVFieldRenderer, OverlayLayer)
- Thin Python wrapper in `python/` for SVG/HTML export and Jupyter rendering

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

## Documentation

- Detailed JS usage/API: [USAGE.md](USAGE.md)
- Python wrapper docs: [python/README.md](python/README.md)
- Example notebook: `python/notebooks/mntviz_sd258_example.ipynb`

## Browser Requirements

Modern browsers with ES module support, `ResizeObserver`, and `AbortController`.
