from pathlib import Path
import warnings

import numpy as np

from mntviz import MntVizFigure, load_minutiae, load_pairs, minutiae_from_min, plot_mnt, plot_mnt_match, plot_overlay, plot_huv


def test_plot_html_minimal():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    html = plot_mnt(data, output_format="html")
    assert "<!doctype html>" in html.lower()
    assert "data-mntviz-runtime-host" in html
    assert "plotMinutiae" in html


def test_plot_jupyter_returns_displayable():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    fig = plot_mnt(data, output_format="jupyter")
    assert isinstance(fig, MntVizFigure)
    html_inline = fig._repr_html_().lower()
    assert "<!doctype html>" not in html_inline
    assert "<html" not in html_inline
    assert "data-mntviz-runtime-host" in html_inline
    assert "plotminutiae" in html_inline


def test_plot_jupyter_exposes_standalone_html():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    fig = plot_mnt(data, output_format="jupyter")
    assert "<!doctype html>" in fig.to_html(standalone=True).lower()


def test_plot_jupyter_mimebundle_prefers_html_only():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    fig = plot_mnt(data, output_format="jupyter")
    bundle = fig._repr_mimebundle_()
    assert "text/html" in bundle
    assert "image/svg+xml" not in bundle


def test_invalid_output_format_raises():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    try:
        plot_mnt(data, output_format="png")
    except ValueError as exc:
        assert "output_format" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_svg_format_raises():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    try:
        plot_mnt(data, output_format="svg")
    except ValueError as exc:
        assert "output_format" in str(exc)
    else:
        raise AssertionError("expected ValueError for removed svg format")


def test_dict_input_deprecated():
    data = [{"x": 10, "y": 20, "angle": 45, "quality": 80}]
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        html = plot_mnt(data, output_format="html")
    assert "<!doctype html>" in html.lower()
    assert any(issubclass(w.category, DeprecationWarning) for w in caught)


def test_load_minutiae_from_numpy_array():
    arr = np.array([[10, 20, 30, 90], [11, 22, 33, 80]], dtype=float)
    rows = load_minutiae(arr)
    assert len(rows) == 2
    assert rows[0]["x"] == 10.0
    assert rows[0]["angle"] == 30.0
    assert rows[0]["quality"] == 90.0


def test_load_minutiae_from_min_file(tmp_path: Path):
    min_file = tmp_path / "sample.min"
    min_file.write_text("#MIN X Y ANGLE QUALITY\n10 20 30 80\n12 24 40 60\n", encoding="utf-8")
    rows = load_minutiae(min_file)
    assert len(rows) == 2
    assert rows[1]["y"] == 24.0
    assert rows[1]["quality"] == 60.0


def test_minutiae_from_min_returns_numpy(tmp_path: Path):
    min_file = tmp_path / "sample.min"
    min_file.write_text("#MIN X Y ANGLE QUALITY\n10 20 30 80\n", encoding="utf-8")
    arr = minutiae_from_min(min_file)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (1, 4)
    assert arr[0, 0] == 10


def test_load_pairs_from_text_file(tmp_path: Path):
    pair_file = tmp_path / "sample_pairs.txt"
    pair_file.write_text("# left_idx right_idx\n0 10\n2 11\n", encoding="utf-8")
    pairs = load_pairs(pair_file)
    assert pairs.tolist() == [[0, 10], [2, 11]]


def test_plot_from_numpy():
    arr = np.array([[10, 20, 30, 90]], dtype=float)
    html = plot_mnt(arr, output_format="html")
    assert "plotMinutiae" in html


def test_plot_from_min_file(tmp_path: Path):
    min_file = tmp_path / "sample.min"
    min_file.write_text("#MIN X Y ANGLE QUALITY\n10 20 30 80\n", encoding="utf-8")
    arr = minutiae_from_min(min_file)
    html = plot_mnt(arr, output_format="html")
    assert "plotMinutiae" in html


# ── Bundle tests ─────────────────────────────────────────────


def test_bundle_exists():
    from mntviz.plot import _BUNDLE_DIR

    bundle = _BUNDLE_DIR / "plots.bundle.js"
    css = _BUNDLE_DIR / "mntviz.css"
    assert bundle.exists() and bundle.stat().st_size > 0
    assert css.exists() and css.stat().st_size > 0


def test_bundle_contains_plot_functions():
    from mntviz.plot import _load_plots_bundle

    bundle = _load_plots_bundle()
    for name in ("plotMinutiae", "plotOverlay", "plotHuv", "plotMatch"):
        assert name in bundle


# ── Match viewer tests ───────────────────────────────────────


def test_plot_match_html():
    left = np.array([[10, 20, 45, 80], [30, 40, 90, 70]], dtype=float)
    right = np.array([[15, 25, 50, 85], [35, 45, 95, 75]], dtype=float)
    html = plot_mnt_match(left_minutiae=left, right_minutiae=right, output_format="html")
    assert "<!doctype html>" in html.lower()
    assert "plotMatch" in html


def test_plot_match_jupyter():
    left = np.array([[10, 20, 45, 80]], dtype=float)
    right = np.array([[15, 25, 50, 85]], dtype=float)
    fig = plot_mnt_match(left_minutiae=left, right_minutiae=right, output_format="jupyter")
    assert isinstance(fig, MntVizFigure)
    assert "plotmatch" in fig._repr_html_().lower()


def test_plot_match_accepts_pair_file(tmp_path: Path):
    left = np.array([[10, 20, 45, 80], [30, 40, 90, 70]], dtype=float)
    right = np.array([[15, 25, 50, 85], [35, 45, 95, 75], [60, 70, 120, 60]], dtype=float)
    pair_file = tmp_path / "pairs.txt"
    pair_file.write_text("0 1\n1 2\n", encoding="utf-8")

    html = plot_mnt_match(
        left_minutiae=left,
        right_minutiae=right,
        pairs=pair_file,
        output_format="html",
    )

    assert "plotMatch" in html


# ── Overlay tests ────────────────────────────────────────────


def test_plot_overlay_html():
    data = np.random.rand(8, 8).astype(float)
    html = plot_overlay(data, output_format="html")
    assert "<!doctype html>" in html.lower()
    assert "plotOverlay" in html


def test_plot_overlay_jupyter():
    data = np.random.rand(4, 4).astype(float)
    fig = plot_overlay(data, output_format="jupyter")
    assert isinstance(fig, MntVizFigure)
    assert "plotoverlay" in fig._repr_html_().lower()


# ── HUV tests ────────────────────────────────────────────────


def test_plot_huv_html():
    shape = (8, 8)
    h_arr = np.random.rand(*shape).astype(float)
    u_arr = np.random.rand(*shape).astype(float)
    v_arr = np.random.rand(*shape).astype(float)
    html = plot_huv(h_arr, u_arr, v_arr, output_format="html")
    assert "<!doctype html>" in html.lower()
    assert "plotHuv" in html


def test_plot_huv_jupyter():
    shape = (4, 4)
    h_arr = np.random.rand(*shape).astype(float)
    u_arr = np.random.rand(*shape).astype(float)
    v_arr = np.random.rand(*shape).astype(float)
    fig = plot_huv(h_arr, u_arr, v_arr, output_format="jupyter")
    assert isinstance(fig, MntVizFigure)
    assert "plothuv" in fig._repr_html_().lower()


# ── Missing bundle raises clear error ────────────────────────


def test_missing_bundle_raises(monkeypatch, tmp_path):
    import mntviz.plot as plot_mod

    monkeypatch.setattr(plot_mod, "_BUNDLE_DIR", tmp_path)

    data = np.array([[10, 20, 45, 80]], dtype=float)
    try:
        plot_mnt(data, output_format="html")
    except RuntimeError as exc:
        assert "bundle" in str(exc).lower()
    else:
        raise AssertionError("expected RuntimeError when bundle is missing")
