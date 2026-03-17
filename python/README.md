# mntviz Python Wrapper

Thin Python wrapper for rendering/exporting minutiae visualizations.

- Outputs: `svg`, `html`, `jupyter`
- Preferred inputs: `.min` file path or `numpy.ndarray` (`x, y, angle, [quality]`)
- Advanced interaction logic belongs to the JavaScript runtime (`src/`)

## Install

```bash
cd python
pip install -e .
```

For colormap support, also install matplotlib:

```bash
pip install matplotlib
```

## Usage

```python
from mntviz import minutiae_from_min, plot_mnt

arr = minutiae_from_min("../examples/sd258/000/minutiae/sd258_000_11-00_latent_bad.min")

# SVG string
svg = plot_mnt(arr, output_format="svg")

# Standalone HTML string
html = plot_mnt(arr, output_format="html", title="Minutiae")

# Jupyter inline object
fig = plot_mnt(arr, output_format="jupyter")
fig
```

## `plot_mnt` Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `minutiae` | path, ndarray, etc. | `None` | Minutiae data (required unless `overlays` is used) |
| `background_img` | path or None | `None` | Background fingerprint image |
| `output_format` | str | `"html"` | `"svg"`, `"html"`, or `"jupyter"` |
| `output_path` | path or None | `None` | Save output to file |
| `color` | str | `"#00ff00"` | CSS color for markers |
| `marker_size` | float | `2.0` | Marker radius in pixels |
| `segment_length` | float | `5.0` | Direction line length in pixels |
| `line_width` | float | `1.0` | Stroke width |
| `base_opacity` | float | `1.0` | Base alpha (0-1) |
| `quality_alpha` | bool | `True` | Modulate opacity by quality score |
| `marker_shape` | str | `"circle"` | `"circle"`, `"triangle"`, `"square"`, or `"diamond"` |
| `show_quality` | bool | `False` | Show quality labels |
| `show_angles` | bool | `False` | Show angle labels |
| `width` / `height` | int or None | `None` | Canvas size (auto-detected from image) |
| `title` | str or None | `None` | Page title for HTML output |
| `colormap` | str or None | `None` | Matplotlib colormap name (e.g. `"viridis"`) |
| `colormap_values` | array or None | `None` | Numeric values to map (length must match minutiae) |
| `overlays` | list or None | `None` | List of `(minutiae, color)` tuples for multi-layer rendering |

## Examples

### Marker shapes

```python
plot_mnt(arr, marker_shape="diamond", output_format="jupyter")
plot_mnt(arr, marker_shape="triangle", output_format="jupyter")
```

### Disable quality-based alpha

```python
plot_mnt(arr, base_opacity=0.8, quality_alpha=False, output_format="svg")
```

### Colormap by quality

```python
import numpy as np

qualities = arr[:, 3]  # quality column
plot_mnt(arr, colormap="viridis", colormap_values=qualities, output_format="jupyter")
```

### Multiple minutiae on the same image

```python
plot_mnt(
    overlays=[
        (latent_arr, "#00ff88"),
        (tenprint_arr, "#22d3ee"),
    ],
    background_img="fingerprint.png",
    output_format="jupyter",
)
```

### Notes

- `colormap` and `colormap_values` must both be provided or both be `None`.
- `overlays` and `colormap` are mutually exclusive.
- When `overlays` is used, `minutiae` must be `None`.
- Dictionary-based rows are still accepted but deprecated.
- For full JS-side interaction details, see [../USAGE.md](../USAGE.md).
- Notebook example: `notebooks/mntviz_sd258_example.ipynb`.
