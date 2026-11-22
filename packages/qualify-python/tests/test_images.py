from __future__ import annotations

import hashlib
import io
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import DictionaryObject, NumberObject

from helpers import record
from qualify import cli
from qualify.report import content, layout
from qualify.report import images as pictures
from qualify.report.images import ImageSource
from qualify.report.pdf import image_size

FIXTURES = next(
    parent / "spec/qualify/conformance/fixtures/images"
    for parent in Path(__file__).resolve().parents
    if (parent / "spec/qualify/conformance").is_dir()
)


class Fixed:
    """Every character is half the font size wide; anything can be drawn."""

    def width(self, text: str, size: float, slot: str) -> float:
        return len(text) * size * 0.5

    def can_draw(self, code: int, slot: str) -> bool:
        return True


# A4 with 20 mm margins: the text box is 481.9 by 728.5 points.
A4 = layout.Geometry(595.28, 841.89, 20 * layout.MM)


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def attachment(filename: str, content_type: str, data: bytes) -> dict[str, object]:
    return {
        "filename": filename,
        "contentType": content_type,
        "sizeBytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def picture(image: int) -> content.Picture:
    return content.Picture(image, f"image {image}", f"image {image} could not be read")


def test_only_png_and_jpeg_are_drawn() -> None:
    assert pictures.image_format("image/png") == "png"
    assert pictures.image_format("image/jpeg") == "jpeg"
    for other in ("image/jpg", "IMAGE/PNG", "image/gif", "text/plain"):
        assert pictures.image_format(other) is None


def test_signatures() -> None:
    assert pictures.signed(fixture("screen.png"), "png")
    assert pictures.signed(fixture("tall.jpg"), "jpeg")
    assert not pictures.signed(fixture("tall.jpg"), "png")
    assert not pictures.signed(fixture("screen.png"), "jpeg")
    assert not pictures.signed(b"\xff\xd8", "jpeg")


def test_fit_scales_down_keeps_the_ratio_and_never_scales_up() -> None:
    box = (481.9, 364.25)
    wide = pictures.fit((1280, 720), box)
    assert round(wide[0], 1) == 481.9
    assert round(wide[1], 1) == 271.1
    tall = pictures.fit((200, 600), box)
    assert round(tall[0], 1) == 121.4
    assert round(tall[1], 2) == 364.25
    assert pictures.fit((48, 48), box) == (48, 48)


def test_caption_and_unreadable_line() -> None:
    screen = attachment("screen.png", "image/png", fixture("screen.png"))
    assert pictures.caption(screen) == (
        f"screen.png, {screen['sizeBytes']} bytes, SHA-256 {str(screen['sha256'])[:12]}"
    )
    broken = attachment("broken.png", "image/png", b"not an image")
    assert pictures.unreadable(broken) == (
        "broken.png could not be read as image/png, so it is not drawn."
    )


def test_image_size_reads_pixels_or_returns_none() -> None:
    assert image_size(ImageSource(fixture("screen.png"), "png")) == (960, 540)
    assert image_size(ImageSource(fixture("tall.jpg"), "jpeg")) == (200, 600)
    assert image_size(ImageSource(b"not an image", "png")) is None
    assert image_size(ImageSource(fixture("screen.png")[:40], "png")) is None
    # A JPEG signature on bytes Pillow reads as another format.
    assert image_size(ImageSource(b"\xff\xd8\xff" + fixture("screen.png"), "jpeg")) is None


def test_an_image_is_fitted_framed_and_captioned() -> None:
    [page] = layout.paginate([picture(0)], Fixed(), A4, [(1280, 720)])
    [image] = [op for op in page if isinstance(op, layout.Image)]
    assert image.image == 0
    assert round(image.x, 2) == 56.69
    assert round(image.width, 1) == 481.9
    assert round(image.height, 1) == 271.1
    frame = [op for op in page if isinstance(op, layout.Line)]
    assert len(frame) == 4
    assert all(line.colour == "rule" and line.thickness == 0.5 for line in frame)
    [caption] = [op for op in page if isinstance(op, layout.Text)]
    assert (caption.text, caption.colour, caption.size, caption.font) == (
        "image 0",
        "muted",
        8.5,
        "body",
    )
    assert caption.y < image.y


def test_an_unreadable_image_becomes_its_line() -> None:
    [page] = layout.paginate([picture(0)], Fixed(), A4, [None])
    assert not any(isinstance(op, layout.Image) for op in page)
    [text] = [op for op in page if isinstance(op, layout.Text)]
    assert (text.text, text.colour, text.size) == ("image 0 could not be read", "text", 9.0)


def test_an_image_and_its_caption_move_to_the_next_page_together() -> None:
    sizes: list[tuple[float, float] | None] = [(200, 300)] * 3
    pages = layout.paginate([picture(0), picture(1), picture(2)], Fixed(), A4, sizes)
    assert len(pages) == 2
    assert [op.image for op in pages[1] if isinstance(op, layout.Image)] == [2]
    assert [op.text for op in pages[1] if isinstance(op, layout.Text)] == ["image 2"]


def placed_images(pdf: Path) -> list[tuple[int, int]]:
    """The pixel sizes of the image XObjects the pages after the cover place."""
    seen: dict[int, tuple[int, int]] = {}
    for page in PdfReader(str(pdf)).pages[1:]:
        resources = page.get("/Resources")
        xobjects = resources.get_object().get("/XObject") if resources else None
        if xobjects is None:
            continue
        for reference in xobjects.get_object().values():
            image = reference.get_object()
            assert isinstance(image, DictionaryObject)
            if image.get("/Subtype") == "/Image":
                width, height = image["/Width"], image["/Height"]
                assert isinstance(width, NumberObject)
                assert isinstance(height, NumberObject)
                seen[reference.idnum] = (int(width), int(height))
    return sorted(seen.values())


def test_the_report_draws_png_and_jpeg_and_lists_the_unreadable_one(tmp_path: Path) -> None:
    recorder = record(tmp_path / "ev", "OQ-AREA-001", finish=False)
    ctx = recorder.context
    ctx.attach("screen.png", fixture("screen.png"), "image/png")
    ctx.attach("tall.jpg", fixture("tall.jpg"), "image/jpeg")
    ctx.attach("broken.png", b"not an image", "image/png")
    ctx.attach("icon.png", fixture("icon.png"), "image/png")
    ctx.attach("note.txt", "hello\n", "text/plain")
    ctx.check("fixture", "one equals one").that(1).equals(1)
    recorder.finish(None)
    out, err = io.StringIO(), io.StringIO()
    env = {"QUALIFY_REPORT_TIME": "2026-01-02T03:04:05.006Z"}

    def run(*args: str) -> int:
        io_ = cli.IO(env=env, cwd=lambda: str(tmp_path), stdout=out, stderr=err)
        return cli.run(list(args), io_)

    assert run("merge", "--evidence-dir", "ev") == 0
    assert run("report", "ev/test-evidence.json", "--pdf", "r.pdf", "--theme", "plain") == 0
    text = "\n".join(page.extract_text() for page in PdfReader(str(tmp_path / "r.pdf")).pages)
    screen = hashlib.sha256(fixture("screen.png")).hexdigest()[:12]
    assert f"screen.png, {len(fixture('screen.png'))} bytes, SHA-256 {screen}" in text
    assert "broken.png could not be read as image/png, so it is not drawn." in text
    assert "note.txt," not in text
    assert placed_images(tmp_path / "r.pdf") == [(48, 48), (200, 600), (960, 540)]
