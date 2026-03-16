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

### Notes

- Dictionary-based rows are still accepted but deprecated.
- For full JS-side interaction details, see [../USAGE.md](../USAGE.md).
- Notebook example: `notebooks/mntviz_sd258_example.ipynb`.
