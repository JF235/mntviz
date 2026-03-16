from pathlib import Path
import warnings

import numpy as np

from mntviz import MntVizFigure, load_minutiae, minutiae_from_min, plot_mnt


def test_plot_svg_minimal():
    data = [{"x": 10, "y": 20, "angle": 45, "quality": 80}]
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        svg = plot_mnt(data, output_format="svg")
    assert svg.startswith("<svg")
    assert "<circle" in svg
    assert "<line" in svg
    assert any(issubclass(w.category, DeprecationWarning) for w in caught)


def test_plot_html_minimal():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    html = plot_mnt(data, output_format="html")
    assert "<!doctype html>" in html.lower()
    assert "mntviz-runtime-host" in html
    assert "enableMinutiaeInspector" in html


def test_plot_jupyter_returns_displayable():
    data = np.array([[10, 20, 45, 80]], dtype=float)
    fig = plot_mnt(data, output_format="jupyter")
    assert isinstance(fig, MntVizFigure)
    html_inline = fig._repr_html_().lower()
    assert "<!doctype html>" not in html_inline
    assert "<html" not in html_inline
    assert "data-mntviz-runtime-host" in html_inline
    assert "enableminutiaeinspector" in html_inline


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


def test_plot_svg_from_numpy_array():
    arr = np.array([[10, 20, 30, 90]], dtype=float)
    svg = plot_mnt(arr, output_format="svg")
    assert svg.startswith("<svg")


def test_minutiae_from_min_returns_numpy(tmp_path: Path):
    min_file = tmp_path / "sample.min"
    min_file.write_text("#MIN X Y ANGLE QUALITY\n10 20 30 80\n", encoding="utf-8")
    arr = minutiae_from_min(min_file)
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (1, 4)
    assert arr[0, 0] == 10


def test_plot_accepts_numpy_converted_from_min(tmp_path: Path):
    min_file = tmp_path / "sample.min"
    min_file.write_text("#MIN X Y ANGLE QUALITY\n10 20 30 80\n", encoding="utf-8")
    arr = minutiae_from_min(min_file)
    svg = plot_mnt(arr, output_format="svg")
    assert "<circle" in svg
