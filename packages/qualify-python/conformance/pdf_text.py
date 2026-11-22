"""Text extraction from a PDF with pypdf, for the report scenarios and the unit
tests. Not part of the package: pypdf is a dev dependency.

Text on one baseline of a page becomes one line, left to right. Runs of
whitespace collapse to one space and empty lines are dropped, as scenario 21
describes.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

from pypdf import PdfReader
from pypdf.generic import DictionaryObject, IndirectObject, NumberObject


@dataclass(frozen=True)
class PdfText:
    """The extracted lines of each page, and the document information."""

    pages: list[list[str]]
    info: dict[str, str]

    @property
    def lines(self) -> list[str]:
        """Every line of every page, in order."""
        return [line for page in self.pages for line in page]


def _multiply(a: Sequence[float], b: Sequence[float]) -> list[float]:
    return [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5],
    ]


def _visit(
    items: list[tuple[float, float, str]], text: str, cm: Any, tm: Any, font: Any, size: Any
) -> None:
    if text.strip():
        matrix = _multiply(tm, cm)
        items.append((round(matrix[5], 1), matrix[4], text))


def extract(path: str | Path) -> PdfText:
    """Extract the text lines of each page and the document information."""
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        items: list[tuple[float, float, str]] = []
        page.extract_text(visitor_text=partial(_visit, items))
        rows: dict[float, list[tuple[float, str]]] = {}
        for y, x, text in items:
            rows.setdefault(y, []).append((x, text))
        lines = []
        for y in sorted(rows, reverse=True):
            line = " ".join(text for _, text in sorted(rows[y]))
            line = re.sub(r"\s+", " ", line).strip()
            if line:
                lines.append(line)
        pages.append(lines)
    info = {str(k).lstrip("/"): str(v) for k, v in (reader.metadata or {}).items()}
    return PdfText(pages, info)


def missing_from_outline(lines: Sequence[str], outline: Sequence[str]) -> str | None:
    """The first outline line not found in order, or ``None``. A line is found
    inside an extracted line, at or after the end of the previous match."""
    at, offset = 0, 0
    for wanted in outline:
        while at < len(lines):
            index = lines[at].find(wanted, offset)
            if index >= 0:
                offset = index + len(wanted)
                break
            at, offset = at + 1, 0
        else:
            return wanted
    return None


def outline(path: str | Path) -> list[str]:
    """An outline file's lines, whitespace collapsed, empty lines dropped."""
    text = Path(path).read_text("utf-8")
    return [line for line in (re.sub(r"\s+", " ", raw).strip() for raw in text.split("\n")) if line]


def placed_images(path: str | Path) -> list[tuple[int, int]]:
    """The pixel sizes of the image XObjects in the resources of the pages
    after the cover, each image once, sorted. A transparency mask hangs off
    its image, not off a page, so it is not listed."""
    seen: dict[int, tuple[int, int]] = {}
    for page in PdfReader(str(path)).pages[1:]:
        resources = page.get("/Resources")
        xobjects = resources.get_object().get("/XObject") if resources is not None else None
        if xobjects is None:
            continue
        for key, reference in xobjects.get_object().items():
            image = reference.get_object()
            if not isinstance(image, DictionaryObject) or image.get("/Subtype") != "/Image":
                continue
            width, height = image["/Width"], image["/Height"]
            assert isinstance(width, NumberObject)
            assert isinstance(height, NumberObject)
            ident = reference.idnum if isinstance(reference, IndirectObject) else hash(key)
            seen[ident] = (int(width), int(height))
    return sorted(seen.values())
