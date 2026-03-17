from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path
from string import Template
from typing import Any, Iterable, Mapping, Sequence
import base64
import json
import math
import mimetypes
from urllib.parse import quote
import warnings
from uuid import uuid4

import numpy as np
from PIL import Image


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


VALID_MARKER_SHAPES = {"circle", "triangle", "square", "diamond"}


def _svg_marker_path(shape: str, cx: float, cy: float, r: float) -> str:
    if shape == "circle":
        return f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r}" />'
    elif shape == "square":
        return f'<rect x="{cx - r:.2f}" y="{cy - r:.2f}" width="{2 * r:.2f}" height="{2 * r:.2f}" />'
    elif shape == "diamond":
        pts = f"{cx:.2f},{cy - r:.2f} {cx + r:.2f},{cy:.2f} {cx:.2f},{cy + r:.2f} {cx - r:.2f},{cy:.2f}"
        return f'<polygon points="{pts}" />'
    elif shape == "triangle":
        pts = " ".join(
            f"{cx + r * math.cos(math.radians(a)):.2f},{cy - r * math.sin(math.radians(a)):.2f}"
            for a in (90, 210, 330)
        )
        return f'<polygon points="{pts}" />'
    else:
        raise ValueError(f"unknown marker_shape: {shape}")


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


def _build_svg(
    layers: list[tuple[list[dict[str, float]], list[str], str]],
    *,
    background_uri: str | None,
    width: int,
    height: int,
    marker_size: float,
    segment_length: float,
    line_width: float,
    base_opacity: float,
    quality_alpha: bool,
    marker_shape: str,
    show_quality: bool,
    show_angles: bool,
) -> str:
    elements: list[str] = []
    marker_text_elements: list[str] = []

    if background_uri:
        elements.append(
            (
                f'<image id="mntviz-bg-image" href="{escape(background_uri)}" '
                f'x="0" y="0" width="{width}" height="{height}" preserveAspectRatio="none" />'
            )
        )

    for records, per_colors, layer_shape in layers:
        for rec, mnt_color in zip(records, per_colors):
            x = rec["x"]
            y = rec["y"]
            angle = rec["angle"]
            quality = rec["quality"]

            if quality_alpha:
                q_factor = min(1.0, max(0.2, quality / 100.0))
                opacity = max(0.0, min(1.0, base_opacity * q_factor))
            else:
                opacity = base_opacity

            rad = angle * math.pi / 180.0
            x_end = x + segment_length * math.cos(rad)
            y_end = y - segment_length * math.sin(rad)

            elements.append(
                (
                    f'<g opacity="{opacity:.4f}" '
                    f'stroke="{escape(mnt_color)}" fill="none" stroke-width="{line_width}" '
                    f'stroke-linecap="round" stroke-linejoin="round">'
                    f'{_svg_marker_path(layer_shape, x, y, marker_size)}'
                    f'<line x1="{x:.2f}" y1="{y:.2f}" x2="{x_end:.2f}" y2="{y_end:.2f}" />'
                    "</g>"
                )
            )

            if show_quality:
                marker_text_elements.append(
                    f'<text x="{x:.2f}" y="{y + 10:.2f}" text-anchor="middle" fill="{escape(mnt_color)}" font-size="10">Q:{int(round(quality))}</text>'
                )

            if show_angles:
                marker_text_elements.append(
                    f'<text x="{x:.2f}" y="{y - 10:.2f}" text-anchor="middle" fill="{escape(mnt_color)}" font-size="10">{int(round(angle))} deg</text>'
                )

    if marker_text_elements:
        elements.append('<g class="mntviz-mnt-labels" stroke="none">' + "".join(marker_text_elements) + "</g>")

    body = "".join(elements)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{body}</svg>'
    )


def _build_interactive_fragment(svg: str, *, title: str | None = None, root_id: str) -> str:
    page_title = escape(title or "mntviz")
    template = Template(
        """
<style>
  #$root_id {
    --text: #e5e7eb;
    --grid: rgba(148,163,184,0.14);
    --accent: #22c55e;
    color: var(--text);
    font-family: \"IBM Plex Sans\", \"Segoe UI\", sans-serif;
    width: min(95vw, 1200px);
    height: min(80vh, 760px);
    max-height: 760px;
    min-height: 380px;
    background: linear-gradient(165deg, rgba(17,24,39,0.95), rgba(2,6,23,0.95));
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(0,0,0,0.35);
    position: relative;
    margin: 8px 0;
  }
  #$root_id .viewport {
    position: absolute;
    inset: 0;
    overflow: hidden;
    cursor: grab;
    background-image:
      linear-gradient(0deg, var(--grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  #$root_id .canvas {
    transform-origin: 0 0;
    user-select: none;
    -webkit-user-drag: none;
  }
  #$root_id svg {
    display: block;
    pointer-events: none;
  }
</style>
<section id=\"$root_id\" class=\"mntviz-jupyter\">
  <div class=\"viewport\" data-mntviz-role=\"viewport\">
    <div class=\"canvas\" data-mntviz-role=\"canvas\">$svg</div>
  </div>
</section>
<script>
  (() => {
    const root = document.getElementById('$root_id');
    if (!root) return;
    const viewport = root.querySelector('[data-mntviz-role="viewport"]');
    const canvas = root.querySelector('[data-mntviz-role="canvas"]');
    if (!viewport || !canvas) return;

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const apply = () => {
      canvas.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
    };

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      const next = Math.min(20, Math.max(0.1, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
      const wx = (ox - tx) / scale;
      const wy = (oy - ty) / scale;
      scale = next;
      tx = ox - wx * scale;
      ty = oy - wy * scale;
      apply();
    }, { passive: false });

    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      viewport.style.cursor = 'grab';
    });

    apply();
  })();
</script>
"""
    )
    return template.substitute(root_id=root_id, page_title=page_title, svg=svg)


def _find_mntviz_repo_root() -> Path | None:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "src" / "viewer.js").exists() and (parent / "src" / "minutiae-renderer.js").exists():
            return parent
    return None


def _load_mntviz_runtime_assets() -> tuple[str, str, str, str] | None:
    repo_root = _find_mntviz_repo_root()
    if repo_root is None:
        return None

    src_dir = repo_root / "src"
    viewer_js = (src_dir / "viewer.js").read_text(encoding="utf-8")
    renderer_js = (src_dir / "minutiae-renderer.js").read_text(encoding="utf-8")
    inspector_js = (src_dir / "minutiae-inspector.js").read_text(encoding="utf-8")
    css = (src_dir / "mntviz.css").read_text(encoding="utf-8")
    return viewer_js, renderer_js, inspector_js, css


def _load_match_runtime_assets() -> tuple[str, str, str, str, str] | None:
    repo_root = _find_mntviz_repo_root()
    if repo_root is None:
        return None

    src_dir = repo_root / "src"
    match_viewer_path = src_dir / "match-viewer.js"
    if not match_viewer_path.exists():
        return None

    viewer_js = (src_dir / "viewer.js").read_text(encoding="utf-8")
    renderer_js = (src_dir / "minutiae-renderer.js").read_text(encoding="utf-8")
    inspector_js = (src_dir / "minutiae-inspector.js").read_text(encoding="utf-8")
    match_viewer_js = match_viewer_path.read_text(encoding="utf-8")
    css = (src_dir / "mntviz.css").read_text(encoding="utf-8")
    return viewer_js, renderer_js, inspector_js, match_viewer_js, css


def _build_blank_background_data_uri(width: int, height: int) -> str:
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#0b1220"/></svg>'
    )
    return "data:image/svg+xml;utf8," + quote(svg, safe="")


def _build_js_runtime_fragment(
    layers: list[tuple[list[dict[str, float]], list[str], str]],
    *,
    background_uri: str | None,
    width: int,
    height: int,
    marker_size: float,
    segment_length: float,
    line_width: float,
    base_opacity: float,
    quality_alpha: bool,
    marker_shape: str,
    show_quality: bool,
    show_angles: bool,
    title: str | None,
    root_id: str,
) -> str:
    assets = _load_mntviz_runtime_assets()
    if assets is None:
        return _build_interactive_fragment(
            _build_svg(
                layers,
                background_uri=background_uri,
                width=width,
                height=height,
                marker_size=marker_size,
                segment_length=segment_length,
                line_width=line_width,
                base_opacity=base_opacity,
                quality_alpha=quality_alpha,
                marker_shape=marker_shape,
                show_quality=show_quality,
                show_angles=show_angles,
            ),
            title=title,
            root_id=root_id,
        )

    viewer_js, renderer_js, inspector_js, css = assets
    page_title = escape(title or "mntviz")
    image_src = background_uri or _build_blank_background_data_uri(width, height)

    # Flatten layers into a single list with per-minutia _color and _shape
    all_records: list[dict] = []
    fallback_color = "#00ff00"
    for records, per_colors, layer_shape in layers:
        if not all_records and per_colors:
            fallback_color = per_colors[0]
        for rec, c in zip(records, per_colors):
            all_records.append({**rec, "_color": c, "_shape": layer_shape})
    minutiae_json = json.dumps(all_records)

    renderer_options_json = json.dumps(
        {
            "markerSize": marker_size,
            "segmentLength": segment_length,
            "lineWidth": line_width,
            "baseOpacity": base_opacity,
            "qualityAlpha": quality_alpha,
            "markerShape": marker_shape,
            "showQuality": show_quality,
            "showAngles": show_angles,
        }
    )

    template = Template(
        """
<style>
$mntviz_css

    #$root_id {
        width: min(95vw, 1200px);
        height: min(80vh, 760px);
        max-height: 760px;
        min-height: 380px;
        background: linear-gradient(165deg, rgba(17,24,39,0.95), rgba(2,6,23,0.95));
        border-radius: 14px;
        overflow: hidden;
        position: relative;
        margin: 8px 0;
    }

    #$root_id .mntviz-runtime-host {
        position: absolute;
        inset: 0;
    }

    #$root_id .mntviz-runtime-host .mntviz-viewport {
        border-radius: 0;
    }
</style>

<section id="$root_id" class="mntviz-jupyter">
    <div class="mntviz-runtime-host" data-mntviz-runtime-host></div>
</section>

<script type="module">
    (() => {
        const root = document.getElementById('$root_id');
        if (!root) return;

        const host = root.querySelector('[data-mntviz-runtime-host]');
        if (!host) return;

        const minutiae = $minutiae_json;
        const imageSrc = $image_src_json;
        const markerColor = $color_json;
        const rendererOptions = $renderer_options_json;

        const rendererSource = $renderer_js_json;
        const inspectorSourceTemplate = $inspector_js_json;
        const viewerSourceTemplate = $viewer_js_json;

        const makeModuleUrl = (source) => {
            const blob = new Blob([source], { type: 'text/javascript' });
            return URL.createObjectURL(blob);
        };

        const rendererUrl = makeModuleUrl(rendererSource);
        const inspectorSource = inspectorSourceTemplate.replace("from './minutiae-renderer.js';", "from '" + rendererUrl + "';");
        const inspectorUrl = makeModuleUrl(inspectorSource);
        const viewerSource = viewerSourceTemplate.replace("from './minutiae-inspector.js';", "from '" + inspectorUrl + "';");
        const viewerUrl = makeModuleUrl(viewerSource);

        Promise.all([import(viewerUrl), import(rendererUrl)])
            .then(async ([viewerMod, rendererMod]) => {
                const { Viewer } = viewerMod;
                const { MinutiaeRenderer } = rendererMod;

                const viewer = new Viewer(host, { minimap: true });
                await viewer.loadImage(imageSrc);

                const renderer = new MinutiaeRenderer(viewer.svgLayer);
                renderer.draw(minutiae, markerColor, rendererOptions);

                viewer.enableMinutiaeInspector({
                    getAllMinutiae: () => minutiae,
                    patchMode: 'visible',
                });
            })
            .catch((err) => {
                console.error('mntviz runtime bootstrap failed', err);
            })
            .finally(() => {
                URL.revokeObjectURL(viewerUrl);
                URL.revokeObjectURL(inspectorUrl);
                URL.revokeObjectURL(rendererUrl);
            });
    })();
</script>
"""
    )

    return template.substitute(
        root_id=root_id,
        page_title=page_title,
        mntviz_css=css,
        minutiae_json=minutiae_json,
        image_src_json=json.dumps(image_src),
        color_json=json.dumps(fallback_color),
        renderer_options_json=renderer_options_json,
        renderer_js_json=json.dumps(renderer_js),
        inspector_js_json=json.dumps(inspector_js),
        viewer_js_json=json.dumps(viewer_js),
    )


def _build_html_with_js_runtime(
    layers: list[tuple[list[dict[str, float]], list[str], str]],
    *,
    background_uri: str | None,
    width: int,
    height: int,
    marker_size: float,
    segment_length: float,
    line_width: float,
    base_opacity: float,
    quality_alpha: bool,
    marker_shape: str,
    show_quality: bool,
    show_angles: bool,
    title: str | None,
) -> tuple[str, str]:
    root_id = f"mntviz-{uuid4().hex}"
    inline = _build_js_runtime_fragment(
    layers,
    background_uri=background_uri,
    width=width,
    height=height,
    marker_size=marker_size,
    segment_length=segment_length,
    line_width=line_width,
    base_opacity=base_opacity,
    quality_alpha=quality_alpha,
    marker_shape=marker_shape,
    show_quality=show_quality,
    show_angles=show_angles,
    title=title,
    root_id=root_id,
    )

    page_title = escape(title or "mntviz")
    standalone = f"""<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
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
<body>{inline}
</body>
</html>
"""
    return inline, standalone


@dataclass(frozen=True)
class MntVizFigure:
    svg: str
    html_inline: str
    html_standalone: str

    def to_svg(self) -> str:
        return self.svg

    def to_html(self, *, standalone: bool = False) -> str:
        return self.html_standalone if standalone else self.html_inline

    def to_html_standalone(self) -> str:
        return self.html_standalone

    def _repr_html_(self) -> str:
        return self.html_inline

    def _repr_mimebundle_(self, include=None, exclude=None):
        return {
            "text/html": self.html_inline,
        }


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
    width: int | None = None,
    height: int | None = None,
    title: str | None = None,
    colormap: str | None = None,
    colormap_values: Sequence[float] | np.ndarray | None = None,
    overlays: list[tuple[Any, str]] | None = None,
) -> str | MntVizFigure:
    """Render minutiae plot as SVG, interactive HTML, or Jupyter display object."""

    fmt = output_format.lower().strip()
    if fmt not in {"svg", "html", "jupyter"}:
        raise ValueError("output_format must be one of: svg, html, jupyter")

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

    svg = _build_svg(
        layers,
        background_uri=bg_uri,
        width=int(w),
        height=int(h),
        marker_size=marker_size,
        segment_length=segment_length,
        line_width=line_width,
        base_opacity=base_opacity,
        quality_alpha=quality_alpha,
        marker_shape=marker_shape,
        show_quality=show_quality,
        show_angles=show_angles,
    )
    html_inline, html = _build_html_with_js_runtime(
        layers,
        background_uri=bg_uri,
        width=int(w),
        height=int(h),
        marker_size=marker_size,
        segment_length=segment_length,
        line_width=line_width,
        base_opacity=base_opacity,
        quality_alpha=quality_alpha,
        marker_shape=marker_shape,
        show_quality=show_quality,
        show_angles=show_angles,
        title=title,
    )

    if output_path is not None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "svg":
            path.write_text(svg, encoding="utf-8")
        else:
            path.write_text(html, encoding="utf-8")

    if fmt == "svg":
        return svg
    if fmt == "html":
        return html
    return MntVizFigure(svg=svg, html_inline=html_inline, html_standalone=html)


# ── Match viewer ──────────────────────────────────────────


def _build_match_js_runtime_fragment(
    *,
    match_data_json: str,
    left_image_src: str,
    right_image_src: str,
    renderer_options_json: str,
    marker_color_json: str,
    left_title_json: str,
    right_title_json: str,
    show_segments_json: str,
    root_id: str,
    css: str,
    viewer_js: str,
    renderer_js: str,
    inspector_js: str,
    match_viewer_js: str,
) -> str:
    template = Template(
        """
<style>
$mntviz_css

    #$root_id {
        width: min(95vw, 1200px);
        height: min(80vh, 760px);
        max-height: 760px;
        min-height: 380px;
        background: linear-gradient(165deg, rgba(17,24,39,0.95), rgba(2,6,23,0.95));
        border-radius: 14px;
        overflow: hidden;
        position: relative;
        margin: 8px 0;
    }

    #$root_id .mntviz-match-runtime-host {
        position: absolute;
        inset: 0;
    }
</style>

<section id="$root_id" class="mntviz-jupyter">
    <div class="mntviz-match-runtime-host" data-mntviz-match-host></div>
</section>

<script type="module">
    (() => {
        const root = document.getElementById('$root_id');
        if (!root) return;
        const host = root.querySelector('[data-mntviz-match-host]');
        if (!host) return;

        const matchData = $match_data_json;
        const leftImageSrc = $left_image_src_json;
        const rightImageSrc = $right_image_src_json;
        const markerColor = $marker_color_json;
        const rendererOptions = $renderer_options_json;
        const leftTitle = $left_title_json;
        const rightTitle = $right_title_json;
        const showSegments = $show_segments_json;

        const rendererSource = $renderer_js_json;
        const inspectorSourceTemplate = $inspector_js_json;
        const viewerSourceTemplate = $viewer_js_json;
        const matchViewerSourceTemplate = $match_viewer_js_json;

        const makeModuleUrl = (source) => {
            const blob = new Blob([source], { type: 'text/javascript' });
            return URL.createObjectURL(blob);
        };

        const rendererUrl = makeModuleUrl(rendererSource);
        const inspectorSource = inspectorSourceTemplate.replace(
            "from './minutiae-renderer.js';", "from '" + rendererUrl + "';"
        );
        const inspectorUrl = makeModuleUrl(inspectorSource);
        const viewerSource = viewerSourceTemplate.replace(
            "from './minutiae-inspector.js';", "from '" + inspectorUrl + "';"
        );
        const viewerUrl = makeModuleUrl(viewerSource);

        let matchViewerSource = matchViewerSourceTemplate.replace(
            "from './viewer.js';", "from '" + viewerUrl + "';"
        );
        matchViewerSource = matchViewerSource.replace(
            "from './minutiae-renderer.js';", "from '" + rendererUrl + "';"
        );
        const matchViewerUrl = makeModuleUrl(matchViewerSource);

        import(matchViewerUrl)
            .then(async (mod) => {
                const { MatchViewer } = mod;

                const mv = new MatchViewer(host, {
                    leftMinutiae: matchData.leftMinutiae,
                    rightMinutiae: matchData.rightMinutiae,
                    pairs: matchData.pairs,
                    leftTitle: leftTitle,
                    rightTitle: rightTitle,
                    markerColor: markerColor,
                    rendererOptions: rendererOptions,
                    showSegmentsOnLoad: showSegments,
                });
                await mv.loadImages(leftImageSrc, rightImageSrc);
            })
            .catch((err) => {
                console.error('mntviz match-viewer bootstrap failed', err);
            })
            .finally(() => {
                URL.revokeObjectURL(matchViewerUrl);
                URL.revokeObjectURL(viewerUrl);
                URL.revokeObjectURL(inspectorUrl);
                URL.revokeObjectURL(rendererUrl);
            });
    })();
</script>
"""
    )

    return template.substitute(
        root_id=root_id,
        mntviz_css=css,
        match_data_json=match_data_json,
        left_image_src_json=json.dumps(left_image_src),
        right_image_src_json=json.dumps(right_image_src),
        marker_color_json=marker_color_json,
        renderer_options_json=renderer_options_json,
        left_title_json=left_title_json,
        right_title_json=right_title_json,
        show_segments_json=show_segments_json,
        renderer_js_json=json.dumps(renderer_js),
        inspector_js_json=json.dumps(inspector_js),
        viewer_js_json=json.dumps(viewer_js),
        match_viewer_js_json=json.dumps(match_viewer_js),
    )


def plot_mnt_match(
    *,
    left_minutiae: Any,
    right_minutiae: Any,
    pairs: np.ndarray | Sequence | None = None,
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
    # Titles
    left_title: str | None = None,
    right_title: str | None = None,
    title: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> str | MntVizFigure:
    """Render a side-by-side match viewer with connecting segments and dual-patch popups."""

    fmt = output_format.lower().strip()
    if fmt not in {"svg", "html", "jupyter"}:
        raise ValueError("output_format must be one of: svg, html, jupyter")

    if marker_shape not in VALID_MARKER_SHAPES:
        raise ValueError(f"marker_shape must be one of {VALID_MARKER_SHAPES}, got {marker_shape!r}")

    if (colormap is None) != (colormap_values is None):
        raise ValueError("colormap and colormap_values must both be provided or both be None")

    if (match_line_colormap is None) != (match_line_colormap_values is None):
        raise ValueError("match_line_colormap and match_line_colormap_values must both be provided or both be None")

    # Load minutiae
    left_records = load_minutiae(left_minutiae)
    right_records = load_minutiae(right_minutiae)

    # Resolve pairs
    if pairs is None:
        # Simple 1-to-1 mode
        if len(left_records) != len(right_records):
            raise ValueError(
                f"When pairs is None, left and right minutiae must have equal length "
                f"(got {len(left_records)} and {len(right_records)}). "
                f"Provide an explicit pairs array for unequal lengths."
            )
        pairs_array = np.column_stack([np.arange(len(left_records)), np.arange(len(right_records))])
    else:
        pairs_array = np.asarray(pairs, dtype=int)
        if pairs_array.ndim != 2 or pairs_array.shape[1] != 2:
            raise ValueError("pairs must be a (K, 2) array of integer indices")

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

    # Resolve per-pair alpha and width (scalar or array)
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

    # Unpaired minutiae
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

    # Build match data JSON
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
    }

    fallback_color = pair_colors[0] if pair_colors else color

    # Try JS runtime
    assets = _load_match_runtime_assets()
    if assets is not None:
        viewer_js, renderer_js, inspector_js, match_viewer_js, css = assets
        root_id = f"mntviz-match-{uuid4().hex}"

        html_inline = _build_match_js_runtime_fragment(
            match_data_json=json.dumps(match_data),
            left_image_src=left_src,
            right_image_src=right_src,
            renderer_options_json=json.dumps(renderer_options),
            marker_color_json=json.dumps(fallback_color),
            left_title_json=json.dumps(left_title),
            right_title_json=json.dumps(right_title),
            show_segments_json=json.dumps(show_segments),
            root_id=root_id,
            css=css,
            viewer_js=viewer_js,
            renderer_js=renderer_js,
            inspector_js=inspector_js,
            match_viewer_js=match_viewer_js,
        )

        page_title = escape(title or "mntviz match")
        html_standalone = f"""<!doctype html>
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
    else:
        # Fallback: static side-by-side SVGs
        left_layers = [(left_records, [r.get("_color", color) for r in left_records], marker_shape)]
        right_layers = [(right_records, [r.get("_color", color) for r in right_records], marker_shape)]

        left_svg = _build_svg(
            left_layers, background_uri=left_uri,
            width=int(lw), height=int(lh),
            marker_size=marker_size, segment_length=segment_length,
            line_width=line_width, base_opacity=base_opacity,
            quality_alpha=quality_alpha, marker_shape=marker_shape,
            show_quality=False, show_angles=False,
        )
        right_svg = _build_svg(
            right_layers, background_uri=right_uri,
            width=int(rw), height=int(rh),
            marker_size=marker_size, segment_length=segment_length,
            line_width=line_width, base_opacity=base_opacity,
            quality_alpha=quality_alpha, marker_shape=marker_shape,
            show_quality=False, show_angles=False,
        )

        html_inline = f'<div style="display:flex;gap:8px">{left_svg}{right_svg}</div>'
        html_standalone = f"<!doctype html><html><body>{html_inline}</body></html>"

    # SVG output is the left SVG only (limited for match mode)
    svg_out = html_inline

    if output_path is not None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(html_standalone, encoding="utf-8")

    if fmt == "svg":
        return html_inline
    if fmt == "html":
        return html_standalone
    return MntVizFigure(svg=svg_out, html_inline=html_inline, html_standalone=html_standalone)
