from .plot import MntVizFigure, load_minutiae, load_pairs, minutiae_from_min, plot_mnt, plot_mnt_match, plot_overlay, plot_huv, plot_sing
from . import encode

# PointPickerWidget fica de fora de __all__: `from mntviz import *` resolve cada nome de __all__ e,
# sem o extra [widget], o __getattr__ abaixo levanta ImportError. `mntviz.PointPickerWidget` e
# `from mntviz import PointPickerWidget` continuam valendo.
__all__ = ["plot_mnt", "plot_mnt_match", "plot_overlay", "plot_huv", "plot_sing", "load_minutiae", "load_pairs", "minutiae_from_min", "MntVizFigure", "encode"]


def __getattr__(name: str):
    # PointPickerWidget depende do extra [widget] (anywidget, traitlets): import preguiçoso,
    # para que `import mntviz` funcione sem ele.
    if name == "PointPickerWidget":
        from .picker import _widget_class
        return _widget_class()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted([*globals(), "PointPickerWidget"])
