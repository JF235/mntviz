from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
import base64
import json
import math
import mimetypes
from urllib.parse import quote
import warnings
from uuid import uuid4
import io

import numpy as np
from PIL import Image


# ── Data loading helpers ─────────────────────────────────────


def _parse_min_file(minutiae_file: str | Path) -> list[dict[str, float]]:
    path = Path(minutiae_file)
    if not path.exists():
        raise FileNotFoundError(f"minutiae file not found: {path}")
    if path.suffix.lower() != ".min":
        raise ValueError("minutiae file must use .min extension")

    records: list[dict[str, float]] = []
    for idx, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.replace(",", " ").split()
        if len(parts) < 3:
            raise ValueError(f"invalid .min row at line {idx}: expected at least x y angle")

        try:
            x = float(parts[0])
            y = float(parts[1])
            angle = float(parts[2])
            quality = float(parts[3]) if len(parts) > 3 else 100.0
        except ValueError as exc:
            raise ValueError(f"invalid numeric values in .min row at line {idx}") from exc

        records.append({"x": x, "y": y, "angle": angle, "quality": quality})

    if not records:
        raise ValueError(".min file does not contain minutiae rows")

    return records


def _records_from_numpy(minutiae: np.ndarray) -> list[dict[str, float]]:
    arr = np.asarray(minutiae)
    if arr.ndim != 2:
        raise ValueError("numpy minutiae must be a 2D array with shape (N, 3+)")
    if arr.shape[1] < 3:
        raise ValueError("numpy minutiae must have at least 3 columns: x, y, angle")
    if arr.shape[0] == 0:
        raise ValueError("minutiae is empty")

    records: list[dict[str, float]] = []
    for row in arr:
        quality = float(row[3]) if arr.shape[1] > 3 else 100.0
        records.append({"x": float(row[0]), "y": float(row[1]), "angle": float(row[2]), "quality": quality})
    return records


def minutiae_from_min(minutiae_file: str | Path) -> np.ndarray:
    """Load a .min file and return a numpy array with columns x, y, angle, quality."""
    records = _parse_min_file(minutiae_file)
    return np.array([[r["x"], r["y"], r["angle"], r["quality"]] for r in records], dtype=float)


def load_minutiae(minutiae: Any) -> list[dict[str, float]]:
    """Load minutiae from .min file, numpy array, or legacy iterables.

    Recommended inputs are:
    - `.min` file path
    - numpy array with shape (N, 3+) ordered as x, y, angle, [quality]

    Legacy dictionary-based rows are still accepted but deprecated.
    """
    if isinstance(minutiae, (str, Path)):
        return _parse_min_file(minutiae)

    if isinstance(minutiae, np.ndarray):
        return _records_from_numpy(minutiae)

    if hasattr(minutiae, "to_dict"):
        try:
            minutiae = minutiae.to_dict(orient="records")
        except TypeError:
            minutiae = minutiae.to_dict()

    if not isinstance(minutiae, Iterable) or isinstance(minutiae, (str, bytes, bytearray)):
        raise TypeError("minutiae must be an iterable of dicts or tuples")

    records: list[dict[str, float]] = []
    warned_dict_input = False
    for idx, item in enumerate(minutiae):
        if isinstance(item, Mapping):
            if not warned_dict_input:
                warnings.warn(
                    "Dictionary-based minutiae rows are deprecated and will be removed in a future release. "
                    "Use a .min file path or a numpy array instead.",
                    DeprecationWarning,
                    stacklevel=2,
                )
                warned_dict_input = True
            x = item.get("x")
            y = item.get("y")
            angle = item.get("angle")
            quality = item.get("quality", 100)
        elif isinstance(item, Sequence) and len(item) >= 3:
            x, y, angle = item[0], item[1], item[2]
            quality = item[3] if len(item) > 3 else 100
        else:
            raise ValueError(f"invalid minutia at index {idx}: expected dict or tuple")

        if x is None or y is None or angle is None:
            raise ValueError(f"minutia at index {idx} is missing x, y or angle")

        try:
            records.append({"x": float(x), "y": float(y), "angle": float(angle), "quality": float(quality)})
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid numeric values in minutia at index {idx}") from exc

    if not records:
        raise ValueError("minutiae is empty")

    return records


def _parse_pairs_file(pair_file: str | Path) -> np.ndarray:
    path = Path(pair_file)
    if not path.exists():
        raise FileNotFoundError(f"pairs file not found: {path}")

    rows: list[tuple[int, int]] = []
    for idx, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.replace(",", " ").split()
        if len(parts) < 2:
            raise ValueError(f"invalid pairs row at line {idx}: expected left_idx right_idx")

        try:
            left_idx = int(parts[0])
            right_idx = int(parts[1])
        except ValueError as exc:
            raise ValueError(f"invalid integer values in pairs row at line {idx}") from exc

        rows.append((left_idx, right_idx))

    if not rows:
        raise ValueError("pairs file does not contain pair rows")

    return np.asarray(rows, dtype=int)


def load_pairs(pairs: Any) -> np.ndarray:
    """Load pairs from a text file or array-like input."""
    if isinstance(pairs, (str, Path)):
        return _parse_pairs_file(pairs)

    if isinstance(pairs, np.ndarray):
        arr = np.asarray(pairs)
    else:
        if not isinstance(pairs, Iterable) or isinstance(pairs, (str, bytes, bytearray)):
            raise TypeError("pairs must be a path or an iterable of (left_idx, right_idx)")
        arr = np.asarray(list(pairs))

    if arr.ndim != 2 or arr.shape[1] != 2:
        raise ValueError("pairs must be a (K, 2) array of integer indices")
    if arr.shape[0] == 0:
        raise ValueError("pairs is empty")

    return arr.astype(int, copy=False)


# ── Image & color helpers ────────────────────────────────────


VALID_MARKER_SHAPES = {"circle", "triangle", "square", "diamond"}


def _image_to_data_uri(background_img: str | Path | None) -> tuple[str | None, int | None, int | None]:
    if background_img is None:
        return None, None, None

    path = Path(background_img)
    if not path.exists():
        raise FileNotFoundError(f"background_img not found: {path}")

    with Image.open(path) as img:
        width, height = img.size

    mime, _ = mimetypes.guess_type(str(path))
    if mime is None:
        mime = "image/png"

    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{encoded}", width, height


def _resolve_colormap(
    cmap_name: str,
    values: Sequence[float] | np.ndarray,
    expected_len: int,
) -> list[str]:
    import matplotlib.cm as cm
    import matplotlib.colors as mcolors

    vals = np.asarray(values, dtype=float)
    if vals.shape != (expected_len,):
        raise ValueError(
            f"colormap_values length ({len(vals)}) must match minutiae count ({expected_len})"
        )
    cmap = cm.get_cmap(cmap_name)
    vmin, vmax = float(vals.min()), float(vals.max())
    if vmin == vmax:
        norm_vals = np.full_like(vals, 0.5)
    else:
        norm_vals = (vals - vmin) / (vmax - vmin)
    return [mcolors.to_hex(cmap(float(v))) for v in norm_vals]



def _build_blank_background_data_uri(width: int, height: int) -> str:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#0b1220"/></svg>'
    )
    return "data:image/svg+xml;utf8," + quote(svg, safe="")


def _array_to_rgba_uri(
    data: np.ndarray,
    cmap_name: str,
    vmin: float | None,
    vmax: float | None,
    alpha: float,
    alpha_modulated: bool,
) -> str:
    """Convert a 2D array to an RGBA PNG data URI using a matplotlib colormap."""
    import matplotlib.cm as cm
    import matplotlib.colors as mcolors

    arr = np.asarray(data, dtype=float)
    if arr.ndim != 2:
        raise ValueError(f"data must be a 2D array, got shape {arr.shape}")

    lo = float(arr.min()) if vmin is None else vmin
    hi = float(arr.max()) if vmax is None else vmax

    norm = mcolors.Normalize(vmin=lo, vmax=hi)
    cmap = cm.get_cmap(cmap_name)
    rgba = cmap(norm(arr))  # (H, W, 4) float [0, 1]

    if alpha_modulated:
        norm_val = np.clip((arr - lo) / (hi - lo + 1e-8), 0, 1)
        rgba[..., 3] = np.clip(norm_val * alpha * 3, 0, alpha)
    else:
        rgba[..., 3] = alpha

    rgba_u8 = (np.clip(rgba, 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(rgba_u8, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _compute_uv_arrows(
    u: np.ndarray,
    v: np.ndarray,
    h: np.ndarray,
    *,
    stride: int,
    h_threshold: float,
    seg_base: float,
    seg_gain: float,
) -> list[list[float]]:
    """Compute UV arrows as data: [[x, y, dx, dy, confidence], ...]."""
    H_px, W_px = h.shape
    h_max = float(h.max()) + 1e-8
    h_norm = h / h_max
    arrows: list[list[float]] = []

    for yi in range(0, H_px, stride):
        for xi in range(0, W_px, stride):
            conf = float(h_norm[yi, xi])
            if conf < h_threshold:
                continue
            uu = float(u[yi, xi])
            vv = float(v[yi, xi])
            mag = math.hypot(uu, vv)
            if mag < 1e-4:
                continue
            nx = uu / mag
            ny = -(vv / mag)
            seg_len = seg_base + seg_gain * (conf ** 2)
            arrows.append([xi, yi, nx * seg_len, ny * seg_len, conf])

    return arrows


# ── Bundle loading ───────────────────────────────────────────


_BUNDLE_DIR = Path(__file__).parent / "_bundle"


def _load_plots_bundle() -> str:
    path = _BUNDLE_DIR / "plots.bundle.js"
    if not path.exists():
        raise RuntimeError(
            "mntviz JS bundle not found. Run 'npm run build' in the mntviz repo root, "
            "or reinstall the package."
        )
    return path.read_text("utf-8")


def _load_bundle_css() -> str:
    path = _BUNDLE_DIR / "mntviz.css"
    return path.read_text("utf-8") if path.exists() else ""


# ── Unified HTML template ────────────────────────────────────


def _wrap_standalone(html_inline: str, title: str | None = None) -> str:
    page_title = escape(title or "mntviz")
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>{page_title}</title>
    <style>
        body {{
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
                radial-gradient(circle at 20% 10%, rgba(34,197,94,0.2), transparent 35%),
                radial-gradient(circle at 80% 90%, rgba(56,189,248,0.15), transparent 35%),
                #0f172a;
            padding: 16px;
        }}
    </style>
</head>
<body>{html_inline}
</body>
</html>
"""


def _build_runtime_html(
    func_name: str,
    config: dict,
    *,
    container_h: int,
    title: str | None = None,
    host_class: str = "mntviz-runtime-host",
    host_attr: str = "data-mntviz-runtime-host",
) -> tuple[str, str]:
    """Generate HTML that calls plots.bundle.js[func_name](host, config).

    Returns (html_inline, html_standalone).
    """
    bundle_js = _load_plots_bundle()
    css = _load_bundle_css()
    root_id = f"mntviz-{uuid4().hex[:12]}"
    config_json = json.dumps(config)
    bundle_json = json.dumps(bundle_js)

    html_inline = f"""
<style>
{css}

    #{root_id} {{
        width: min(95vw, 1200px);
        height: min(90vh, {container_h}px);
        border-radius: 14px;
        overflow: hidden;
        position: relative;
        margin: 8px 0;
    }}

    #{root_id} .{host_class} {{
        position: absolute;
        inset: 0;
    }}

    #{root_id} .{host_class} .mntviz-viewport {{
        border-radius: 0;
    }}
</style>

<section id="{root_id}" class="mntviz-jupyter">
    <div class="{host_class}" {host_attr}></div>
</section>

<script type="module">
    (() => {{
        const root = document.getElementById('{root_id}');
        if (!root) return;
        const host = root.querySelector('[{host_attr}]');
        if (!host) return;

        const config = {config_json};
        const bundleSource = {bundle_json};
        const blob = new Blob([bundleSource], {{ type: 'text/javascript' }});
        const url = URL.createObjectURL(blob);

        import(url)
            .then(mod => mod.{func_name}(host, config))
            .catch(err => console.error('mntviz runtime bootstrap failed', err))
            .finally(() => URL.revokeObjectURL(url));
    }})();
</script>
"""
    html_standalone = _wrap_standalone(html_inline, title)
    return html_inline, html_standalone


# ── Output helpers ───────────────────────────────────────────


@dataclass(frozen=True)
class MntVizFigure:
    html_inline: str
    html_standalone: str

    def to_html(self, *, standalone: bool = False) -> str:
        return self.html_standalone if standalone else self.html_inline

    def _repr_html_(self) -> str:
        return self.html_inline

    def _repr_mimebundle_(self, include=None, exclude=None):
        return {
            "text/html": self.html_inline,
        }


def _emit_output(
    *,
    html_inline: str,
    html_standalone: str,
    output_format: str,
    output_path: str | Path | None,
) -> str | MntVizFigure:
    fmt = output_format.lower().strip()
    if output_path is not None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html_standalone, encoding="utf-8")

    if fmt == "html":
        return html_standalone
    return MntVizFigure(html_inline=html_inline, html_standalone=html_standalone)


# ── Public API ───────────────────────────────────────────────


def plot_mnt(
    minutiae: Any = None,
    *,
    background_img: str | Path | None = None,
    output_format: str = "html",
    output_path: str | Path | None = None,
    color: str = "#00ff00",
    marker_size: float = 2.0,
    segment_length: float = 5.0,
    line_width: float = 1.0,
    base_opacity: float = 1.0,
    quality_alpha: bool = True,
    marker_shape: str = "circle",
    show_quality: bool = False,
    show_angles: bool = False,
    labels: Sequence[str | int | float] | None = None,
    width: int | None = None,
    height: int | None = None,
    title: str | None = None,
    colormap: str | None = None,
    colormap_values: Sequence[float] | np.ndarray | None = None,
    overlays: list[tuple[Any, str]] | None = None,
    overlay_labels: list[str] | bool | None = None,
) -> str | MntVizFigure:
    """Render minutiae plot as interactive HTML or Jupyter display object."""

    fmt = output_format.lower().strip()
    if fmt not in {"html", "jupyter"}:
        raise ValueError("output_format must be one of: html, jupyter")

    if marker_shape not in VALID_MARKER_SHAPES:
        raise ValueError(f"marker_shape must be one of {VALID_MARKER_SHAPES}, got {marker_shape!r}")

    if (colormap is None) != (colormap_values is None):
        raise ValueError("colormap and colormap_values must both be provided or both be None")

    if overlays is not None and colormap is not None:
        raise ValueError("overlays and colormap are mutually exclusive")

    if overlays is not None and minutiae is not None:
        raise ValueError("minutiae must be None when overlays is provided; include it in the overlays list instead")

    if overlays is None and minutiae is None:
        raise TypeError("minutiae is required when overlays is not provided")

    if overlay_labels is not None and overlays is None:
        raise ValueError("overlay_labels requires overlays to be provided")

    # Build layers: list of (records, per_minutia_colors, shape)
    layers: list[tuple[list[dict[str, float]], list[str], str]] = []

    if overlays is not None:
        if not overlays:
            raise ValueError("overlays must not be empty")
        for entry in overlays:
            if len(entry) == 3:
                mnt_data, layer_color, layer_shape = entry
                if layer_shape not in VALID_MARKER_SHAPES:
                    raise ValueError(f"marker_shape must be one of {VALID_MARKER_SHAPES}, got {layer_shape!r}")
            else:
                mnt_data, layer_color = entry
                layer_shape = marker_shape
            recs = load_minutiae(mnt_data)
            layers.append((recs, [layer_color] * len(recs), layer_shape))
    elif colormap is not None:
        records = load_minutiae(minutiae)
        colors = _resolve_colormap(colormap, colormap_values, len(records))
        layers.append((records, colors, marker_shape))
    else:
        records = load_minutiae(minutiae)
        layers.append((records, [color] * len(records), marker_shape))

    bg_uri, bg_w, bg_h = _image_to_data_uri(background_img)
    w = width or bg_w or 1000
    h = height or bg_h or 1000

    # Flatten layers into records with per-minutia _color and _shape
    all_records: list[dict] = []
    fallback_color = "#00ff00"
    for recs, per_colors, layer_shape in layers:
        if not all_records and per_colors:
            fallback_color = per_colors[0]
        for rec, c in zip(recs, per_colors):
            all_records.append({**rec, "_color": c, "_shape": layer_shape})

    # Inject per-minutia labels
    if labels is not None:
        if len(labels) != len(all_records):
            raise ValueError(
                f"labels length ({len(labels)}) must match minutiae count ({len(all_records)})"
            )
        for rec, lbl in zip(all_records, labels):
            rec["_label"] = str(lbl)

    # Build legend items for overlays
    legend_items: list[dict[str, str]] | None = None
    if overlays is not None and overlay_labels is not None:
        if isinstance(overlay_labels, bool) and overlay_labels:
            legend_labels = [f"Layer {i}" for i in range(len(layers))]
        elif isinstance(overlay_labels, list):
            if len(overlay_labels) != len(layers):
                raise ValueError(
                    f"overlay_labels length ({len(overlay_labels)}) must match overlays count ({len(layers)})"
                )
            legend_labels = overlay_labels
        else:
            legend_labels = None

        if legend_labels is not None:
            legend_items = [
                {"label": lbl, "color": colors[0], "shape": shape}
                for lbl, (_, colors, shape) in zip(legend_labels, layers)
            ]

    config = {
        "imageSrc": bg_uri or _build_blank_background_data_uri(int(w), int(h)),
        "minutiae": all_records,
        "color": fallback_color,
        "rendererOptions": {
            "markerSize": marker_size,
            "segmentLength": segment_length,
            "lineWidth": line_width,
            "baseOpacity": base_opacity,
            "qualityAlpha": quality_alpha,
            "markerShape": marker_shape,
            "showQuality": show_quality,
            "showAngles": show_angles,
            "showLabels": labels is not None,
        },
    }

    if legend_items is not None:
        config["legend"] = legend_items

    html_inline, html_standalone = _build_runtime_html(
        "plotMinutiae", config, container_h=int(h), title=title,
    )

    return _emit_output(
        html_inline=html_inline, html_standalone=html_standalone,
        output_format=fmt, output_path=output_path,
    )


# ── Match viewer ─────────────────────────────────────────────


def plot_mnt_match(
    *,
    left_minutiae: Any,
    right_minutiae: Any,
    pairs: str | Path | np.ndarray | Sequence | None = None,
    left_background_img: str | Path | None = None,
    right_background_img: str | Path | None = None,
    output_format: str = "html",
    output_path: str | Path | None = None,
    # Marker visuals
    marker_size: float = 3.0,
    segment_length: float = 8.0,
    line_width: float = 1.2,
    base_opacity: float = 1.0,
    quality_alpha: bool = False,
    marker_shape: str = "circle",
    # Pair coloring
    color: str = "#00ff00",
    colormap: str | None = None,
    colormap_values: Sequence[float] | np.ndarray | None = None,
    unpaired_color: str = "#555555",
    unpaired_opacity: float = 0.3,
    # Match segment styling
    match_line_colormap: str | None = None,
    match_line_colormap_values: Sequence[float] | np.ndarray | None = None,
    match_line_alpha: float | Sequence[float] = 0.6,
    match_line_width: float | Sequence[float] = 1.0,
    show_segments: bool = False,
    # Labels
    left_labels: Sequence[str | int] | None = None,
    right_labels: Sequence[str | int] | None = None,
    show_labels: bool = False,
    label_fontsize: float | None = None,
    # Titles
    left_title: str | None = None,
    right_title: str | None = None,
    title: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> str | MntVizFigure:
    """Render a side-by-side match viewer with connecting segments and dual-patch popups."""

    fmt = output_format.lower().strip()
    if fmt not in {"html", "jupyter"}:
        raise ValueError("output_format must be one of: html, jupyter")

    if marker_shape not in VALID_MARKER_SHAPES:
        raise ValueError(f"marker_shape must be one of {VALID_MARKER_SHAPES}, got {marker_shape!r}")

    if (colormap is None) != (colormap_values is None):
        raise ValueError("colormap and colormap_values must both be provided or both be None")

    if (match_line_colormap is None) != (match_line_colormap_values is None):
        raise ValueError("match_line_colormap and match_line_colormap_values must both be provided or both be None")

    # Load minutiae
    left_records = load_minutiae(left_minutiae)
    right_records = load_minutiae(right_minutiae)

    # Apply per-minutia labels
    if left_labels is not None:
        if len(left_labels) != len(left_records):
            raise ValueError(f"left_labels length ({len(left_labels)}) must match left_minutiae count ({len(left_records)})")
        for rec, lbl in zip(left_records, left_labels):
            rec["_label"] = str(lbl)
    if right_labels is not None:
        if len(right_labels) != len(right_records):
            raise ValueError(f"right_labels length ({len(right_labels)}) must match right_minutiae count ({len(right_records)})")
        for rec, lbl in zip(right_records, right_labels):
            rec["_label"] = str(lbl)

    # Resolve pairs
    if pairs is None:
        if len(left_records) != len(right_records):
            raise ValueError(
                f"When pairs is None, left and right minutiae must have equal length "
                f"(got {len(left_records)} and {len(right_records)}). "
                f"Provide an explicit pairs array for unequal lengths."
            )
        pairs_array = np.column_stack([np.arange(len(left_records)), np.arange(len(right_records))])
    else:
        pairs_array = load_pairs(pairs)

    n_pairs = len(pairs_array)

    # Resolve pair colors
    if colormap is not None:
        pair_colors = _resolve_colormap(colormap, colormap_values, n_pairs)
    else:
        pair_colors = [color] * n_pairs

    # Resolve segment colors
    if match_line_colormap is not None:
        segment_colors = _resolve_colormap(match_line_colormap, match_line_colormap_values, n_pairs)
    else:
        segment_colors = pair_colors

    # Resolve per-pair alpha and width
    if isinstance(match_line_alpha, (int, float)):
        segment_alphas = [float(match_line_alpha)] * n_pairs
    else:
        segment_alphas = [float(a) for a in match_line_alpha]
        if len(segment_alphas) != n_pairs:
            raise ValueError(f"match_line_alpha length ({len(segment_alphas)}) must match pairs count ({n_pairs})")

    if isinstance(match_line_width, (int, float)):
        segment_widths = [float(match_line_width)] * n_pairs
    else:
        segment_widths = [float(w) for w in match_line_width]
        if len(segment_widths) != n_pairs:
            raise ValueError(f"match_line_width length ({len(segment_widths)}) must match pairs count ({n_pairs})")

    # Assign _color and _pairIndex to minutiae
    left_paired_indices = set()
    right_paired_indices = set()

    for k, (li, ri) in enumerate(pairs_array):
        left_records[li]["_color"] = pair_colors[k]
        left_records[li]["_pairIndex"] = k
        right_records[ri]["_color"] = pair_colors[k]
        right_records[ri]["_pairIndex"] = k
        left_paired_indices.add(int(li))
        right_paired_indices.add(int(ri))

    for i, rec in enumerate(left_records):
        if i not in left_paired_indices:
            rec["_color"] = unpaired_color
            rec["_pairIndex"] = -1
            rec["_unpaired"] = True
    for i, rec in enumerate(right_records):
        if i not in right_paired_indices:
            rec["_color"] = unpaired_color
            rec["_pairIndex"] = -1
            rec["_unpaired"] = True

    # Build match data
    pairs_data = []
    for k in range(n_pairs):
        pairs_data.append({
            "leftIdx": int(pairs_array[k, 0]),
            "rightIdx": int(pairs_array[k, 1]),
            "color": segment_colors[k],
            "alpha": segment_alphas[k],
            "width": segment_widths[k],
        })

    match_data = {
        "leftMinutiae": left_records,
        "rightMinutiae": right_records,
        "pairs": pairs_data,
    }

    # Background images
    left_uri, left_w, left_h = _image_to_data_uri(left_background_img)
    right_uri, right_w, right_h = _image_to_data_uri(right_background_img)

    lw = width or left_w or 500
    lh = height or left_h or 500
    rw = width or right_w or 500
    rh = height or right_h or 500

    left_src = left_uri or _build_blank_background_data_uri(int(lw), int(lh))
    right_src = right_uri or _build_blank_background_data_uri(int(rw), int(rh))

    renderer_options = {
        "markerSize": marker_size,
        "segmentLength": segment_length,
        "lineWidth": line_width,
        "baseOpacity": base_opacity,
        "qualityAlpha": quality_alpha,
        "markerShape": marker_shape,
        "showLabels": show_labels,
        **(({"labelFontSize": label_fontsize} if label_fontsize is not None else {})),
    }

    fallback_color = pair_colors[0] if pair_colors else color

    config = {
        "matchData": match_data,
        "leftImageSrc": left_src,
        "rightImageSrc": right_src,
        "markerColor": fallback_color,
        "rendererOptions": renderer_options,
        "showSegments": show_segments,
        "leftTitle": left_title,
        "rightTitle": right_title,
    }

    html_inline, html_standalone = _build_runtime_html(
        "plotMatch", config,
        container_h=max(int(lh), int(rh)),
        title=title,
        host_class="mntviz-match-runtime-host",
        host_attr="data-mntviz-match-host",
    )

    return _emit_output(
        html_inline=html_inline, html_standalone=html_standalone,
        output_format=fmt, output_path=output_path,
    )


# ── Overlay & HUV ────────────────────────────────────────────


def plot_overlay(
    data: np.ndarray,
    *,
    background_img: str | Path | None = None,
    cmap: str = "magma",
    alpha: float = 0.6,
    vmin: float | None = None,
    vmax: float | None = None,
    alpha_modulated: bool = False,
    title: str | None = None,
    output_format: str = "html",
    output_path: str | Path | None = None,
    width: int | None = None,
    height: int | None = None,
) -> str | MntVizFigure:
    """Render a 2D array as a colormapped overlay on a background image."""

    fmt = output_format.lower().strip()
    if fmt not in {"html", "jupyter"}:
        raise ValueError("output_format must be one of: html, jupyter")

    arr = np.asarray(data, dtype=float)
    if arr.ndim != 2:
        raise ValueError(f"data must be 2D, got shape {arr.shape}")

    bg_uri, bg_w, bg_h = _image_to_data_uri(background_img)
    w = width or bg_w or arr.shape[1]
    h = height or bg_h or arr.shape[0]

    overlay_uri = _array_to_rgba_uri(arr, cmap, vmin, vmax, alpha, alpha_modulated)
    bg_src = bg_uri or _build_blank_background_data_uri(int(w), int(h))

    config = {
        "imageSrc": bg_src,
        "overlaySrc": overlay_uri,
        "overlayOpacity": 1.0,
    }

    html_inline, html_standalone = _build_runtime_html(
        "plotOverlay", config, container_h=int(h), title=title,
    )

    return _emit_output(
        html_inline=html_inline, html_standalone=html_standalone,
        output_format=fmt, output_path=output_path,
    )


def plot_huv(
    h: np.ndarray,
    u: np.ndarray,
    v: np.ndarray,
    *,
    background_img: str | Path | None = None,
    h_cmap: str = "magma",
    h_alpha: float = 0.7,
    h_threshold: float = 0.05,
    arrow_stride: int = 4,
    seg_base: float = 2.0,
    seg_gain: float = 10.0,
    arrow_size: float = 4.0,
    line_width: float = 0.8,
    arrow_color: str = "#43C4E4",
    title: str | None = None,
    output_format: str = "html",
    output_path: str | Path | None = None,
    width: int | None = None,
    height: int | None = None,
) -> str | MntVizFigure:
    """Render an HUV combined plot: heatmap overlay + UV orientation arrows."""

    fmt = output_format.lower().strip()
    if fmt not in {"html", "jupyter"}:
        raise ValueError("output_format must be one of: html, jupyter")

    h_arr = np.asarray(h, dtype=float)
    u_arr = np.asarray(u, dtype=float)
    v_arr = np.asarray(v, dtype=float)

    if h_arr.ndim != 2 or u_arr.ndim != 2 or v_arr.ndim != 2:
        raise ValueError("h, u, v must all be 2D arrays")
    if h_arr.shape != u_arr.shape or h_arr.shape != v_arr.shape:
        raise ValueError(
            f"h, u, v must have the same shape — got {h_arr.shape}, {u_arr.shape}, {v_arr.shape}"
        )

    bg_uri, bg_w, bg_h = _image_to_data_uri(background_img)
    w = width or bg_w or h_arr.shape[1]
    h_px = height or bg_h or h_arr.shape[0]

    overlay_uri = _array_to_rgba_uri(
        h_arr, h_cmap, vmin=0.0, vmax=None, alpha=h_alpha, alpha_modulated=True,
    )

    arrows = _compute_uv_arrows(
        u_arr, v_arr, h_arr,
        stride=arrow_stride,
        h_threshold=h_threshold,
        seg_base=seg_base,
        seg_gain=seg_gain,
    )

    bg_src = bg_uri or _build_blank_background_data_uri(int(w), int(h_px))

    config = {
        "imageSrc": bg_src,
        "overlaySrc": overlay_uri,
        "overlayOpacity": 1.0,
        "arrows": arrows,
        "arrowOptions": {
            "arrowSize": arrow_size,
            "lineWidth": line_width,
            "color": arrow_color,
        },
    }

    html_inline, html_standalone = _build_runtime_html(
        "plotHuv", config, container_h=int(h_px), title=title,
    )

    return _emit_output(
        html_inline=html_inline, html_standalone=html_standalone,
        output_format=fmt, output_path=output_path,
    )
