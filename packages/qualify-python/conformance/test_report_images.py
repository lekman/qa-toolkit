"""Scenario 23, report-images: PNG and JPEG attachments that the report draws,
bytes that are not an image, and a text file.

The image files are part of the specification, in
spec/qualify/conformance/fixtures/images/.
"""

from pathlib import Path

import qualify

IMAGES = next(
    parent / "spec/qualify/conformance/fixtures/images"
    for parent in Path(__file__).resolve().parents
    if (parent / "spec/qualify/conformance").is_dir()
)


def image(name: str) -> bytes:
    return (IMAGES / name).read_bytes()


@qualify.oq(
    "OQ-CONF-024",
    "report-images test",
    given="a conformance fixture",
    when="the scenario runs",
    then="the evidence matches the expected file",
    scope="read",
)
def test_report_images(ctx: qualify.Context) -> None:
    ctx.attach("screen.png", image("screen.png"), "image/png")
    ctx.attach("tall.jpg", image("tall.jpg"), "image/jpeg")
    ctx.attach("broken.png", b"not an image", "image/png")
    ctx.attach("icon.png", image("icon.png"), "image/png")
    ctx.attach("note.txt", "hello\n", "text/plain")
    ctx.check("fixture", "one equals one").that(1).equals(1)
