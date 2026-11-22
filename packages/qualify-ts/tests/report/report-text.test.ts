import { describe, expect, test } from "bun:test";

import { ReportText } from "../../src/report";

describe("ReportText", () => {
  test("drawable replaces what the font cannot draw", () => {
    const latin = (code: number): boolean => code < 0x250;
    expect(ReportText.drawable("a\tb\r\nc\u0001d 入 é", latin)).toBe(
      "a b\nc?d ? é",
    );
    expect(ReportText.drawable("\u0085", () => true)).toBe("?");
  });

  test("compact JSON, cut after 200 code points", () => {
    expect(ReportText.json({ b: 1, a: [true, null] })).toBe(
      '{"a":[true,null],"b":1}',
    );
    const long = ReportText.json("x".repeat(300));
    expect(long).toBe(`"${"x".repeat(199)}… (102 more characters)`);
    expect(ReportText.json("😀".repeat(198))).toBe(`"${"😀".repeat(198)}"`);
  });

  test("times, lists and verdicts", () => {
    expect(ReportText.time("2026-01-02T03:04:05.006Z")).toBe(
      "2026-01-02 03:04:05 UTC",
    );
    expect(ReportText.time(new Date(Date.UTC(2026, 0, 2)))).toBe(
      "2026-01-02 00:00:00 UTC",
    );
    expect(ReportText.list([])).toBe("-");
    expect(ReportText.list(["a", "b"])).toBe("a, b");
    expect([
      ReportText.verdict("pass"),
      ReportText.verdict("fail"),
      ReportText.verdict("incomplete"),
    ]).toEqual(["Passed", "Failed", "Incomplete"]);
  });
});
