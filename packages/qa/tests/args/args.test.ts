import { describe, expect, test } from "bun:test";

import { Args } from "../../src/args";

describe("Args", () => {
  test("help, version and unknown commands", () => {
    expect(Args.parse([])).toEqual({ kind: "help" });
    expect(Args.parse(["--help"])).toEqual({ kind: "help" });
    expect(Args.parse(["-v"])).toEqual({ kind: "version" });
    expect(Args.parse(["check"])).toEqual({
      error: "unknown command check",
      kind: "usage",
    });
    expect(Args.USAGE).toContain("qa run");
  });

  test("list", () => {
    expect(Args.parse(["list"])).toEqual({ json: false, kind: "list" });
    expect(Args.parse(["list", "--json", "--config", "x/qa.yaml"])).toEqual({
      config: "x/qa.yaml",
      json: true,
      kind: "list",
    });
    expect(Args.parse(["list", "--all"])).toEqual({
      error: "qa list does not take --all",
      kind: "usage",
    });
  });

  test("run with sets, levels and flags", () => {
    expect(
      Args.parse([
        "run",
        "unit",
        "web",
        "--level",
        "IU",
        "--level",
        "unit",
        "--changed",
        "--base",
        "main",
        "--report",
        "--dry-run",
        "--out",
        "o",
        "--qualify",
        "bunx qualify",
        "--config",
        "c",
      ]),
    ).toEqual({
      base: "main",
      changed: true,
      config: "c",
      dryRun: true,
      kind: "run",
      levels: ["IU", "unit"],
      names: ["unit", "web"],
      out: "o",
      qualify: "bunx qualify",
      report: true,
    });
    expect(Args.parse(["run"])).toMatchObject({
      changed: false,
      names: [],
      out: "qa-results",
      qualify: "npx --yes @lekman/qualify@0.2.0",
    });
  });

  test("run usage errors", () => {
    expect(Args.parse(["run", "--level", "e2e"])).toMatchObject({
      kind: "usage",
    });
    expect(Args.parse(["run", "--out"])).toEqual({
      error: "--out needs a value",
      kind: "usage",
    });
    expect(Args.parse(["run", "--out", "--report"])).toEqual({
      error: "--out needs a value",
      kind: "usage",
    });
    expect(Args.parse(["run", "--base", "main"])).toEqual({
      error: "--base needs --changed",
      kind: "usage",
    });
    expect(Args.parse(["run", "--fast"])).toEqual({
      error: "qa run does not take --fast",
      kind: "usage",
    });
  });
});
