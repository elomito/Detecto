"""Image preprocessing helpers for Detecto (OpenCV + PIL)."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
from PIL import Image


def load_image(source: str | Path | bytes | np.ndarray | Image.Image) -> np.ndarray:
    """Load an image as a BGR uint8 ndarray (OpenCV convention)."""
    if isinstance(source, np.ndarray):
        if source.ndim == 2:
            return cv2.cvtColor(source, cv2.COLOR_GRAY2BGR)
        if source.shape[2] == 4:
            return cv2.cvtColor(source, cv2.COLOR_BGRA2BGR)
        return source.copy()

    if isinstance(source, Image.Image):
        rgb = np.asarray(source.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    if isinstance(source, (bytes, bytearray)):
        arr = np.frombuffer(source, dtype=np.uint8)
        image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Could not decode image bytes")
        return image

    path = Path(source)
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return image


def resize_image(
    image: np.ndarray,
    *,
    width: int | None = None,
    height: int | None = None,
    max_side: int | None = 640,
    keep_aspect: bool = True,
) -> np.ndarray:
    """
    Resize an image.

    Provide ``width`` and/or ``height``. If only one is set and ``keep_aspect``
    is True, the other side is scaled proportionally. If neither is set and
    ``max_side`` is given, the longer side is capped at ``max_side``.
    """
    if image is None or image.size == 0:
        raise ValueError("image must be a non-empty ndarray")

    h, w = image.shape[:2]

    if width is None and height is None:
        if max_side is None or max(h, w) <= max_side:
            return image.copy()
        scale = max_side / float(max(h, w))
        new_w, new_h = int(round(w * scale)), int(round(h * scale))
    elif keep_aspect:
        if width is not None and height is not None:
            scale = min(width / w, height / h)
            new_w, new_h = int(round(w * scale)), int(round(h * scale))
        elif width is not None:
            scale = width / w
            new_w, new_h = width, int(round(h * scale))
        else:
            scale = height / h  # type: ignore[operator]
            new_w, new_h = int(round(w * scale)), height  # type: ignore[arg-type]
    else:
        new_w = width if width is not None else w
        new_h = height if height is not None else h

    new_w, new_h = max(1, new_w), max(1, new_h)
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def normalize_image(
    image: np.ndarray,
    *,
    mean: Sequence[float] = (0.0, 0.0, 0.0),
    std: Sequence[float] = (255.0, 255.0, 255.0),
    scale_01: bool = False,
) -> np.ndarray:
    """
    Normalize pixel values to float32.

    Default divides by 255 (via ``std``) yielding roughly [0, 1] per channel.
    If ``scale_01`` is True, values are first scaled to [0, 1], then
    ``(x - mean) / std`` is applied (ImageNet-style when mean/std are set).
    """
    arr = image.astype(np.float32)
    if scale_01:
        arr = arr / 255.0

    mean_arr = np.asarray(mean, dtype=np.float32).reshape(1, 1, -1)
    std_arr = np.asarray(std, dtype=np.float32).reshape(1, 1, -1)
    if std_arr.size == 1:
        std_arr = np.full_like(mean_arr, float(std_arr))
    return (arr - mean_arr) / std_arr


def adjust_contrast(
    image: np.ndarray,
    *,
    alpha: float = 1.5,
    beta: float = 0.0,
    method: str = "linear",
) -> np.ndarray:
    """
    Adjust contrast (and optionally brightness).

    - ``linear``: OpenCV ``convertScaleAbs`` with gain ``alpha`` and bias ``beta``.
    - ``clahe``: CLAHE on the L channel in LAB space (``alpha`` unused; ``clip_limit``
      can be passed via ``beta`` as clip limit when > 0, else 2.0).
    - ``pil``: PIL ``ImageEnhance.Contrast`` with factor ``alpha``.
    """
    if method == "linear":
        return cv2.convertScaleAbs(image, alpha=alpha, beta=beta)

    if method == "clahe":
        clip_limit = float(beta) if beta > 0 else 2.0
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        l_ch = clahe.apply(l_ch)
        return cv2.cvtColor(cv2.merge([l_ch, a_ch, b_ch]), cv2.COLOR_LAB2BGR)

    if method == "pil":
        from PIL import ImageEnhance

        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)
        enhanced = ImageEnhance.Contrast(pil_img).enhance(alpha)
        return cv2.cvtColor(np.asarray(enhanced), cv2.COLOR_RGB2BGR)

    raise ValueError(f"Unknown contrast method: {method!r}")


def preprocess_for_detection(
    image: np.ndarray,
    *,
    max_side: int = 1280,
    contrast_alpha: float = 1.0,
) -> np.ndarray:
    """Light pipeline: optional contrast tweak then resize for inference."""
    out = image
    if contrast_alpha != 1.0:
        out = adjust_contrast(out, alpha=contrast_alpha, method="linear")
    return resize_image(out, max_side=max_side)


