from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from qualify import theme as themes

REPO = Path(__file__).resolve().parents[3]
SPEC = REPO / "spec" / "qualify"


def bundled_files(root: Path) -> dict[str, bytes]:
    return {
        str(p.relative_to(root)): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()
    }


@pytest.mark.skipif(not SPEC.is_dir(), reason="needs the repository's spec folder")
def test_the_bundled_themes_equal_the_specification_byte_for_byte() -> None:
    assert bundled_files(themes.bundled_dir()) == bundled_files(SPEC / "report" / "themes")
    packaged = Path(themes.__file__).parent / "schemas" / "report-theme.schema.json"
    assert packaged.read_bytes() == (SPEC / "report-theme.schema.json").read_bytes()


def test_bundled_themes_load_by_name() -> None:
    lekman = themes.load("lekman")
    assert lekman.logo is not None
    assert lekman.logo.name == "logo.png"
    assert lekman.fonts["body"].name == "Geist-Regular.ttf"
    plain = themes.load("plain")
    assert plain.logo is None
    assert plain.fonts["heading"] == plain.fonts["bodyBold"]
    assert plain.texts["classification"] == ""
    assert plain.colours["text"] == "#1f1f1f"


@pytest.mark.parametrize(
    ("template", "expected"),
    [
        ("{title} {{literal}} x", "T {literal} x"),
        ("}}{{", "}{"),
        ("plain", "plain"),
        ("{page}/{pages}", "2/9"),
        ("{missing}", ""),
    ],
)
def test_render(template: str, expected: str) -> None:
    assert themes.render(template, {"title": "T", "page": "2", "pages": "9"}) == expected


@pytest.mark.parametrize(
    ("texts", "message"),
    [
        ({"footer": "{nope}"}, r"texts.footer uses \{nope\}"),
        ({"title": "{title}"}, r"texts.title uses \{title\}"),
        ({"subtitle": "{page}"}, r"texts.subtitle uses \{page\}"),
        ({"header": "{open"}, r'a "\{" is not closed'),
        ({"header": "close}"}, r'a "\}" has no "\{"'),
    ],
)
def test_validate_texts(texts: dict[str, str], message: str) -> None:
    with pytest.raises(themes.ThemeError, match=message):
        themes.validate_texts(texts, "theme.json")


def copy_plain(tmp_path: Path) -> Path:
    folder = tmp_path / "mine"
    shutil.copytree(themes.bundled_dir() / "plain", folder)
    return folder / "theme.json"


def edit(path: Path, **changes: object) -> None:
    data = json.loads(path.read_text())
    for dotted, value in changes.items():
        target = data
        *parents, last = dotted.split("__")
        for name in parents:
            target = target[name]
        target[last] = value
    path.write_text(json.dumps(data))


def test_a_theme_file_by_path(tmp_path: Path) -> None:
    copy_plain(tmp_path)
    assert themes.load("mine/theme.json", tmp_path).spec["name"] == "plain"


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"page__size": "A3"}, "'A3' is not one of"),
        ({"texts__footer": "{nope}"}, r"\{nope\}"),
        ({"fonts__mono": "fonts/none.ttf"}, "fonts.mono .* cannot be read"),
        ({"fonts__mono": "fonts/OFL.ttf"}, "cannot be read"),
        ({"brand__logo": "missing.png"}, "brand.logo .* cannot be read"),
    ],
)
def test_invalid_themes(tmp_path: Path, changes: dict[str, object], message: str) -> None:
    path = copy_plain(tmp_path)
    edit(path, **changes)
    with pytest.raises(themes.ThemeError, match=message):
        themes.load(str(path))


def test_files_that_are_not_fonts_or_images(tmp_path: Path) -> None:
    path = copy_plain(tmp_path)
    (path.parent / "fonts" / "fake.ttf").write_bytes(b"not a font at all")
    edit(path, fonts__body="fonts/fake.ttf")
    with pytest.raises(themes.ThemeError, match="is not a TrueType or OpenType font"):
        themes.load(str(path))
    variable = bytearray((path.parent / "fonts" / "NotoSans-Regular.ttf").read_bytes()[:12])
    variable[4:6] = (1).to_bytes(2, "big")
    (path.parent / "fonts" / "fake.ttf").write_bytes(bytes(variable) + b"fvar" + bytes(12))
    with pytest.raises(themes.ThemeError, match="variable font"):
        themes.load(str(path))
    edit(path, fonts__body="fonts/NotoSans-Regular.ttf", brand__logo="fake.png")
    (path.parent / "fake.png").write_bytes(b"GIF89a")
    with pytest.raises(themes.ThemeError, match="not a PNG or JPEG"):
        themes.load(str(path))


def test_unreadable_and_invalid_json(tmp_path: Path) -> None:
    with pytest.raises(themes.ThemeError, match="cannot be read"):
        themes.load("nothing.json", tmp_path)
    (tmp_path / "bad.json").write_text("{")
    with pytest.raises(themes.ThemeError, match="not valid JSON"):
        themes.load("bad.json", tmp_path)
