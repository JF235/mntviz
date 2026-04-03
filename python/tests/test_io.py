from pathlib import Path

import numpy as np
from PIL import Image

from mntviz import plot_mnt


def test_background_image_and_output_file(tmp_path: Path):
    img_path = tmp_path / "bg.png"
    out_path = tmp_path / "plot.html"

    img = Image.new("RGB", (64, 32), color=(50, 50, 50))
    img.save(img_path)

    html = plot_mnt(
        np.array([[10, 10, 90, 100]], dtype=float),
        background_img=img_path,
        output_format="html",
        output_path=out_path,
    )

    assert "plotMinutiae" in html
    assert out_path.exists()
    assert "<!doctype html>" in out_path.read_text(encoding="utf-8").lower()
