"""mntviz.encode — protocolo de fio do mntviz, lado Python (numpy puro, vetorizado).

O protocolo é o que o JS do mntviz lê (``OverlayLayer``, ``FieldProbe``,
``UVFieldRenderer``):

* **Escalar**: PNG de 1 canal com ``byte = round(v·254 + 1)`` para ``v`` em
  [0, 1]; o byte 0 é "sem dado" (``v <= 0``, NaN ou fora de ``valid``). O
  cliente aplica a LUT e o probe inverte com ``(byte − 1)/254``.
  ``round`` é o de numpy/Python (metade para o par). ``rounding="floor"``
  reproduz o ``astype(uint8)`` do dashboard (``npz_renderer.render_npz_scalar``).
* **Setas**: lista ``[x, y, dx, dy, conf(, mod)]`` em coordenadas da imagem
  (y para baixo). Direção de minúcia: ``(u, −v)/|uv|`` com comprimento
  ``seg_base + seg_gain·conf²``.
* **Orientação**: ângulo duplo, ``θ = atan2(v, u)/2``; seta unitária e
  ``conf = min(|uv|, 1)``. O referencial de ``ori_u/ori_v`` é um parâmetro
  (``convention``): ``"image"`` (padrão, y para baixo, seta ``(cos θ, sin θ)``) ou
  ``"iso"`` (y para cima, seta ``(cos θ, −sin θ)``, como ``uv_arrows``).

Os laços Python dos dois encoders que existiam (``_compute_uv_arrows`` do
wrapper e ``render_uv_arrows``/``render_ori_arrows``/... do stitch-dashboard)
viram operações de array. A semântica padrão é a do dashboard (o servidor);
``compat="wrapper"`` reproduz a do wrapper (normalização por ``max + 1e-8`` e
limiares inclusivos), que o ``plot_huv`` usa para não mudar a saída.

Só numpy (e Pillow para o PNG). Um servidor pode ter o próprio encoder, desde
que siga o mesmo protocolo; este módulo serve de referência.
"""

from __future__ import annotations

import io
import math
from typing import Any, Mapping, Sequence

import numpy as np

__all__ = [
    "NO_DATA",
    "decode_unit",
    "decode_signed_unit",
    "scalar_u8",
    "scalar_png",
    "decode_scalar",
    "mtype_u8",
    "uv_arrows",
    "ori_arrows",
    "sing_arrows",
    "arrows_to_list",
    "png_bytes",
]

#: Byte reservado para "sem dado" nos mapas escalares.
NO_DATA = 0


# ── decodificação de mapas guardados em uint8 ─────────────────────────────


def decode_unit(arr: Any) -> np.ndarray:
    """uint8 [0, 255] → float32 [0, 1]; float vira float32 sem reescala."""
    a = np.asarray(arr)
    if a.dtype == np.uint8:
        return a.astype(np.float32) / 255.0
    return a.astype(np.float32, copy=False)


def decode_signed_unit(arr: Any) -> np.ndarray:
    """uint8 [0, 254] (127 = zero) → float32 [−1, 1]; float vira float32."""
    a = np.asarray(arr)
    if a.dtype == np.uint8:
        return (a.astype(np.float32) - 127.0) / 127.0
    return a.astype(np.float32, copy=False)


# ── escalares ─────────────────────────────────────────────────────────────


def _to_u8(t: np.ndarray, rounding: str) -> np.ndarray:
    if rounding == "round":
        t = np.rint(t)
    elif rounding != "floor":
        raise ValueError("rounding must be 'round' or 'floor'")
    # NaN vira 0 antes do astype (o cast de NaN dá RuntimeWarning); quem chama põe o byte
    # "sem dado" nessas células. Com clip antes, o astype trunca valores não negativos (= floor).
    t = np.nan_to_num(t, nan=0.0, posinf=255.0, neginf=0.0)
    return np.clip(t, 0, 255).astype(np.uint8)


def scalar_u8(
    values: Any,
    *,
    normalize: bool = False,
    valid: Any = None,
    rounding: str = "round",
) -> np.ndarray:
    """Mapa escalar em [0, 1] → uint8 do protocolo (0 = sem dado).

    Args:
        values: array 2D (uint8 é decodificado com ``/255``; float é usado como está).
        normalize: divide pelo máximo da imagem antes de codificar (só para
            exibição: o valor lido pelo probe deixa de ser o absoluto).
        valid: máscara booleana opcional; fora dela o byte é 0.
        rounding: ``"round"`` (contrato) ou ``"floor"`` (igual ao dashboard).
    """
    v = decode_unit(values)
    if normalize:
        vmax = float(v.max()) if v.size else 0.0
        if vmax > 0:
            v = v / vmax
    out = _to_u8(v * 254 + 1, rounding)
    nodata = ~(v > 0)
    if valid is not None:
        nodata |= ~np.asarray(valid, dtype=bool)
    out[nodata] = NO_DATA
    return out


def decode_scalar(u8: Any) -> np.ndarray:
    """Inverso do protocolo: float32 ``(byte − 1)/254``, com NaN onde o byte é 0."""
    b = np.asarray(u8)
    out = (b.astype(np.float32) - 1.0) / 254.0
    out[b == NO_DATA] = np.nan
    return out


def png_bytes(u8: Any) -> bytes:
    """PNG de 1 canal (modo L) a partir de um array uint8 2D."""
    from PIL import Image

    a = np.asarray(u8)
    if a.dtype != np.uint8 or a.ndim != 2:
        raise ValueError(f"expected a 2D uint8 array, got {a.dtype} {a.shape}")
    buf = io.BytesIO()
    Image.fromarray(a).save(buf, format="PNG")
    return buf.getvalue()


def scalar_png(values: Any, **kwargs: Any) -> bytes:
    """``scalar_u8`` + ``png_bytes``: o PNG que o ``OverlayLayer`` carrega."""
    return png_bytes(scalar_u8(values, **kwargs))


def mtype_u8(h_end: Any, h_bif: Any, *, rounding: str = "round") -> np.ndarray:
    """Razão de tipo ``H_end/(H_end + H_bif)`` no protocolo escalar.

    0,5 onde a soma é ~0; byte 0 onde ``max(H_end, H_bif) < 0,01``. Com
    ``rounding="floor"`` é igual ao ``render_npz_mtype_scalar`` do dashboard.
    """
    e = decode_unit(h_end)
    b = decode_unit(h_bif)
    total = e + b
    ratio = np.where(total > 1e-6, e / np.where(total > 1e-6, total, 1.0), 0.5)
    out = _to_u8(ratio * 254 + 1, rounding)
    out[np.maximum(e, b) < 0.01] = NO_DATA
    return out


# ── setas ─────────────────────────────────────────────────────────────────


def _grid(shape: Sequence[int], stride: int) -> tuple[np.ndarray, np.ndarray]:
    gh, gw = int(shape[0]), int(shape[1])
    ys, xs = np.mgrid[0:gh:stride, 0:gw:stride]
    return ys, xs


def _scales(shape: Sequence[int], output_size: Sequence[int] | None) -> tuple[float, float]:
    if output_size is None:
        return 1.0, 1.0
    out_h, out_w = output_size
    return out_w / shape[1], out_h / shape[0]


def uv_arrows(
    h: Any,
    u: Any,
    v: Any,
    *,
    stride: int = 6,
    h_threshold: float = 0.05,
    seg_base: float = 2.0,
    seg_gain: float = 10.0,
    mag_threshold: float = 1e-4,
    output_size: Sequence[int] | None = None,
    modulation: Any = None,
    compat: str | None = None,
) -> np.ndarray:
    """Campo de direção das minúcias (H, U, V) → setas ``(N, 5)`` ou ``(N, 6)``.

    Amostra a grade a cada ``stride`` células (linhas por fora, colunas por
    dentro) e mantém as células com ``|uv|`` e ``H/max(H)`` acima dos
    limiares. ``output_size=(h, w)`` leva as posições da grade para a imagem.
    ``modulation`` (2D, mesmo shape) acrescenta a 6ª coluna ``mod/max(mod)``.

    ``compat="wrapper"``: arrays usados como vêm, ``conf = H/(max(H) + 1e-8)``
    e limiares inclusivos (``>=``), como o ``plot_huv`` sempre fez.
    """
    if compat not in (None, "wrapper"):
        raise ValueError("compat must be None or 'wrapper'")
    h_a, u_a, v_a = np.asarray(h), np.asarray(u), np.asarray(v)
    if not (h_a.shape == u_a.shape == v_a.shape) or h_a.ndim != 2:
        raise ValueError(f"h, u, v must be 2D with the same shape: {h_a.shape}, {u_a.shape}, {v_a.shape}")
    s = int(stride)
    # Só as células amostradas são decodificadas. O máximo global sai do array
    # cru: a decodificação é monótona, então max(decode(H)) = decode(max(H)).
    if compat == "wrapper":
        hn = h_a[::s, ::s] / (float(h_a.max()) + 1e-8)
        us, vs = u_a[::s, ::s], v_a[::s, ::s]
    else:
        h_max = float(decode_unit(h_a.max()))
        hs = decode_unit(h_a[::s, ::s])
        hn = hs / h_max if h_max > 0 else hs
        us, vs = decode_signed_unit(u_a[::s, ::s]), decode_signed_unit(v_a[::s, ::s])

    ys, xs = _grid(h_a.shape, s)
    conf = np.asarray(hn).astype(np.float64)
    uu = np.asarray(us).astype(np.float64)
    vv = np.asarray(vs).astype(np.float64)
    if compat == "wrapper":
        # Bit a bit igual ao laço antigo: math.hypot e `**` do Python (diferem de
        # np.hypot e de x*x no último bit em ~0,1% das células), aplicados só às
        # candidatas, as poucas células que passam no limiar de H.
        keep = ~(conf < h_threshold)
        mag = np.zeros_like(conf)
        mag[keep] = [math.hypot(a, b) for a, b in zip(uu[keep].tolist(), vv[keep].tolist())]
        keep &= ~(mag < 1e-4)
        c = conf[keep]
        sq = np.array([x ** 2 for x in c.tolist()], dtype=np.float64)
    else:
        mag = np.hypot(uu, vv)
        keep = (mag > mag_threshold) & (conf > h_threshold)
        c = conf[keep]
        sq = c * c

    m = mag[keep]
    seg = seg_base + seg_gain * sq
    sx, sy = _scales(h_a.shape, output_size)
    cols = [
        xs[keep] * sx if output_size is not None else xs[keep].astype(np.float64),
        ys[keep] * sy if output_size is not None else ys[keep].astype(np.float64),
        (uu[keep] / m) * seg,
        (-(vv[keep] / m)) * seg,
        c,
    ]
    if modulation is not None:
        mod = np.asarray(modulation, dtype=float)
        if mod.shape != h_a.shape:
            raise ValueError(f"modulation must have the shape of h: {mod.shape} vs {h_a.shape}")
        mod_max = float(mod.max()) + 1e-8
        cols.append(mod[::s, ::s][keep] / mod_max)
    return np.stack(cols, axis=1) if c.size else np.zeros((0, len(cols)))


def ori_arrows(
    ori_u: Any,
    ori_v: Any,
    *,
    stride: int = 6,
    mag_threshold: float = 1e-4,
    output_size: Sequence[int] | None = None,
    convention: str = "image",
) -> np.ndarray:
    """Orientação em ângulo duplo (ori_u, ori_v) → segmentos unitários ``(N, 5)``.

    ``θ = atan2(v, u)/2``, ``conf = min(|uv|, 1)``; células com ``|uv| < mag_threshold``
    saem. As setas vão em coordenadas da imagem (y para baixo); o que muda com
    ``convention`` é o referencial em que ``ori_u/ori_v`` foram escritos:

    * ``"image"`` (padrão): θ medido na própria imagem, y para baixo. É o dos mapas
      ``ori_u/ori_v`` do mntstitch (conferido com o gradiente da imagem num exemplo da SD258:
      correlação média de cos 2Δθ de 0,78 contra 0,16 no outro referencial). Seta
      ``(cos θ, sin θ)``.
    * ``"iso"``: θ ISO, anti-horário com y para cima, como a direção das minúcias em
      ``uv_arrows`` e ``sing_arrows`` (que negam v). Seta ``(cos θ, −sin θ)``: um campo
      de 30° ISO é desenhado a 30° no sentido anti-horário na tela, não a −30°.

    Dados escritos em y para cima passados como ``"image"`` saem espelhados na vertical.
    """
    if convention not in ("image", "iso"):
        raise ValueError("convention must be 'image' or 'iso'")
    u_a, v_a = np.asarray(ori_u), np.asarray(ori_v)
    if u_a.shape != v_a.shape or u_a.ndim != 2:
        raise ValueError(f"ori_u, ori_v must be 2D with the same shape: {u_a.shape}, {v_a.shape}")
    s = int(stride)
    ys, xs = _grid(u_a.shape, s)
    uu = decode_signed_unit(u_a[::s, ::s]).astype(np.float64)
    vv = decode_signed_unit(v_a[::s, ::s]).astype(np.float64)
    mag = np.hypot(uu, vv)
    keep = ~(mag < mag_threshold)
    theta = np.arctan2(vv[keep], uu[keep]) / 2.0
    sx, sy = _scales(u_a.shape, output_size)
    dy = np.sin(theta) if convention == "image" else -np.sin(theta)
    cols = [
        xs[keep] * sx,
        ys[keep] * sy,
        np.cos(theta),
        dy,
        np.minimum(mag[keep], 1.0),
    ]
    return np.stack(cols, axis=1) if theta.size else np.zeros((0, 5))


def sing_arrows(
    maps: Mapping[str, Any],
    *,
    prefixes: Sequence[str] = ("core_", "delta_"),
    stride: int = 4,
    h_threshold: float = 0.05,
    mag_threshold: float = 1e-4,
    output_size: Sequence[int] | None = None,
) -> np.ndarray | None:
    """Setas unitárias de singularidades (``<prefixo>H/U/V``) → ``(N, 6)``.

    ``stride`` em pixels da saída (não em células da grade), como o
    ``render_singularities_arrows`` do dashboard; a 6ª coluna repete a
    confiança (gancho de modulação). ``None`` se nenhum trio existir.
    """
    blocks = []
    found = False
    for prefix in prefixes:
        keys = (f"{prefix}H", f"{prefix}U", f"{prefix}V")
        if any(k not in maps for k in keys):
            continue
        found = True
        h = np.asarray(maps[keys[0]])
        u = np.asarray(maps[keys[1]])
        v = np.asarray(maps[keys[2]])
        h_max = float(decode_unit(h.max()))
        grid_h, grid_w = h.shape
        out_h, out_w = (output_size if output_size is not None else (grid_h, grid_w))
        py = np.arange(0, out_h, int(stride))
        px = np.arange(0, out_w, int(stride))
        gy = np.minimum((py * (grid_h / out_h)).astype(np.int64), grid_h - 1)
        gx = np.minimum((px * (grid_w / out_w)).astype(np.int64), grid_w - 1)
        ix = np.ix_(gy, gx)
        hs = decode_unit(h[ix])
        uu = decode_signed_unit(u[ix]).astype(np.float64)
        vv = decode_signed_unit(v[ix]).astype(np.float64)
        hv = (hs / h_max if h_max > 0 else hs).astype(np.float64)
        mag = np.hypot(uu, vv)
        keep = (mag > mag_threshold) & (hv > h_threshold)
        pys, pxs = np.meshgrid(py, px, indexing="ij")
        m = mag[keep]
        c = hv[keep]
        blocks.append(np.stack([
            pxs[keep].astype(np.float64),
            pys[keep].astype(np.float64),
            uu[keep] / m,
            -(vv[keep] / m),
            c,
            c,
        ], axis=1) if c.size else np.zeros((0, 6)))
    if not found:
        return None
    return np.concatenate(blocks, axis=0) if blocks else np.zeros((0, 6))


def arrows_to_list(arrows: np.ndarray | None, *, int_xy: bool = False) -> list[list[float]] | None:
    """Array de setas → lista JSON (``int_xy``: posições como inteiros)."""
    if arrows is None:
        return None
    rows = np.asarray(arrows).tolist()
    if int_xy:
        for r in rows:
            r[0] = int(r[0])
            r[1] = int(r[1])
    return rows
