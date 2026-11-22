"""Image attachments in the report (specification section 9.2): which
attachments are drawn, how large, and the lines that go with them.

Pure: the PDF library decodes the bytes later.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

ImageFormat = Literal["png", "jpeg"]

_SIGNATURES: dict[ImageFormat, bytes] = {
    "png": b"\x89PNG\r\n\x1a\n",
    "jpeg": b"\xff\xd8\xff",
}


@dataclass(frozen=True)
class ImageSource:
    """The bytes of an image attachment, as the evidence holds them."""

    data: bytes
    format: ImageFormat


def image_format(content_type: str) -> ImageFormat | None:
    """The image format of a content type, or ``None`` for one the report does not draw."""
    if content_type == "image/png":
        return "png"
    if content_type == "image/jpeg":
        return "jpeg"
    return None


def signed(data: bytes, fmt: ImageFormat) -> bool:
    """Whether the bytes start with the signature of their format."""
    return data.startswith(_SIGNATURES[fmt])


def fit(pixels: tuple[float, float], box: tuple[float, float]) -> tuple[float, float]:
    """The size to draw an image at: one pixel is one point, scaled down to fit
    the box with its aspect ratio kept, and never scaled up."""
    width, height = pixels
    scale = min(1.0, box[0] / width, box[1] / height)
    return width * scale, height * scale


def caption(attachment: Mapping[str, Any]) -> str:
    """``<file name>, <size> bytes, SHA-256 <first 12 characters of sha256>``"""
    return (
        f"{attachment['filename']}, {attachment['sizeBytes']} bytes, "
        f"SHA-256 {attachment['sha256'][:12]}"
    )


def unreadable(attachment: Mapping[str, Any]) -> str:
    """The line drawn in place of an image that cannot be read."""
    return (
        f"{attachment['filename']} could not be read as {attachment['contentType']}, "
        "so it is not drawn."
    )
