import Ajv2020 from "ajv/dist/2020";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PackageRoots } from "../../src/packages";
import { CommandLines, RunnerDefinitions } from "../../src/runners";

const DIR = join(import.meta.dir, "../../runners");
const tests = [
  { className: "BankFileTest", id: "OQ-EXPORT-003", method: "keepsAmounts" },
  { id: "OQ-EXPORT-004" },
];

const filterOf = (id: string, platform = "linux"): string =>
  CommandLines.filter(
    (
      RunnerDefinitions.byId(id) as NonNullable<
        ReturnType<typeof RunnerDefinitions.byId>
      >
    ).select,
    tests,
    platform,
  );

describe("runner definitions", () => {
  test("every file in runners/ follows the schema and is loaded", () => {
    const schema = JSON.parse(
      readFileSync(join(DIR, "runner.schema.json"), "utf8"),
    );
    const validate = new Ajv2020({ allErrors: true }).compile(schema);
    const files = readdirSync(DIR).filter(
      (f) => f.endsWith(".json") && f !== "runner.schema.json",
    );
    for (const file of files) {
      const definition = JSON.parse(readFileSync(join(DIR, file), "utf8"));
      expect({
        file,
        errors: validate(definition) ? null : validate.errors,
      }).toEqual({ file, errors: null });
      expect(RunnerDefinitions.byId(definition.id)).toBeDefined();
    }
    expect(RunnerDefinitions.ALL).toHaveLength(files.length);
  });

  test("picks Maven over Gradle by the package's build file", () => {
    expect(RunnerDefinitions.forFramework("junit", ["pom.xml"]).id).toBe(
      "maven",
    );
    expect(
      RunnerDefinitions.forFramework("junit", ["build.gradle.kts"]).id,
    ).toBe("gradle");
    expect(RunnerDefinitions.forFramework("junit", []).id).toBe("gradle");
    expect(
      RunnerDefinitions.forFramework("cucumber", ["package.json"]).id,
    ).toBe("cucumber-js");
  });

  test("lists the tool files and the source globs", () => {
    expect(RunnerDefinitions.toolFiles()).toContain("gradlew");
    expect(RunnerDefinitions.sourceGlobs()).toContain("**/*.feature");
  });
});

describe("CommandLines.filter", () => {
  test("each runner selects by ID with its own filter", () => {
    expect(filterOf("vitest")).toBe(
      `-t '\\[OQ-EXPORT-003\\]|\\[OQ-EXPORT-004\\]'`,
    );
    expect(filterOf("node-test")).toBe(
      `--test-name-pattern='\\[OQ-EXPORT-003\\]|\\[OQ-EXPORT-004\\]'`,
    );
    expect(filterOf("bun-test")).toBe(
      `-t '\\[OQ-EXPORT-003\\]|\\[OQ-EXPORT-004\\]'`,
    );
    expect(filterOf("pytest")).toBe(`-k 'OQ-EXPORT-003 or OQ-EXPORT-004'`);
    expect(filterOf("gradle")).toBe(
      `--tests '*BankFileTest.keepsAmounts' --tests '**.*'`,
    );
    expect(filterOf("maven")).toBe(`-Dtest='BankFileTest#keepsAmounts,*#*'`);
    expect(filterOf("dotnet")).toBe(
      `--filter 'DisplayName~OQ-EXPORT-003|DisplayName~OQ-EXPORT-004'`,
    );
    expect(filterOf("cucumber-js")).toBe(
      `--name '^OQ-EXPORT-003\\b' --name '^OQ-EXPORT-004\\b'`,
    );
  });

  test("quotes for the Windows shell", () => {
    expect(filterOf("pytest", "win32")).toBe(
      `-k "OQ-EXPORT-003 or OQ-EXPORT-004"`,
    );
    expect(CommandLines.quote(`a"b`, "win32")).toBe(`"a""b"`);
    expect(CommandLines.quote("a'b", "linux")).toBe(`'a'\\''b'`);
  });

  test("leaves terms unquoted when the definition says so", () => {
    expect(
      CommandLines.filter(
        {
          argument: "--x ${term}",
          join: "",
          quote: "none",
          repeat: true,
          term: "${id}",
        },
        tests,
        "linux",
      ),
    ).toBe("--x OQ-EXPORT-003 --x OQ-EXPORT-004");
    expect(
      CommandLines.filter(
        { argument: "${terms}", join: ",", quote: "each", term: "${id}" },
        tests,
        "linux",
      ),
    ).toBe("'OQ-EXPORT-003','OQ-EXPORT-004'");
  });

  test("fill leaves unknown placeholders", () => {
    expect(CommandLines.fill("a ${x} ${y}", { x: "1" })).toBe("a 1 ${y}");
  });
});

describe("CommandLines.tool", () => {
  const index = PackageRoots.index([
    "/ws/gradlew",
    "/ws/svc/build.gradle.kts",
    "/ws/web/bun.lock",
    "/ws/web/package.json",
  ]);
  const of = (id: string, root: string): string =>
    CommandLines.tool(
      RunnerDefinitions.byId(id) as NonNullable<
        ReturnType<typeof RunnerDefinitions.byId>
      >,
      root,
      "/ws",
      index,
    );

  test("finds the wrapper or lockfile at or above the package", () => {
    expect(of("gradle", "/ws/svc")).toBe("../gradlew");
    expect(of("gradle", "/ws")).toBe("./gradlew");
    expect(of("vitest", "/ws/web")).toBe("bunx");
    expect(of("vitest", "/ws/svc")).toBe("npx");
    expect(of("maven", "/ws/svc")).toBe("mvn");
    expect(of("dotnet", "/ws/svc")).toBe("");
  });
});
