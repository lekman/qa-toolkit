import { describe, expect, test } from "bun:test";

import { PackageRoots } from "../../src/packages";
import { CommandLines, RunnerDefinitions } from "../../src/runners";

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
