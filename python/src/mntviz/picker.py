"""Optional anywidget bridge that turns any mntviz plot into an interactive
point-picker widget.

The plot rendering, picker UI, HUD toggle button, and right-click removal all
live in JS. This module's job is just:

1. Reuse the bundled JS (which exports plotMinutiae / plotOverlay / plotHuv).
2. After the plot runs, grab the viewer's `pointPicker` (already enabled by
   the JS layer because the caller passed `config.picker`) and bridge its
   'change' event ↔ the widget's `points` traitlet.

Result: the pure JS lib stays usable without Python; opt-in `picker=` flag in
plot_mnt / plot_huv / plot_overlay returns a synced widget instead of static
HTML, with `widget.points` readable from any cell.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import anywidget
import traitlets


_BUNDLE_DIR = Path(__file__).parent / "_bundle"
_BUNDLE_JS = _BUNDLE_DIR / "plots.bundle.js"
_BUNDLE_CSS = _BUNDLE_DIR / "mntviz.css"


_BRIDGE_TEMPLATE = r"""

const __MNTVIZ_CSS__ = __CSS_JSON__;
const __PLOT_FNS__ = { plotMinutiae, plotOverlay, plotHuv };

function _ensureCss() {
    if (document.getElementById('mntviz-bundle-css')) return;
    const s = document.createElement('style');
    s.id = 'mntviz-bundle-css';
    s.textContent = __MNTVIZ_CSS__;
    document.head.appendChild(s);
}

function render({ model, el }) {
    _ensureCss();
    el.innerHTML = '';

    const root = document.createElement('div');
    const h = model.get('height') || 500;
    root.style.cssText =
        'width: min(95vw, 1200px); height: min(90vh, ' + h + 'px);' +
        'border-radius: 14px; overflow: hidden; position: relative;' +
        'margin: 8px 0;';
    el.appendChild(root);

    const funcName = model.get('func_name');
    const fn = __PLOT_FNS__[funcName];
    if (!fn) {
        root.textContent = 'mntviz: unknown plot function "' + funcName + '"';
        return;
    }

    // Pre-seed the picker with the current points list so the JS layer
    // shows them on first enable. The picker config is normalized to an
    // object on the JS side, so we always pass an object here.
    const config = JSON.parse(JSON.stringify(model.get('config') || {}));
    const initial = model.get('points') || [];
    const pickerOpts = (config.picker && config.picker !== true) ? config.picker : {};
    config.picker = { ...pickerOpts, points: initial };

    fn(root, config).then((viewerLike) => {
        // plot_mnt_match / future returners might wrap the viewer; normalize.
        const viewer = viewerLike && viewerLike.viewer ? viewerLike.viewer : viewerLike;
        const picker = viewer && viewer.pointPicker;
        if (!picker) return;

        let suppress = false;
        picker.on('change', (pts) => {
            if (suppress) return;
            model.set('points', pts);
            model.save_changes();
        });

        model.on('change:points', () => {
            if (!picker) return;
            suppress = true;
            try { picker.setPoints(model.get('points') || []); }
            finally { suppress = false; }
        });
    }).catch((err) => {
        root.textContent = 'mntviz plot failed: ' + (err && err.message || err);
    });
}

export default { render };
"""


def _build_esm() -> str:
    bundle = _BUNDLE_JS.read_text(encoding="utf-8")
    css = _BUNDLE_CSS.read_text(encoding="utf-8")
    bridge = _BRIDGE_TEMPLATE.replace("__CSS_JSON__", json.dumps(css))
    return bundle + "\n\n" + bridge


class PointPickerWidget(anywidget.AnyWidget):
    """Anywidget wrapper around an mntviz plot with the point picker enabled.

    Read the captured points from any cell via `widget.points`
    (list of ``{'x': int, 'y': int, 'label'?: str}`` dicts).
    """

    _esm = _build_esm()

    func_name: str = traitlets.Unicode().tag(sync=True)
    config: dict[str, Any] = traitlets.Dict().tag(sync=True)
    points: list[dict[str, Any]] = traitlets.List(traitlets.Dict()).tag(sync=True)
    height: int = traitlets.Int(500).tag(sync=True)


def _normalize_picker(picker: Any) -> dict[str, Any]:
    """Map ``picker=True`` → empty options, ``picker=dict`` → that dict."""
    if picker is True:
        return {}
    if isinstance(picker, dict):
        return dict(picker)
    raise TypeError(f"picker must be True or a dict, got {type(picker).__name__}")


def build_picker_widget(
    func_name: str,
    config: dict[str, Any],
    *,
    picker: Any,
    height: int,
    initial_points: list[dict[str, Any]] | None = None,
) -> PointPickerWidget:
    """Construct the widget for a given plot function + config."""
    cfg = dict(config)
    cfg["picker"] = _normalize_picker(picker)
    return PointPickerWidget(
        func_name=func_name,
        config=cfg,
        points=list(initial_points or []),
        height=int(height),
    )
