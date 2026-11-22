import Ajv2020 from "ajv/dist/2020";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { RunnerDefinitions } from "../../src";

const DIR = join(import.meta.dir, "../../runners");

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
        errors: validate(definition) ? null : validate.errors,
        file,
      }).toEqual({ errors: null, file });
      expect(file).toBe(`${definition.id}.json`);
      expect(RunnerDefinitions.byId(definition.id)).toBeDefined();
    }
    expect(RunnerDefinitions.ALL).toHaveLength(files.length);
  });

  test("covers the nine runners", () => {
    expect(RunnerDefinitions.ALL.map((d) => d.id).sort()).toEqual([
      "bun-test",
      "cucumber-js",
      "dotnet",
      "gradle",
      "maven",
      "node-test",
      "playwright",
      "pytest",
      "storybook",
      "vitest",
    ]);
  });

  test("every runner says how it writes JUnit XML, through ${junitFile} or a fixed place", () => {
    for (const d of RunnerDefinitions.ALL) {
      const named = `${d.junit.args ?? ""} ${Object.values(d.junit.env ?? {}).join(" ")}`;
      const fixed =
        d.junit.file.includes("*") || Object.keys(d.junit.env ?? {}).length > 0;
      expect({
        id: d.id,
        ok:
          named.includes("${junitFile}") ||
          named.includes("${junitDir}") ||
          fixed,
      }).toEqual({ id: d.id, ok: true });
    }
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
      RunnerDefinitions.forFramework("storybook", ["package.json"]).id,
    ).toBe("storybook");
  });

  test("source globs, all or only those of runners with a qualify adapter", () => {
    expect(RunnerDefinitions.sourceGlobs()).toContain("**/*.mdx");
    expect(RunnerDefinitions.sourceGlobs({ qualify: true })).not.toContain(
      "**/*.mdx",
    );
    expect(RunnerDefinitions.sourceGlobs({ qualify: true })).toContain(
      "**/*.feature",
    );
    expect(RunnerDefinitions.toolFiles()).toContain("gradlew");
  });
});
