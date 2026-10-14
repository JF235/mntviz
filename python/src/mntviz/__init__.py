from .plot import MntVizFigure, load_minutiae, load_pairs, minutiae_from_min, plot_mnt, plot_mnt_match, plot_overlay, plot_huv, plot_sing
from . import encode

__all__ = ["plot_mnt", "plot_mnt_match", "plot_overlay", "plot_huv", "plot_sing", "load_minutiae", "load_pairs", "minutiae_from_min", "MntVizFigure", "PointPickerWidget", "encode"]


def __getattr__(name: str):
    # PointPickerWidget depende do extra [widget] (anywidget, traitlets): import preguiçoso,
    # para que `import mntviz` funcione sem ele.
    if name == "PointPickerWidget":
        from .picker import _widget_class
        return _widget_class()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
