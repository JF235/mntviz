# mntviz Python Wrapper

Thin Python wrapper for rendering minutiae visualizations. All drawing is done by the JS runtime — Python handles data loading, colormap resolution, image encoding, and config assembly.

- Outputs: `html` (standalone page), `jupyter` (inline display object)
- Preferred inputs: `.min` file path or `numpy.ndarray` (`x, y, angle, [quality]`)

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

# Standalone HTML string
html = plot_mnt(arr, output_format="html", title="Minutiae")

# Jupyter inline object
fig = plot_mnt(arr, output_format="jupyter")
fig
```

### Matching view

```python
from mntviz import load_pairs, minutiae_from_min, plot_mnt_match

latent = minutiae_from_min("../examples/sd258/000/minutiae/sd258_000_11-00_latent_bad.min")
reference = minutiae_from_min("../examples/sd258/000/minutiae/sd258_000_11-01_template_bad.min")
pairs = load_pairs("../examples/sd258/000/matching/sd258_000_11-00_latent_bad__sd258_000_11-01_template_bad.txt")

match_fig = plot_mnt_match(
    left_minutiae=latent,
    right_minutiae=reference,
    pairs=pairs,
    left_background_img="../examples/sd258/000/images/sd258_000_11-00_latent_bad.png",
    right_background_img="../examples/sd258/000/images/sd258_000_11-01_template_bad.png",
    left_title="latent",
    right_title="reference",
    show_segments=True,
    output_format="jupyter",
)

match_fig
```

## `plot_mnt` Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `minutiae` | path, ndarray, etc. | `None` | Minutiae data (required unless `overlays` is used) |
| `background_img` | path or None | `None` | Background fingerprint image |
| `output_format` | str | `"html"` | `"html"` or `"jupyter"` |
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
| `overlays` | list or None | `None` | List of `(minutiae, color)` or `(minutiae, color, shape)` tuples for multi-layer rendering |
| `overlay_labels` | list[str], bool, or None | `None` | Legend labels for overlay layers; `True` for auto-labels ("Layer 0", "Layer 1", …) |
| `labels` | Sequence or None | `None` | Per-minutia text label (str, int, or float); length must match minutiae count |
| `segments` | ndarray, list[dict], or None | `None` | Segments to draw between minutiae — either `(M, 2+)` array of `(m1, m2)` endpoint indices or a list of dicts with keys `m1`, `m2` (+ optional `color`, `width`, `alpha`). |
| `segment_color` | str | `"#00ff00"` | Default segment color when not per-segment. |
| `segment_width` | float | `1.0` | Default segment stroke width. |
| `segment_alpha` | float | `0.7` | Default segment opacity. |

## Examples

### Marker shapes

```python
plot_mnt(arr, marker_shape="diamond", output_format="jupyter")
plot_mnt(arr, marker_shape="triangle", output_format="jupyter")
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

## `plot_mnt_match` Parameters

Side-by-side match viewer with connecting segments between paired minutiae.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `left_minutiae` | path, ndarray, etc. | *(required)* | Left (e.g. latent) minutiae data |
| `right_minutiae` | path, ndarray, etc. | *(required)* | Right (e.g. reference) minutiae data |
| `pairs` | path, ndarray, or None | `None` | Pair indices; `None` assumes 1:1 (lengths must match) |
| `left_background_img` | path or None | `None` | Background image for left panel |
| `right_background_img` | path or None | `None` | Background image for right panel |
| `output_format` | str | `"html"` | `"html"` or `"jupyter"` |
| `output_path` | path or None | `None` | Save output to file |
| `marker_size` | float | `3.0` | Marker radius in pixels |
| `segment_length` | float | `8.0` | Direction line length in pixels |
| `line_width` | float | `1.2` | Stroke width |
| `base_opacity` | float | `1.0` | Base alpha (0-1) |
| `quality_alpha` | bool | `False` | Modulate opacity by quality score |
| `marker_shape` | str | `"circle"` | `"circle"`, `"triangle"`, `"square"`, or `"diamond"` |
| `color` | str | `"#00ff00"` | Default pair color |
| `colormap` | str or None | `None` | Matplotlib colormap for pair coloring |
| `colormap_values` | array or None | `None` | Values to map per pair (length must match pairs) |
| `unpaired_color` | str | `"#555555"` | Color for unpaired minutiae |
| `unpaired_opacity` | float | `0.3` | Opacity for unpaired minutiae |
| `match_line_colormap` | str or None | `None` | Separate colormap for connecting segments |
| `match_line_colormap_values` | array or None | `None` | Values to map for segment colors |
| `match_line_alpha` | float or Sequence | `0.6` | Segment opacity (scalar or per-pair) |
| `match_line_width` | float or Sequence | `1.0` | Segment width (scalar or per-pair) |
| `show_segments` | bool | `False` | Show connecting segments on load |
| `left_labels` | Sequence or None | `None` | Per-minutia labels for left panel |
| `right_labels` | Sequence or None | `None` | Per-minutia labels for right panel |
| `show_labels` | bool | `False` | Display minutia labels |
| `label_fontsize` | float or None | `None` | Label font size (auto if None) |
| `left_title` | str or None | `None` | Title for left panel |
| `right_title` | str or None | `None` | Title for right panel |
| `title` | str or None | `None` | Page title for HTML output |
| `width` / `height` | int or None | `None` | Canvas size (auto-detected from image) |
| `left_segments` / `right_segments` | ndarray, list[dict], or None | `None` | Intra-panel segments to draw on each side — `(M, 2+)` array of `(m1, m2)` endpoint indices or a list of dicts with keys `m1`, `m2` (+ optional `color`, `width`, `alpha`). Useful for SPG minutiae graphs, Delaunay, k-NN edges. |
| `segment_color` | str | `"#00ff00"` | Default intra-panel segment color. |
| `segment_width` | float | `1.0` | Default intra-panel segment stroke width. |
| `segment_alpha` | float | `0.7` | Default intra-panel segment opacity. |

### Intra-panel segments example

```python
import numpy as np
from mntviz import plot_mnt_match

# 2-column (m1, m2) index arrays are the simplest form.
left_segs = np.array([[0, 1], [1, 2], [0, 2]], dtype=int)
right_segs = np.array([[3, 4], [4, 5]], dtype=int)

plot_mnt_match(
    left_minutiae=latent, right_minutiae=reference,
    pairs=pairs,
    left_background_img="latent.png", right_background_img="ref.png",
    left_segments=left_segs, right_segments=right_segs,
    segment_color="#facc15", segment_width=1.2, segment_alpha=0.9,
    output_format="jupyter",
)
```

## `plot_overlay` Parameters

Renders a 2D numpy array as a colormapped overlay on a background image. Useful for quality maps, masks, heatmaps, etc.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | ndarray (2D) | *(required)* | 2D array to visualize |
| `background_img` | path or None | `None` | Background image |
| `cmap` | str | `"magma"` | Matplotlib colormap name |
| `alpha` | float | `0.6` | Overlay opacity (0-1) |
| `vmin` | float or None | `None` | Min value for colormap normalization |
| `vmax` | float or None | `None` | Max value for colormap normalization |
| `alpha_modulated` | bool | `False` | Modulate pixel alpha by array value |
| `title` | str or None | `None` | Page title |
| `output_format` | str | `"html"` | `"html"` or `"jupyter"` |
| `output_path` | path or None | `None` | Save output to file |
| `width` / `height` | int or None | `None` | Canvas size (auto-detected) |

### Overlay example

```python
import numpy as np
from mntviz import plot_overlay

quality_map = np.random.rand(500, 500)
plot_overlay(quality_map, background_img="fingerprint.png", cmap="RdYlGn", alpha=0.5, output_format="jupyter")
```

## `plot_huv` Parameters

Combined visualization of a heatmap overlay and a UV orientation field rendered as arrows or centered segments.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `h` | ndarray (2D) | *(required)* | Heatmap array (e.g. confidence / detection map) |
| `u` | ndarray (2D) | *(required)* | U component of orientation field |
| `v` | ndarray (2D) | *(required)* | V component of orientation field |
| `background_img` | path or None | `None` | Background image |
| `h_cmap` | str | `"magma"` | Colormap for heatmap |
| `h_alpha` | float | `0.7` | Heatmap overlay opacity |
| `h_threshold` | float | `0.05` | Min heatmap value for rendering arrows |
| `arrow_stride` | int | `4` | Sample every Nth pixel for arrows |
| `seg_base` | float | `2.0` | Base arrow length |
| `seg_gain` | float | `10.0` | Arrow length gain factor |
| `arrow_size` | float | `4.0` | Arrowhead size (for `arrow` style) |
| `line_width` | float | `0.8` | Arrow/segment stroke width |
| `arrow_color` | str | `"#43C4E4"` | Arrow color |
| `arrow_style` | str | `"arrow"` | `"arrow"` (directed) or `"segment"` (centered, no arrowhead) |
| `segment_length` | float | `6.0` | Length of centered segments (when `arrow_style="segment"`) |
| `modulation` | ndarray (2D) or None | `None` | Per-arrow modulation values (same shape as h) |
| `modulation_target` | str | `"none"` | `"none"`, `"alpha"`, `"width"`, or `"both"` |
| `modulation_alpha_min` | float | `0.1` | Min alpha fraction when modulating |
| `modulation_width_min` | float | `0.3` | Min width fraction when modulating |
| `title` | str or None | `None` | Page title |
| `output_format` | str | `"html"` | `"html"` or `"jupyter"` |
| `output_path` | path or None | `None` | Save output to file |
| `width` / `height` | int or None | `None` | Canvas size (auto-detected) |

### HUV example

```python
import numpy as np
from mntviz import plot_huv

h = np.random.rand(128, 128)
u = np.cos(np.random.rand(128, 128) * np.pi)
v = np.sin(np.random.rand(128, 128) * np.pi)

plot_huv(h, u, v, background_img="fingerprint.png", arrow_style="segment", output_format="jupyter")
```

## `MntVizFigure`

Return type when `output_format="jupyter"`. Renders inline in Jupyter notebooks via `_repr_html_()`.

| Method | Description |
| --- | --- |
| `to_html(standalone=False)` | Get HTML string; `standalone=True` returns a full page with `<html>` wrapper |
| `_repr_html_()` | Jupyter display hook (inline HTML) |
| `_repr_mimebundle_(...)` | Jupyter MIME bundle (`text/html`) |

## Building the JS Bundle

The bundle is pre-built and included in the package. To rebuild after editing JS sources:

```bash
cd ..          # repo root
npm install    # first time only
npm run build  # src/plots.js → python/src/mntviz/_bundle/plots.bundle.js
```

## Notes

- `colormap` and `colormap_values` must both be provided or both be `None`.
- `overlays` and `colormap` are mutually exclusive.
- When `overlays` is used, `minutiae` must be `None`.
- Dictionary-based rows are still accepted but deprecated.
- Pair files accept one `left_idx right_idx` record per line; comments starting with `#` are ignored.
- For full JS-side interaction details, see [../USAGE.md](../USAGE.md).
- Notebook example: `notebooks/mntviz_sd258_example.ipynb`.
