import type { Declaration } from "../declaration";
import type { PolicyInfo } from "../evidence";
import type { Settings } from "./types";

/** Write protection and "not applicable" rules, section 5. */
export class Policy {
  /** The policy as the run envelope records it. */
  static info(settings: Settings): PolicyInfo {
    return {
      productionWriteBlocked: settings.productionWriteBlocked,
      overrides: settings.overrides.map((o) => ({ ...o })),
    };
  }

  /** The reason to skip a test before its body runs, or `undefined` to run it. */
  static skipReason(
    declaration: Declaration,
    settings: Settings,
  ): string | undefined {
    if (
      settings.productionWriteBlocked &&
      declaration.scope === "read-write" &&
      !settings.overrides.some((o) => o.id === declaration.id)
    ) {
      return `read-write test blocked in production environment ${settings.environment}`;
    }
    for (const rule of settings.notApplicable) {
      const tagMatch =
        rule.tags === undefined ||
        rule.tags.some((tag) => declaration.tags.includes(tag));
      const environmentMatch =
        rule.environments === undefined ||
        rule.environments.includes(settings.environment);
      if (tagMatch && environmentMatch) return rule.reason;
    }
    return undefined;
  }
}
