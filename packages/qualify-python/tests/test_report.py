from __future__ import annotations

import datetime as dt
import io
import json
from pathlib import Path
from typing import Any

import pytest
from pypdf import PdfReader

from helpers import record
from qualify import cli
from qualify import theme as themes
from qualify.report import content, layout
from qualify.trace import build as trace_build

NOW = dt.datetime(2026, 1, 2, 3, 4, 5, 6000, tzinfo=dt.timezone.utc)


class Fixed:
    """Every character is 5 points wide at any size; ``~`` cannot be drawn."""

    def width(self, text: str, size: float, slot: str) -> float:
        return 5.0 * len(text)

    def can_draw(self, code: int, slot: str) -> bool:
        return chr(code) != "~"


def call(*args: str, cwd: Path, env: dict[str, str] | None = None) -> tuple[int, str]:
    out, err = io.StringIO(), io.StringIO()
    environment = {"QUALIFY_REPORT_TIME": "2026-01-02T03:04:05.006Z", **(env or {})}
    code = cli.run(
        list(args), cli.IO(env=environment, cwd=lambda: str(cwd), stdout=out, stderr=err)
    )
    return code, out.getvalue() + err.getvalue()


def run_file(tmp_path: Path) -> Path:
    recorder = record(tmp_path / "ev", "OQ-AREA-001", finish=False)
    ctx = recorder.context
    ctx.check("value", "a long value").that("x" * 300).equals("x" * 300)
    ctx.check("value", "soft").soft().that(1).equals(2)
    ctx.attach("note.txt", "hello", "text/plain")
    recorder.finish(None)
    record(tmp_path / "ev", "IQ-AREA-002", line=2, error=RuntimeError("boom"))
    assert call("merge", "--evidence-dir", "ev", cwd=tmp_path)[0] == 1
    return tmp_path / "ev" / "test-evidence.json"


def text_of(pdf: Path) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(str(pdf)).pages)


def test_report_with_flags_and_the_environment_theme(tmp_path: Path) -> None:
    source = run_file(tmp_path)
    (tmp_path / "map.yaml").write_text("OQ-AREA-001: [REQ-7]\n")
    code, output = call(
        "report",
        str(source),
        "--pdf",
        "out.pdf",
        "--map",
        "map.yaml",
        "--subtitle",
        "A subtitle ~ with a character the font has not",
        "--signatures",
        "Author;Checker",
        cwd=tmp_path,
        env={"QUALIFY_REPORT_THEME": "plain"},
    )
    assert code == 0, output
    assert "with theme plain; run verdict fail" in output
    text = text_of(tmp_path / "out.pdf")
    assert "Qualification report" in text
    assert "REQ-7 (map)" in text
    flat = " ".join(text.split())
    assert "…" in flat
    assert "(102 more characters)" in flat.replace("- ", "")
    assert "Fail (soft)" in text
    assert "note.txt" in text
    assert "Author" in text
    assert "Checker" in text
    assert "Prepared by" not in text
    assert "QR-local-" in text


@pytest.mark.parametrize(
    ("args", "message"),
    [
        (["report"], "exactly one run file"),
        (["report", "a.json"], "needs --pdf"),
        (
            ["report", "a.json", "--pdf", "x", "--signatures", "A", "--no-signatures"],
            "exclude each other",
        ),
        (["report", "a.json", "--pdf", "x", "--signatures", " ; "], "names no role"),
        (["report", "a.json", "--pdf", "x", "--title", " "], "--title must not be empty"),
        (["report", "a.json", "--pdf", "x", "--nope"], "unrecognized arguments"),
    ],
)
def test_usage_errors(tmp_path: Path, args: list[str], message: str) -> None:
    code, output = call(*args, cwd=tmp_path)
    assert code == 64
    assert message in output


def test_input_errors(tmp_path: Path) -> None:
    source = run_file(tmp_path)
    record_file = next((tmp_path / "ev" / "records").glob("*.json"))
    (tmp_path / "bad.yaml").write_text("tests: [")
    cases: list[tuple[list[str], dict[str, str], str]] = [
        ([str(source), "--theme", "nowhere.json"], {}, "cannot be read"),
        ([str(record_file)], {}, "expected a run file"),
        ([str(source), "--protocol", "bad.yaml"], {}, "not valid YAML"),
        ([str(source)], {"QUALIFY_REPORT_TIME": "yesterday"}, "QUALIFY_REPORT_TIME must be"),
        (["missing.json"], {}, "cannot read missing.json"),
    ]
    for args, env, message in cases:
        code, output = call("report", *args, "--pdf", "x.pdf", cwd=tmp_path, env=env)
        assert code == 2, args
        assert message in output
    (tmp_path / "broken.json").write_text("{")
    assert "not valid JSON" in call("report", "broken.json", "--pdf", "x.pdf", cwd=tmp_path)[1]
    assert not (tmp_path / "x.pdf").exists()


def test_levels_and_values() -> None:
    assert content.levels_text([]) == "-"
    assert content.levels_text([{"level": "PQ"}]) == "PQ"
    assert content.levels_text([{"level": lv} for lv in ("IU", "IQ", "OQ")]) == "IQ, OQ and IU"
    assert content.json_text({"b": [1, 2.5], "a": None}) == '{"a":null,"b":[1,2.5]}'
    assert content.time_text("2026-01-02T03:04:05.006Z") == "2026-01-02 03:04:05 UTC"
    assert content.verdict_text("incomplete") == "Incomplete"
    assert content.missing("") == "-"


def sample_run() -> dict[str, Any]:
    return {
        "run": {
            "id": "01HQA1ZQJ0C0NF0RMANCE00000",
            "environment": "prod",
            "startedAt": "2026-01-02T03:04:05.006Z",
            "endedAt": "2026-01-02T03:04:05.006Z",
            "target": {"version": "1.2.3"},
            "source": {"commit": "a" * 40, "branch": None},
            "tool": {"name": "t", "version": "1"},
            "policy": {"overrides": [{"id": "OQ-AREA-001", "reason": "needed"}]},
            "mergedRuns": ["01HQA1ZQJ0C0NF0RMANCE00001"],
        },
        "summary": {
            "total": 0,
            "pass": 0,
            "fail": 0,
            "error": 0,
            "skip": 0,
            "verdict": "incomplete",
        },
        "tests": [],
    }


def test_tokens_cover_and_flags() -> None:
    spec = themes.load("lekman").spec
    run = sample_run()
    document = content.build(
        run,
        "f" * 64,
        trace_build(run),
        spec,
        content.Options(generated_at=NOW, classification="", signatures=()),
        "lekman-qualify 0",
    )
    assert document.tokens["documentId"] == "QR-prod-20260102"
    assert document.tokens["version"] == "1.2.3"
    assert document.tokens["levels"] == "-"
    assert document.cover.subtitle == "- qualification, prod environment, 2026-01-02"
    assert [f.label for f in document.cover.fields][-1] == "Version"
    assert not any(isinstance(b, content.Signatures) for b in document.blocks)
    details = next(b for b in document.blocks if isinstance(b, content.Fields))
    values = {f.label: f.value for f in details.fields}
    assert values["Merged runs"] == "01HQA1ZQJ0C0NF0RMANCE00001"
    assert values["Write overrides"] == "OQ-AREA-001: needed"
    assert values["Branch"] == "-"


def test_wrap_fit_and_drawable() -> None:
    metrics = Fixed()
    assert layout.wrap("aa bb cc", 25, 9, "body", metrics) == ["aa bb", "cc"]
    assert layout.wrap("abcdefgh", 15, 9, "body", metrics) == ["abc", "def", "gh"]
    assert layout.wrap("a\nb", 100, 9, "body", metrics) == ["a", "b"]
    assert layout.fit("abcdef", 20, 9, "body", metrics) == "abc…"
    assert layout.fit("abc", 20, 9, "body", metrics) == "abc"
    assert layout.fit("abc", 2, 9, "body", metrics) == ""
    assert layout.drawable("a~b\tc\x01\r\nd", lambda code: chr(code) != "~") == "a?b c?\nd"


GEOMETRY = layout.Geometry(400, 300, 20)


def texts(page: layout.Page) -> list[str]:
    return [op.text for op in page if isinstance(op, layout.Text)]


def test_a_long_table_repeats_its_header_and_splits_a_tall_row() -> None:
    columns = (content.Column("Head", 0.5), content.Column("Mono", 0.5, mono=True))
    rows = (*((f"row {i}", "v") for i in range(30)), ("tall " * 400, "v"))
    pages = layout.paginate([content.Table(columns, rows)], Fixed(), GEOMETRY)
    assert len(pages) > 3
    for page in pages[:-1]:
        assert texts(page)[0] == "Head"
    assert any(isinstance(op, layout.Fill) and op.colour == "tableStripe" for op in pages[0])


def test_headings_lists_and_signatures_move_to_a_new_page_when_needed() -> None:
    blocks: list[content.Block] = [
        content.Paragraph("x " * 300),
        content.Heading(2, "Kept with its fields"),
        content.Fields((content.Field("Label", "value", mono=True),) * 3),
        content.Listing(("one", "two")),
        content.Signatures(("A", "B", "C", "D")),
    ]
    pages = layout.paginate(blocks, Fixed(), GEOMETRY)
    assert len(pages) >= 3
    heading_page = next(p for p in pages if "Kept with its fields" in texts(p))
    assert "Label" in texts(heading_page)


def test_the_cover_shrinks_a_long_title_and_cuts_long_rows() -> None:
    cover = content.Cover(
        "Brand",
        "word " * 60,
        "",
        (content.Field("Long", "v " * 200),),
    )
    ops = layout.cover(cover, (40.0, 20.0), Fixed(), GEOMETRY)
    sizes = {op.size for op in ops if isinstance(op, layout.Text) and op.colour == "title"}
    assert len(sizes) == 1
    assert sizes.pop() < 30
    assert any(isinstance(op, layout.Image) for op in ops)
    assert any(op.text.endswith("…") for op in ops if isinstance(op, layout.Text))


def test_chrome_cuts_text_that_does_not_fit() -> None:
    ops = layout.chrome("h" * 200, "c" * 200, "f" * 200, Fixed(), GEOMETRY)
    shown = texts(ops)
    assert all(text.endswith("…") for text in shown)
    assert len(layout.chrome("", "", "", Fixed(), GEOMETRY)) == 2


def test_report_json_round_trips_through_the_cli(tmp_path: Path) -> None:
    source = run_file(tmp_path)
    data = json.loads(source.read_text())
    assert data["summary"]["verdict"] == "fail"
