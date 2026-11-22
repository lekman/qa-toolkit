import { describe, expect, test } from "bun:test";

import { RunnerDefinitions } from "../../src/runners";
import { Settings } from "../../src/settings";

const vitest = RunnerDefinitions.byId("vitest") as NonNullable<
  ReturnType<typeof RunnerDefinitions.byId>
>;

describe("Settings", () => {
  test("defaults when nothing is set or a value has the wrong type", () => {
    expect(Settings.from({})).toEqual(Settings.DEFAULTS);
    expect(
      Settings.from({
        evidenceDir: 3,
        exclude: "x",
        packages: [],
        runners: null,
        traceFiles: "",
      }),
    ).toEqual(Settings.DEFAULTS);
  });

  test("normalises package keys and drops empty values", () => {
    const s = Settings.from({
      packages: {
        "./": { command: "a" },
        "./apps/web/": {
          command: "task test:intended-use -- ${ids}",
          evidenceDir: "test-results/evidence",
        },
        "libs\\py": {
          command: " ",
          runners: { pytest: "uv run pytest ${filter}", vitest: 1 },
        },
        broken: "x",
      },
      runners: { vitest: "pnpm vitest run ${filter}" },
    });
    expect(s.packages).toEqual({
      ".": { command: "a" },
      "apps/web": {
        command: "task test:intended-use -- ${ids}",
        evidenceDir: "test-results/evidence",
      },
      "libs/py": { runners: { pytest: "uv run pytest ${filter}" } },
    });
  });

  test("the command, most specific first", () => {
    const s = Settings.from({
      packages: {
        a: { command: "package", runners: { vitest: "package-runner" } },
        b: { command: "package" },
      },
      runners: { vitest: "runner" },
    });
    expect(Settings.command(s, "a", vitest)).toBe("package-runner");
    expect(Settings.command(s, "b", vitest)).toBe("package");
    expect(Settings.command(s, "c", vitest)).toBe("runner");
    expect(Settings.command(Settings.from({}), "c", vitest)).toBe(
      vitest.command,
    );
  });

  test("the evidence folder of a package", () => {
    const s = Settings.from({
      evidenceDir: "out/evidence",
      packages: { web: { evidenceDir: "e" } },
    });
    expect(Settings.evidenceDir(s, "web")).toBe("e");
    expect(Settings.evidenceDir(s, "api")).toBe("out/evidence");
  });
});
