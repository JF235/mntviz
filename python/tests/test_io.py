from pathlib import Path

import numpy as np
from PIL import Image

from mntviz import plot_mnt


def test_background_image_and_output_file(tmp_path: Path):
    img_path = tmp_path / "bg.png"
    out_path = tmp_path / "plot.svg"

    img = Image.new("RGB", (64, 32), color=(50, 50, 50))
    img.save(img_path)

    svg = plot_mnt(
        np.array([[10, 10, 90, 100]], dtype=float),
        background_img=img_path,
        output_format="svg",
        output_path=out_path,
    )

    assert "<image" in svg
    assert out_path.exists()
    assert out_path.read_text(encoding="utf-8").startswith("<svg")
