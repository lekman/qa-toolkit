import { describe, expect, test } from "bun:test";

import { Levels, TestIds } from "../../src/levels";
import { PackageRoots } from "../../src/packages";

describe("PackageRoots", () => {
  const index = PackageRoots.index([
    "/ws/package.json",
    "/ws/apps/web/package.json",
    "/ws/libs/py/pyproject.toml",
    "/ws/dotnet/Acme.Tests/Acme.Tests.csproj",
    "/ws/apps/web/bun.lock",
  ]);

  test("finds the nearest folder with a build file", () => {
    expect(
      PackageRoots.nearest("/ws/apps/web/features/a.feature", "/ws", index),
    ).toEqual({
      markers: ["package.json"],
      root: "/ws/apps/web",
    });
    expect(
      PackageRoots.nearest("/ws/libs/py/tests/test_a.py", "/ws", index).root,
    ).toBe("/ws/libs/py");
    expect(
      PackageRoots.nearest("/ws/dotnet/Acme.Tests/A.cs", "/ws", index).markers,
    ).toEqual(["Acme.Tests.csproj"]);
    expect(
      PackageRoots.nearest("/ws/scripts/a.test.ts", "/ws", index).root,
    ).toBe("/ws");
  });

  test("falls back to the workspace folder when nothing has a build file", () => {
    const empty = PackageRoots.index([]);
    expect(PackageRoots.nearest("/ws/a/b.ts", "/ws", empty)).toEqual({
      markers: [],
      root: "/ws",
    });
    expect(PackageRoots.nearest("/elsewhere/b.ts", "/ws", empty)).toEqual({
      markers: [],
      root: "/ws",
    });
  });

  test("relative paths use / and . for the folder itself", () => {
    expect(PackageRoots.relative("/ws", "/ws")).toBe(".");
    expect(PackageRoots.relative("/ws", "/ws/apps/web")).toBe("apps/web");
  });

  test("findUp stops at the workspace folder", () => {
    expect(
      PackageRoots.findUp("bun.lock", "/ws/apps/web/src", "/ws", index),
    ).toBe("/ws/apps/web");
    expect(
      PackageRoots.findUp("gradlew", "/ws/apps", "/ws", index),
    ).toBeUndefined();
  });
});

describe("Levels and TestIds", () => {
  test("level order and descriptions", () => {
    expect(Levels.ALL.map((l) => l.level)).toEqual([
      "IQ",
      "OQ",
      "PQ",
      "IU",
      "integration",
      "story",
      "unit",
    ]);
    expect(Levels.info("IU").description).toBe("Intended Use");
  });

  test("the level an ID names", () => {
    expect(Levels.ofId("IU-SUPPORT-001")).toBe("IU");
    expect(Levels.ofId("oq-a-1")).toBe("OQ");
    expect(Levels.ofId("XQ-A-001")).toBeUndefined();
    expect(Levels.ofId("OQX")).toBeUndefined();
  });

  test("ID problems", () => {
    expect(TestIds.problems("OQ-EXPORT-003", "OQ")).toEqual([]);
    expect(TestIds.problems("OQ-EXPORT-003", "IU")).toEqual([
      "the ID must start with IU-, the level it is declared at",
    ]);
  });
});
