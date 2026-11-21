import { describe, expect, test } from "bun:test";

import type { Declaration } from "../../src/declaration";

import {
  ConfigurationError,
  Policy,
  SettingsResolver,
} from "../../src/settings";

describe("SettingsResolver.environment", () => {
  test("QUALIFY_ENVIRONMENT, then the option, then local", () => {
    expect(
      SettingsResolver.environment(
        { QUALIFY_ENVIRONMENT: "staging" },
        { environment: "dev" },
      ),
    ).toBe("staging");
    expect(
      SettingsResolver.environment(
        { QUALIFY_ENVIRONMENT: " " },
        { environment: "dev" },
      ),
    ).toBe("dev");
    expect(SettingsResolver.environment({})).toBe("local");
  });

  test("a configured resolver replaces the default; a throwing one means production", () => {
    expect(
      SettingsResolver.environment(
        { QUALIFY_ENVIRONMENT: "x" },
        { resolveEnvironment: () => "qa" },
      ),
    ).toBe("qa");
    expect(
      SettingsResolver.environment(
        {},
        {
          resolveEnvironment: () => {
            throw new Error("unreachable vault");
          },
        },
      ),
    ).toBe("production");
    expect(
      SettingsResolver.environment({}, { resolveEnvironment: () => "" }),
    ).toBe("production");
  });
});

describe("SettingsResolver.overrides", () => {
  test("parses ID=reason pairs", () => {
    expect(
      SettingsResolver.overrides(
        " OQ-A1-001=hotfix window ; ;IQ-B1-002 = audit",
      ),
    ).toEqual([
      { id: "OQ-A1-001", reason: "hotfix window" },
      { id: "IQ-B1-002", reason: "audit" },
    ]);
    expect(SettingsResolver.overrides({ "OQ-A1-001": "map form" })).toEqual([
      { id: "OQ-A1-001", reason: "map form" },
    ]);
  });

  test("refuses a bad ID, a missing reason and a repeated ID", () => {
    expect(() => SettingsResolver.overrides("bad=x")).toThrow(
      ConfigurationError,
    );
    expect(() => SettingsResolver.overrides("OQ-A1-001")).toThrow(
      "gives no reason",
    );
    expect(() => SettingsResolver.overrides("OQ-A1-001=")).toThrow(
      "gives no reason",
    );
    expect(() => SettingsResolver.overrides("OQ-A1-001=a;OQ-A1-001=b")).toThrow(
      "twice",
    );
  });
});

describe("SettingsResolver.resolve", () => {
  test("defaults", () => {
    const s = SettingsResolver.resolve({ QUALIFY_SECRET_TOKEN: "v" });
    expect(s).toMatchObject({
      attachmentLimit: 1048576,
      environment: "local",
      evidenceDir: "qualification/evidence",
      notApplicable: [],
      overrides: [],
      production: ["production", "prod"],
      productionWriteBlocked: false,
    });
    expect(s.readSecret("TOKEN")).toBe("v");
  });

  test("environment variables win over options", () => {
    const s = SettingsResolver.resolve(
      {
        QUALIFY_ENVIRONMENT: "live",
        QUALIFY_PRODUCTION: "live, prod2",
        QUALIFY_ATTACHMENT_LIMIT: "16",
        QUALIFY_EVIDENCE_DIR: "/tmp/ev",
      },
      {
        production: ["other"],
        attachmentLimit: 99,
        evidenceDir: "x",
        secretSource: () => "s",
      },
    );
    expect(s.environment).toBe("live");
    expect(s.production).toEqual(["live", "prod2"]);
    expect(s.productionWriteBlocked).toBe(true);
    expect(s.attachmentLimit).toBe(16);
    expect(s.evidenceDir).toBe("/tmp/ev");
    expect(s.readSecret("ANY")).toBe("s");
  });

  test("options apply when no variable is set", () => {
    const s = SettingsResolver.resolve(
      {},
      { production: "a,b", attachmentLimit: 5, allowWrite: "OQ-A1-001=r" },
    );
    expect(s.production).toEqual(["a", "b"]);
    expect(s.attachmentLimit).toBe(5);
    expect(s.overrides).toEqual([{ id: "OQ-A1-001", reason: "r" }]);
  });

  test("QUALIFY_NO_OVERRIDES refuses any override", () => {
    expect(() =>
      SettingsResolver.resolve({
        QUALIFY_NO_OVERRIDES: "1",
        QUALIFY_ALLOW_WRITE: "OQ-A1-001=r",
      }),
    ).toThrow("refuses every override");
    expect(() =>
      SettingsResolver.resolve(
        { QUALIFY_ALLOW_WRITE: "OQ-A1-001=r" },
        { noOverrides: true },
      ),
    ).toThrow(ConfigurationError);
    expect(
      SettingsResolver.resolve({
        QUALIFY_NO_OVERRIDES: "0",
        QUALIFY_ALLOW_WRITE: "OQ-A1-001=r",
      }).overrides,
    ).toHaveLength(1);
    expect(
      SettingsResolver.resolve({ QUALIFY_NO_OVERRIDES: "true" }).overrides,
    ).toEqual([]);
  });

  test("an attachment limit must be a whole number", () => {
    expect(() =>
      SettingsResolver.resolve({ QUALIFY_ATTACHMENT_LIMIT: "1.5" }),
    ).toThrow(ConfigurationError);
    expect(() => SettingsResolver.resolve({}, { attachmentLimit: -1 })).toThrow(
      ConfigurationError,
    );
  });
});

const declaration = (overrides: Partial<Declaration> = {}): Declaration => ({
  id: "OQ-A1-001",
  level: "OQ",
  title: "t",
  given: "g",
  when: "w",
  then: "t",
  scope: "read-write",
  requirements: [],
  tags: ["windows"],
  site: "s:1",
  ...overrides,
});

describe("Policy", () => {
  test("blocks read-write tests in production unless overridden", () => {
    const blocked = SettingsResolver.resolve({ QUALIFY_ENVIRONMENT: "prod" });
    expect(Policy.skipReason(declaration(), blocked)).toBe(
      "read-write test blocked in production environment prod",
    );
    expect(
      Policy.skipReason(declaration({ scope: "read" }), blocked),
    ).toBeUndefined();
    const allowed = SettingsResolver.resolve({
      QUALIFY_ENVIRONMENT: "prod",
      QUALIFY_ALLOW_WRITE: "OQ-A1-001=r",
    });
    expect(Policy.skipReason(declaration(), allowed)).toBeUndefined();
    expect(Policy.info(allowed)).toEqual({
      productionWriteBlocked: true,
      overrides: [{ id: "OQ-A1-001", reason: "r" }],
    });
  });

  test("not applicable rules match on tags and environment", () => {
    const s = SettingsResolver.resolve(
      { QUALIFY_ENVIRONMENT: "staging" },
      {
        notApplicable: [
          { reason: "only in dev", environments: ["dev"] },
          {
            reason: "no windows runners",
            tags: ["windows"],
            environments: ["staging"],
          },
        ],
      },
    );
    expect(Policy.skipReason(declaration(), s)).toBe("no windows runners");
    expect(Policy.skipReason(declaration({ tags: [] }), s)).toBeUndefined();
    const any = SettingsResolver.resolve(
      {},
      { notApplicable: [{ reason: "always" }] },
    );
    expect(Policy.skipReason(declaration(), any)).toBe("always");
  });
});
