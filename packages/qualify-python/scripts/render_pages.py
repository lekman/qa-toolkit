"""Render the first pages of a PDF to PNG images, for the README and for
looking at a report. A development tool: pypdfium2 is a dev dependency.

    uv run python scripts/render_pages.py report.pdf docs/report-lekman --pages 3
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

import pypdfium2 as pdfium  # type: ignore[import-untyped]


def main(argv: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    parser.add_argument("pdf")
    parser.add_argument("prefix", help="written as <prefix>-page-<n>.png")
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--scale", type=float, default=1.5, help="pixels per point")
    options = parser.parse_args(argv)
    document = pdfium.PdfDocument(options.pdf)
    for index in range(min(options.pages, len(document))):
        image = document[index].render(scale=options.scale).to_pil()
        path = f"{options.prefix}-page-{index + 1}.png"
        image.save(path, optimize=True)
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
