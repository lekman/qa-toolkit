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

  test("a user's exclude globs add to the built-in ones, and a ! glob takes one out", () => {
    const s = Settings.from({
      exclude: ["qa-toolkit/**", "!**/conformance/**", " ", 3],
    });
    expect(s.exclude).toContain("**/node_modules/**");
    expect(s.exclude).toContain("**/fixtures/**");
    expect(s.exclude).toContain("qa-toolkit/**");
    expect(s.exclude).not.toContain("**/conformance/**");
    expect(s.exclude).not.toContain("!**/conformance/**");
    expect(Settings.from({ exclude: [] }).exclude).toEqual([
      ...Settings.EXCLUDE,
    ]);
  });

  test("the built-in globs skip a toolkit's conformance scenarios and fixtures", () => {
    for (const glob of [
      "**/conformance/**",
      "**/fixture/**",
      "**/fixtures/**",
      "**/test-host/**",
    ]) {
      expect(Settings.DEFAULTS.exclude).toContain(glob);
    }
  });

  test("enabled and gitIgnore are on unless set to false", () => {
    expect(Settings.DEFAULTS.enabled).toBe(true);
    expect(Settings.DEFAULTS.gitIgnore).toBe(true);
    const off = Settings.from({ enabled: false, gitIgnore: false });
    expect(off.enabled).toBe(false);
    expect(off.gitIgnore).toBe(false);
    expect(Settings.from({ enabled: "no" }).enabled).toBe(true);
  });

  test("every setting is read per folder, so a folder's own settings apply in a multi-root workspace", async () => {
    const manifest = (await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json()) as {
      contributes: {
        configuration: { properties: Record<string, { scope?: string }> };
      };
    };
    const properties = manifest.contributes.configuration.properties;
    expect(Object.keys(properties).length).toBeGreaterThan(0);
    for (const [name, property] of Object.entries(properties)) {
      expect(`${name}: ${property.scope}`).toBe(`${name}: resource`);
    }
  });
});
