"""Layout of the report on pages (specification section 9.2): the cover, the
content pages after it, and their header and footer.

Pure: text is measured through :class:`Metrics`, and the result is a list of
drawing operations per page, in points, with ``y`` measured up from the bottom
edge as PDF does.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Protocol

from qualify.report.content import (
    Block,
    Column,
    Cover,
    Field,
    Fields,
    Heading,
    Listing,
    Paragraph,
    Signatures,
    Table,
)

MM = 72 / 25.4
SIZE_BODY = 9.0
SIZE_MONO = 8.5  # mono runs wide; at 8.5 pt a SHA-256 digest fits the value column on A4
SIZE_CHROME = 8.5
SIZE_HEADING = {1: 20.0, 2: 14.0, 3: 11.0}
PAD_Y = 3.5
PAD_X = 4.0
LABEL = 0.28


def line_height(size: float) -> float:
    return size * 1.4


class Metrics(Protocol):
    """Measures text in the theme's fonts."""

    def width(self, text: str, size: float, slot: str) -> float:
        """The width of ``text`` in points."""

    def can_draw(self, code: int, slot: str) -> bool:
        """Whether the font in ``slot`` has a glyph for the code point."""


@dataclass(frozen=True)
class Text:
    text: str
    x: float
    y: float
    size: float
    font: str
    colour: str


@dataclass(frozen=True)
class Line:
    x1: float
    y1: float
    x2: float
    y2: float
    thickness: float
    colour: str


@dataclass(frozen=True)
class Fill:
    x: float
    y: float
    width: float
    height: float
    colour: str


@dataclass(frozen=True)
class Image:
    x: float
    y: float
    width: float
    height: float


Op = Text | Line | Fill | Image
Page = list[Op]


@dataclass(frozen=True)
class Geometry:
    """Page size and margin, in points."""

    width: float
    height: float
    margin: float


def drawable(text: str, can_draw: Callable[[int], bool]) -> str:
    """Replace each character the font cannot draw with ``?``. Tabs become
    spaces; line breaks stay, for the layout to split on."""
    out = []
    for char in text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " "):
        code = ord(char)
        if char == "\n":
            out.append(char)
        elif code < 0x20 or 0x7F <= code < 0xA0 or not can_draw(code):
            out.append("?")
        else:
            out.append(char)
    return "".join(out)


def _size(slot: str) -> float:
    return SIZE_MONO if slot == "mono" else SIZE_BODY


def wrap(text: str, width: float, size: float, slot: str, metrics: Metrics) -> list[str]:
    """Wrap text to a width: at spaces where possible, inside a word wider than
    the line on its own. Line breaks in the text are kept."""

    def fits(candidate: str) -> bool:
        return metrics.width(candidate, size, slot) <= width

    lines: list[str] = []
    for paragraph in text.split("\n"):
        line = ""
        for word in paragraph.split(" "):
            candidate = word if not line else f"{line} {word}"
            if fits(candidate):
                line = candidate
                continue
            if line:
                lines.append(line)
            line = ""
            if fits(word):
                line = word
                continue
            for char in word:
                if line and not fits(line + char):
                    lines.append(line)
                    line = ""
                line += char
        lines.append(line)
    return lines


def fit(text: str, width: float, size: float, slot: str, metrics: Metrics) -> str:
    """Shorten text to a width, ending it with ``…`` when it had to be cut."""
    if metrics.width(text, size, slot) <= width:
        return text
    chars = list(text)
    while chars and metrics.width("".join(chars).rstrip() + "…", size, slot) > width:
        chars.pop()
    return "".join(chars).rstrip() + "…" if chars else ""


@dataclass
class _Cursor:
    metrics: Metrics
    g: Geometry
    pages: list[Page] = field(default_factory=lambda: [[]])
    y: float = 0.0

    def __post_init__(self) -> None:
        self.y = self.top

    @property
    def top(self) -> float:
        return self.g.height - self.g.margin

    @property
    def bottom(self) -> float:
        return self.g.margin

    @property
    def width(self) -> float:
        return self.g.width - 2 * self.g.margin

    @property
    def room(self) -> float:
        return self.y - self.bottom

    @property
    def page(self) -> Page:
        return self.pages[-1]

    def clean(self, text: str, slot: str) -> str:
        return drawable(text, lambda code: self.metrics.can_draw(code, slot))

    def new_page(self) -> None:
        if self.page:
            self.pages.append([])
        self.y = self.top

    def text(self, text: str, x: float, y: float, size: float, font: str, colour: str) -> None:
        if text:
            self.page.append(Text(text, x, y, size, font, colour))

    def lines(
        self, lines: Sequence[str], size: float, font: str, colour: str, x: float | None = None
    ) -> None:
        lh = line_height(size)
        for line in lines:
            if self.room < lh:
                self.new_page()
            self.text(line, self.g.margin if x is None else x, self.y - size, size, font, colour)
            self.y -= lh

    def rule(self, y: float, thickness: float, colour: str, x1: float | None = None) -> None:
        start = self.g.margin if x1 is None else x1
        self.page.append(Line(start, y, self.g.margin + self.width, y, thickness, colour))


def chrome(header: str, classification: str, footer: str, metrics: Metrics, g: Geometry) -> Page:
    """The header and footer of a content page: the header text on the left and
    the classification on the right above a hairline, and the footer text
    right-aligned below a hairline."""
    size = SIZE_CHROME
    left, right = g.margin, g.width - g.margin
    width = right - left
    header_y = g.height - g.margin / 2 - size / 2
    footer_y = g.margin / 2 - size

    def clean(text: str) -> str:
        return drawable(text, lambda code: metrics.can_draw(code, "body"))

    ops: Page = []
    c = fit(clean(classification), width / 2, size, "body", metrics)
    room = width if not c else width - metrics.width(c, size, "body") - 12
    h = fit(clean(header), room, size, "body", metrics)
    f = fit(clean(footer), width, size, "body", metrics)
    if h:
        ops.append(Text(h, left, header_y, size, "body", "muted"))
    if c:
        ops.append(Text(c, right - metrics.width(c, size, "body"), header_y, size, "body", "muted"))
    ops.append(Line(left, header_y - 5, right, header_y - 5, 0.5, "rule"))
    ops.append(Line(left, footer_y + size + 5, right, footer_y + size + 5, 0.5, "rule"))
    if f:
        ops.append(Text(f, right - metrics.width(f, size, "body"), footer_y, size, "body", "muted"))
    return ops


def cover(content: Cover, logo: tuple[float, float] | None, metrics: Metrics, g: Geometry) -> Page:
    """The cover: logo and brand name at the top left, the title at 40% of the
    page height with an accent rule and the subtitle below it, and the
    metadata rows above the bottom margin under a hairline. A long title moves
    up, and then shrinks, so it never runs into the rows. ``logo`` is its
    width and height in points."""
    ops: Page = []
    width = g.width - 2 * g.margin
    top = g.height - g.margin

    def clean(text: str, slot: str) -> str:
        return drawable(text, lambda code: metrics.can_draw(code, slot))

    brand_bottom = top
    brand_size = 14.0
    if logo is not None:
        logo_width, logo_height = logo
        ops.append(Image(g.margin, top - logo_height, logo_width, logo_height))
        brand_bottom = top - logo_height
    if content.brand_name:
        x = g.margin + (0 if logo is None else logo[0] + 10)
        y = top - brand_size * 0.8 if logo is None else top - logo[1] / 2 - brand_size * 0.35
        ops.append(Text(clean(content.brand_name, "heading"), x, y, brand_size, "heading", "muted"))
        brand_bottom = min(brand_bottom, y - brand_size * 0.3)

    row_size = 9.0
    row_height = row_size * 1.75
    label_width = max(
        [
            28 * MM,
            *(
                metrics.width(clean(f.label, "bodyBold"), row_size, "bodyBold") + 12
                for f in content.fields
            ),
        ]
    )
    count = len(content.fields)
    block_top = g.margin + (count - 1) * row_height + row_size + 10
    ops.append(Line(g.margin, block_top, g.margin + width, block_top, 0.5, "rule"))
    for i, item in enumerate(content.fields):
        y = g.margin + (count - 1 - i) * row_height
        ops.append(Text(clean(item.label, "bodyBold"), g.margin, y, row_size, "bodyBold", "text"))
        value = clean(item.value, "body")
        lines = wrap(value, width - label_width, row_size, "body", metrics)
        shown = f"{lines[0]}…" if len(lines) > 1 else value
        ops.append(Text(shown, g.margin + label_width, y, row_size, "body", "muted"))

    subtitle_size = 13.0
    subtitle = [
        line
        for line in wrap(clean(content.subtitle, "body"), width, subtitle_size, "body", metrics)
        if line
    ] or [""]
    floor = block_top + 12 * MM
    ceiling = brand_bottom - 10 * MM

    def place(
        size: float, first_top: float
    ) -> tuple[list[str], list[float], float, list[float], float]:
        lines = wrap(clean(content.title, "heading"), width, size, "heading", metrics)
        lh = size * 1.15
        baselines = [first_top - size * 0.78 - i * lh for i in range(len(lines))]
        rule_y = baselines[-1] - size * 0.22 - 6 * MM
        sub_top = rule_y - 6 * MM
        sub_baselines = [
            sub_top - subtitle_size * 0.8 - i * line_height(subtitle_size)
            for i in range(len(subtitle))
        ]
        bottom = sub_baselines[-1] - subtitle_size * 0.25 if content.subtitle else rule_y
        return lines, baselines, rule_y, sub_baselines, bottom

    size = 30.0
    placed = place(size, g.height * 0.6)
    for size in (30.0, 26.0, 22.0, 18.0):
        placed = place(size, g.height * 0.6)
        if placed[4] < floor:
            placed = place(size, min(ceiling, g.height * 0.6 + (floor - placed[4])))
        if placed[4] >= floor:
            break
    lines, baselines, rule_y, sub_baselines, _ = placed
    for line, baseline in zip(lines, baselines, strict=True):
        ops.append(Text(line, g.margin, baseline, size, "heading", "title"))
    ops.append(Line(g.margin, rule_y, g.margin + 30 * MM, rule_y, 1.5, "accent"))
    if content.subtitle:
        for line, baseline in zip(subtitle, sub_baselines, strict=True):
            ops.append(Text(line, g.margin, baseline, subtitle_size, "body", "muted"))
    return ops


def _field_lines(cursor: _Cursor, item: Field) -> tuple[list[str], list[str], str]:
    label_width = cursor.width * LABEL
    font = "mono" if item.mono else "body"
    label = wrap(
        cursor.clean(item.label, "bodyBold"),
        label_width - PAD_X,
        SIZE_BODY,
        "bodyBold",
        cursor.metrics,
    )
    value = wrap(
        cursor.clean(item.value, font),
        cursor.width - label_width,
        _size(font),
        font,
        cursor.metrics,
    )
    return label, value, font


def _fields_height(cursor: _Cursor, fields: Sequence[Field]) -> float:
    total = 0.0
    for item in fields:
        label, value, _ = _field_lines(cursor, item)
        total += max(len(label), len(value)) * line_height(SIZE_BODY) + 2
    return total


def _fields(cursor: _Cursor, fields: Sequence[Field]) -> None:
    lh = line_height(SIZE_BODY)
    label_x = cursor.g.margin
    value_x = cursor.g.margin + cursor.width * LABEL
    for item in fields:
        label, value, font = _field_lines(cursor, item)
        rows = max(len(label), len(value))
        height = rows * lh + 2
        if cursor.room < height <= cursor.top - cursor.bottom:
            cursor.new_page()
        for i in range(rows):
            if cursor.room < lh:
                cursor.new_page()
            y = cursor.y - SIZE_BODY
            if i < len(label):
                cursor.text(label[i], label_x, y, SIZE_BODY, "bodyBold", "text")
            if i < len(value):
                cursor.text(value[i], value_x, y, _size(font), font, "text")
            cursor.y -= lh
        cursor.y -= 2


def _row(
    cursor: _Cursor,
    widths: Sequence[float],
    cells: Sequence[list[str]],
    fonts: Sequence[str],
    colour: str,
    fill: str | None,
    on_new_page: Callable[[], None],
) -> None:
    """One table row, filled or not. It moves to the next page whole, and splits
    only when it is taller than a page."""
    lh = line_height(SIZE_BODY)
    total = max(1, *(len(c) for c in cells))
    height = total * lh + 2 * PAD_Y
    if cursor.room < height <= cursor.top - cursor.bottom:
        cursor.new_page()
        on_new_page()
    start = 0
    while start < total:
        if cursor.room < lh + 2 * PAD_Y:
            cursor.new_page()
            on_new_page()
        end = min(total, start + max(1, int((cursor.room - 2 * PAD_Y) // lh)))
        chunk = (end - start) * lh + 2 * PAD_Y
        if fill is not None:
            cursor.page.append(Fill(cursor.g.margin, cursor.y - chunk, cursor.width, chunk, fill))
        x = cursor.g.margin
        for column, lines in enumerate(cells):
            for i, line in enumerate(lines[start:end]):
                y = cursor.y - PAD_Y - SIZE_BODY - i * lh + 1
                cursor.text(line, x + PAD_X, y, _size(fonts[column]), fonts[column], colour)
            x += widths[column]
        cursor.y -= chunk
        cursor.rule(cursor.y, 0.5, "rule")
        start = end


def _table(cursor: _Cursor, columns: Sequence[Column], rows: Sequence[Sequence[str]]) -> None:
    widths = [c.width * cursor.width for c in columns]
    fonts = ["mono" if c.mono else "body" for c in columns]

    def wrap_row(cells: Sequence[str], slots: Sequence[str]) -> list[list[str]]:
        return [
            wrap(
                cursor.clean(cell, slots[i]),
                widths[i] - 2 * PAD_X,
                _size(slots[i]),
                slots[i],
                cursor.metrics,
            )
            for i, cell in enumerate(cells)
        ]

    def height(cells: Sequence[list[str]]) -> float:
        return max(1, *(len(c) for c in cells)) * line_height(SIZE_BODY) + 2 * PAD_Y

    bold = ["bodyBold"] * len(columns)
    header = wrap_row([c.header for c in columns], bold)

    def draw_header() -> None:
        _row(cursor, widths, header, bold, "tableHeaderText", "tableHeader", lambda: None)

    wrapped = [wrap_row(row, fonts) for row in rows]
    # Keep the header with the first row.
    if cursor.room < height(header) + (height(wrapped[0]) if wrapped else 0):
        cursor.new_page()
    draw_header()
    for index, cells in enumerate(wrapped):
        _row(
            cursor, widths, cells, fonts, "text", "tableStripe" if index % 2 else None, draw_header
        )


def _per_role() -> float:
    """The height of one role in the signature block."""
    return line_height(SIZE_HEADING[3]) + 3 * (line_height(SIZE_BODY) + 14) + 12


def _signatures(cursor: _Cursor, roles: Sequence[str]) -> None:
    lh = line_height(SIZE_BODY)
    per_role = _per_role()
    if cursor.room < per_role * min(len(roles), 3):
        cursor.new_page()
    for role in roles:
        if cursor.room < per_role:
            cursor.new_page()
        cursor.lines([cursor.clean(role, "heading")], SIZE_HEADING[3], "heading", "heading")
        for label in ("Name", "Signature", "Date"):
            cursor.y -= 14
            cursor.text(label, cursor.g.margin, cursor.y - SIZE_BODY, SIZE_BODY, "body", "muted")
            cursor.rule(
                cursor.y - SIZE_BODY - 2, 0.6, "rule", cursor.g.margin + cursor.width * LABEL
            )
            cursor.y -= lh
        cursor.y -= 12


def _heading(cursor: _Cursor, block: Heading, after_block: Block | None) -> None:
    size = SIZE_HEADING[block.level]
    lines = wrap(cursor.clean(block.text, "heading"), cursor.width, size, "heading", cursor.metrics)
    before = {1: 0.0, 2: 16.0, 3: 9.0}[block.level]
    after = 18.0 if block.level == 1 else 4.0
    # Keep a heading with what follows: a whole field list that fits on a
    # page, a table's header row and first row, the first three roles of a
    # signature block, or two lines of anything else.
    if isinstance(after_block, Signatures):
        follow = _per_role() * min(len(after_block.roles), 3)
    elif isinstance(after_block, Fields):
        follow = min(
            _fields_height(cursor, after_block.fields),
            cursor.top - cursor.bottom - 2 * line_height(size),
        )
    elif isinstance(after_block, Table):
        follow = 2 * (line_height(SIZE_BODY) + 2 * PAD_Y)
    else:
        follow = 2 * line_height(SIZE_BODY) + 2 * PAD_Y
    if cursor.room < before + len(lines) * line_height(size) + after + follow:
        cursor.new_page()
    elif cursor.y < cursor.top:
        cursor.y -= before
    cursor.lines(lines, size, "heading", "title" if block.level == 1 else "heading")
    if block.level == 1:
        cursor.rule(cursor.y - 2, 1.0, "accent")
    cursor.y -= after


def paginate(blocks: Sequence[Block], metrics: Metrics, g: Geometry) -> list[Page]:
    """Lay out the content blocks on the pages after the cover."""
    cursor = _Cursor(metrics, g)
    for index, block in enumerate(blocks):
        following = blocks[index + 1] if index + 1 < len(blocks) else None
        if isinstance(block, Heading):
            _heading(cursor, block, following)
        elif isinstance(block, Paragraph):
            text = cursor.clean(block.text, "body")
            cursor.lines(
                wrap(text, cursor.width, SIZE_BODY, "body", metrics), SIZE_BODY, "body", "text"
            )
            cursor.y -= 4
        elif isinstance(block, Listing):
            bullet = "•" if metrics.can_draw(0x2022, "body") else "-"
            for item in block.items:
                lines = wrap(
                    cursor.clean(item, "body"), cursor.width - 12, SIZE_BODY, "body", metrics
                )
                if cursor.room < line_height(SIZE_BODY):
                    cursor.new_page()
                cursor.text(bullet, g.margin + 2, cursor.y - SIZE_BODY, SIZE_BODY, "body", "text")
                cursor.lines(lines, SIZE_BODY, "body", "text", g.margin + 12)
            cursor.y -= 4
        elif isinstance(block, Fields):
            _fields(cursor, block.fields)
            cursor.y -= 4
        elif isinstance(block, Table):
            _table(cursor, block.columns, block.rows)
            cursor.y -= 6
        elif isinstance(block, Signatures):
            _signatures(cursor, block.roles)
    return cursor.pages
