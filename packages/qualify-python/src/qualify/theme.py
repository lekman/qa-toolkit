"""Report themes and their text templates (specification section 9.3)."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from qualify import schema

BUNDLED = ("lekman", "plain")
DEFAULT = "lekman"
SLOTS = ("body", "bodyBold", "heading", "mono")

_COMMON = ("date", "documentId", "environment", "levels", "runId", "sha12", "verdict", "version")
_ALLOWED: dict[str, tuple[str, ...]] = {
    "title": _COMMON,
    "classification": _COMMON,
    "subtitle": (*_COMMON, "title", "classification"),
    "header": (*_COMMON, "title", "classification", "page", "pages"),
    "footer": (*_COMMON, "title", "classification", "page", "pages"),
}


class ThemeError(Exception):
    """A theme that cannot be used: invalid, incomplete, or with an unknown token. Exit 2."""


def bundled_dir() -> Path:
    """The folder holding the bundled themes, one folder per theme."""
    return Path(__file__).resolve().parent / "themes"


def parse(template: str, where: str) -> list[tuple[str, str]]:
    """Split a template into ``("text", ...)`` and ``("token", ...)`` parts.

    ``{{`` and ``}}`` are literal braces; an unbalanced brace is an error.
    """
    parts: list[tuple[str, str]] = []
    text = ""
    i = 0
    while i < len(template):
        char = template[i]
        pair = template[i : i + 2]
        if pair in ("{{", "}}"):
            text += char
            i += 2
            continue
        if char == "{":
            end = template.find("}", i + 1)
            if end < 0:
                raise ThemeError(f'{where}: a "{{" is not closed; write "{{{{" for a literal brace')
            if text:
                parts.append(("text", text))
            text = ""
            parts.append(("token", template[i + 1 : end]))
            i = end + 1
            continue
        if char == "}":
            raise ThemeError(f'{where}: a "}}" has no "{{"; write "}}}}" for a literal brace')
        text += char
        i += 1
    if text:
        parts.append(("text", text))
    return parts


def render(template: str, values: Mapping[str, str]) -> str:
    """Fill a template whose tokens were checked."""
    return "".join(
        value if kind == "text" else values.get(value, "")
        for kind, value in parse(template, "template")
    )


def validate_texts(texts: Mapping[str, str], where: str) -> None:
    """Check every template of a theme's ``texts``, naming the first token it may not use."""
    for name, template in texts.items():
        allowed = _ALLOWED.get(name, _COMMON)
        for kind, value in parse(template, f"{where}: texts.{name}"):
            if kind == "token" and value not in allowed:
                names = ", ".join(f"{{{t}}}" for t in allowed)
                raise ThemeError(
                    f"{where}: texts.{name} uses {{{value}}}, which is not a token it may use "
                    f"({names})"
                )


def _font_problem(data: bytes) -> str | None:
    if data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
        return "is not a TrueType or OpenType font"
    tables = int.from_bytes(data[4:6], "big")
    for i in range(tables):
        if data[12 + 16 * i : 16 + 16 * i] == b"fvar":
            return "is a variable font, which is not supported"
    return None


@dataclass(frozen=True)
class Theme:
    """A checked theme, with the paths of the files it names."""

    path: Path
    spec: dict[str, Any]
    fonts: dict[str, Path]
    logo: Path | None

    @property
    def texts(self) -> dict[str, str]:
        """The text templates."""
        texts: dict[str, str] = self.spec["texts"]
        return texts

    @property
    def colours(self) -> dict[str, str]:
        """Colour names and their ``#rrggbb`` values."""
        colours: dict[str, str] = self.spec["colours"]
        return colours


def load(reference: str, cwd: str | Path | None = None) -> Theme:
    """Load a bundled theme by name, or a theme file by path, and check it all:
    the schema, the tokens of its texts, and every file it names."""
    if reference in BUNDLED:
        path = bundled_dir() / reference / "theme.json"
    else:
        path = Path(cwd or os.getcwd(), reference).resolve()

    def read(file: Path, what: str) -> bytes:
        try:
            return file.read_bytes()
        except OSError as error:
            raise ThemeError(
                f"{path}: {what} {file} cannot be read ({error.strerror or error})"
            ) from error

    try:
        data = json.loads(read(path, "the theme file").decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise ThemeError(f"{path}: not valid JSON ({error})") from error
    problems = schema.theme(data)
    if problems:
        raise ThemeError(f"{path}: {'; '.join(problems)}")
    validate_texts(data["texts"], str(path))

    folder = path.parent
    fonts: dict[str, Path] = {}
    for slot in SLOTS:
        file = (folder / data["fonts"][slot]).resolve()
        problem = _font_problem(read(file, f"fonts.{slot}"))
        if problem is not None:
            raise ThemeError(f"{path}: fonts.{slot} {file} {problem}")
        fonts[slot] = file
    logo = None
    if data["brand"]["logo"] is not None:
        logo = (folder / data["brand"]["logo"]).resolve()
        head = read(logo, "brand.logo")[:4]
        if not (head == b"\x89PNG" or head[:3] == b"\xff\xd8\xff"):
            raise ThemeError(f"{path}: brand.logo {logo} is not a PNG or JPEG image")
    return Theme(path, data, fonts, logo)
