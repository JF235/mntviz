# mntviz Python wrapper

Python wrapper for minutiae visualization with a simple API:

```python
from mntviz import plot_mnt

fig = plot_mnt(minutiae, background_img=background_img, output_format="jupyter")
fig  # inline in Jupyter
```

Preferred `minutiae` inputs:

- `.min` file path
- `numpy.ndarray` with columns `x, y, angle, [quality]`

Dictionary rows are still accepted for compatibility but deprecated.

Example conversion:

```python
from mntviz import minutiae_from_min, plot_mnt

arr = minutiae_from_min("examples/sd258/000/minutiae/sd258_000_11-00_latent_bad.min")
html = plot_mnt(arr, output_format="html")
```

## Output formats

- `svg`: returns SVG text.
- `html`: returns standalone HTML text (interactive pan/zoom).
- `jupyter`: returns a displayable object with `_repr_html_`.

## Install locally

```bash
cd python
pip install -e .
```

## Notebook example

- `notebooks/mntviz_sd258_example.ipynb`
- Generates preview assets in `docs/assets/` for README usage.
