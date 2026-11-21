"""Draws a laid-out report with fpdf2, in memory (specification section 9.2)."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import TTFFont
from PIL import Image as PillowImage

from qualify import theme as themes
from qualify.report import layout
from qualify.report.content import Document
from qualify.theme import Theme

_SIZES = {"A4": (595.28, 841.89), "Letter": (612.0, 792.0)}


def _rgb(hex_colour: str) -> tuple[int, int, int]:
    return int(hex_colour[1:3], 16), int(hex_colour[3:5], 16), int(hex_colour[5:7], 16)


class _Fonts:
    """The theme's fonts registered with fpdf2, one family per file."""

    def __init__(self, pdf: FPDF, theme: Theme) -> None:
        self._pdf = pdf
        self.family: dict[str, str] = {}
        self._cmap: dict[str, set[int]] = {}
        files: dict[Path, str] = {}
        for slot, path in theme.fonts.items():
            if path not in files:
                files[path] = f"theme{len(files)}"
                pdf.add_font(files[path], "", str(path))
                font = pdf.fonts[files[path]]
                assert isinstance(font, TTFFont)
                self._cmap[files[path]] = set(font.cmap)
            self.family[slot] = files[path]

    def width(self, text: str, size: float, slot: str) -> float:
        self._pdf.set_font(self.family[slot], size=size)
        return float(self._pdf.get_string_width(text))

    def can_draw(self, code: int, slot: str) -> bool:
        return code in self._cmap[self.family[slot]]


def geometry(theme: Theme) -> layout.Geometry:
    """The page size and margin a theme asks for, in points."""
    width, height = _SIZES[theme.spec["page"]["size"]]
    return layout.Geometry(width, height, theme.spec["page"]["marginMm"] * layout.MM)


def _logo_size(theme: Theme) -> tuple[float, float] | None:
    """The logo's width and height in points, at the theme's height."""
    if theme.logo is None:
        return None
    with PillowImage.open(theme.logo) as image:
        pixels_wide, pixels_high = image.size
    height = theme.spec["brand"]["logoHeightMm"] * layout.MM
    return height * pixels_wide / pixels_high, height


def render(document: Document, theme: Theme, producer: str) -> bytes:
    """Lay out and draw the document: the cover without header or footer, then
    the content pages with both. Pages count from the cover. fpdf2 embeds the
    fonts as subsets, so the PDF carries only the glyphs it uses."""
    g = geometry(theme)
    pdf = FPDF(unit="pt", format=(g.width, g.height))
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)
    fonts = _Fonts(pdf, theme)
    colours = {name: _rgb(value) for name, value in theme.colours.items()}

    first = layout.cover(document.cover, _logo_size(theme), fonts, g)
    pages = [first, *layout.paginate(document.blocks, fonts, g)]
    total = str(len(pages))
    for index, ops in enumerate(pages):
        if index > 0:
            values = {**document.tokens, "page": str(index + 1), "pages": total}
            ops = [
                *ops,
                *layout.chrome(
                    themes.render(document.header, values),
                    document.classification,
                    themes.render(document.footer, values),
                    fonts,
                    g,
                ),
            ]
        pdf.add_page()
        # Fills first: a striped row's fill would otherwise cover half of the
        # hairline drawn under the row above it.
        for op in sorted(ops, key=lambda o: not isinstance(o, layout.Fill)):
            _draw(pdf, op, g, fonts, colours, theme)

    meta = document.metadata
    pdf.set_title(meta.title)
    pdf.set_subject(meta.subject)
    pdf.set_keywords(meta.keywords)
    pdf.set_producer(meta.producer)
    pdf.set_creator(meta.producer)
    pdf.set_creation_date(meta.creation_date.astimezone(dt.timezone.utc))
    return bytes(pdf.output())


def _draw(
    pdf: FPDF,
    op: layout.Op,
    g: layout.Geometry,
    fonts: _Fonts,
    colours: dict[str, tuple[int, int, int]],
    theme: Theme,
) -> None:
    """Draw one operation. Layout measures ``y`` up from the bottom; fpdf2 down from the top."""
    if isinstance(op, layout.Text):
        pdf.set_font(fonts.family[op.font], size=op.size)
        pdf.set_text_color(*colours[op.colour])
        pdf.text(op.x, g.height - op.y, op.text)
    elif isinstance(op, layout.Line):
        pdf.set_draw_color(*colours[op.colour])
        pdf.set_line_width(op.thickness)
        pdf.line(op.x1, g.height - op.y1, op.x2, g.height - op.y2)
    elif isinstance(op, layout.Fill):
        pdf.set_fill_color(*colours[op.colour])
        pdf.rect(op.x, g.height - op.y - op.height, op.width, op.height, style="F")
    elif theme.logo is not None:
        pdf.image(str(theme.logo), x=op.x, y=g.height - op.y - op.height, w=op.width, h=op.height)
