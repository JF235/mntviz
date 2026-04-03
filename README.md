# mntviz

Visualization toolkit for fingerprint minutiae and related overlays.

## Architecture

```
src/           JS runtime (Viewer, MinutiaeRenderer, Inspector, Overlay, UV, MatchViewer)
  plots.js     High-level facade (plotMinutiae, plotOverlay, plotHuv, plotMatch)
widget/        Web Component (<mntviz-widget>) for drop-in HTML usage
python/        Thin Python wrapper — data prep + config JSON, all rendering by JS
```

The Python wrapper prepares data (loads minutiae, encodes images, resolves colormaps) and passes a JSON config to the JS bundle. **All drawing logic lives in JavaScript.**

## Quick Start (JavaScript)

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

## Quick Start (Python)

```bash
cd python && pip install -e .
```

```python
from mntviz import minutiae_from_min, plot_mnt

arr = minutiae_from_min('examples/sd258/000/minutiae/sd258_000_11-00_latent_bad.min')
fig = plot_mnt(arr, output_format='jupyter')
```

The SD258 example also includes a match viewer driven by a pair file in `examples/sd258/000/matching/` and demonstrated in `python/notebooks/mntviz_sd258_example.ipynb`.

## Widget (zero-config)

```html
<script type="module" src="widget/mntviz-widget.js"></script>
<mntviz-widget style="width: 100%; height: 500px;"></mntviz-widget>
```

Drop images and `.min` files onto the widget. Multiple layers supported.

## Building the JS Bundle

The Python package includes a pre-built bundle. To rebuild after editing JS:

```bash
npm install    # first time only
npm run build  # bundles src/plots.js → python/src/mntviz/_bundle/plots.bundle.js
```

## Documentation

- JS API reference: [USAGE.md](USAGE.md)
- Python wrapper docs: [python/README.md](python/README.md)
- Example notebook: `python/notebooks/mntviz_sd258_example.ipynb`

## Browser Requirements

Modern browsers with ES module support, `ResizeObserver`, and `AbortController`.
