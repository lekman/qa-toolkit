import type { Level, Narrative, Risk, Scope } from "../declaration";
import type { RunnerErrors } from "../outcome";
import type {
  FeatureChildNode,
  FeatureDocument,
  ScenarioDeclaration,
  ScenarioResult,
  ScenarioSource,
  ScenarioStep,
} from "./types";

import { DeclarationError } from "../declaration";

const LEVELS: readonly string[] = ["IQ", "OQ", "PQ", "IU"];
const NAME = /^(\S+)(?:\s+(.*))?$/;
const REQUIREMENT = /^@(REQ-.+)$/;
const RISK = /^@risk-(.*)$/;
const SCOPE = /^@scope-(.*)$/;
const CONTROLS = /^@controls-(.*)$/;
const WORD: Readonly<Record<string, string>> = {
  Action: "When",
  Context: "Given",
};
const RUNNER_SKIP = Symbol.for("@lekman/qualify.runnerSkip");

/** An error with the type name cucumber reported, for a failure qualify did not catch. */
const reported = (type: string, message: string): Error => {
  const error = new Error(message);
  if (type !== "Error") error.name = type;
  return error;
};

/** At most one value of a tag that takes one, such as `@risk-high`. */
const single = (
  values: string[],
  tag: string,
  problems: string[],
): string | undefined => {
  if (values.length > 1) {
    problems.push(`more than one ${tag} tag: ${values.join(", ")}`);
  }
  return values[0];
};

/**
 * Reads a Gherkin scenario as a qualification test, and a scenario's result
 * as the value its body threw. The scenario name is `<ID> <title>`; the level
 * is the ID's prefix. The steps are the narrative, and tags carry the
 * requirements (`@REQ-…`), risk (`@risk-…`), scope (`@scope-…`) and control
 * (`@controls-…`). Every other tag is recorded as a tag, without its `@`.
 */
export class Scenarios {
  /** How the scenario's own errors and skips map to outcomes. */
  static readonly RUNNER: RunnerErrors = {
    isAssertion: () => false,
    skipReason: (error) => {
      if (typeof error !== "object" || error === null) return undefined;
      const reason = (error as Record<symbol, unknown>)[RUNNER_SKIP];
      return typeof reason === "string" ? reason : undefined;
    },
  };

  /**
   * The declaration a scenario makes. Field rules are checked later, by
   * `Declarations.validate`; this throws a `DeclarationError` for what only a
   * scenario can get wrong: its name, its tags, the order of its steps, and
   * being one row of a Scenario Outline.
   */
  static declaration(scenario: ScenarioSource): ScenarioDeclaration {
    const problems: string[] = [];
    const name = NAME.exec(scenario.name.trim());
    const id = name?.[1] ?? scenario.name;
    const level = id.slice(0, 2);
    if (!LEVELS.includes(level) || id[2] !== "-") {
      problems.push(
        "the scenario name must be the test ID, then the title, for example OQ-EXPORT-003 The bank file keeps every amount",
      );
    }
    if (scenario.astNodeIds.length > 1) {
      problems.push(
        "a Scenario Outline runs once per example, and one ID must map to one record; write a Scenario for each ID",
      );
    }
    const narrative: Narrative = {
      ...Scenarios.steps(scenario.steps, problems),
      ...Scenarios.tagged(scenario.tags, problems),
    };
    if (problems.length > 0) throw new DeclarationError(id, problems);
    return {
      id,
      level: level as Level,
      line: scenario.location?.line ?? 1,
      narrative,
      title: name?.[2]?.trim() ?? "",
    };
  }

  /**
   * The value a scenario's body threw, read from cucumber's result when
   * qualify did not see the error itself: a failed hook, an undefined,
   * ambiguous or pending step, or a step that returned `skipped`.
   */
  static ending(
    result: ScenarioResult | undefined,
  ): undefined | { error: unknown } {
    if (result === undefined || result.status === "PASSED") return undefined;
    switch (result.status) {
      case "SKIPPED":
        return {
          error: { [RUNNER_SKIP]: "skipped by cucumber" },
        };
      case "PENDING":
        return { error: reported("PendingStep", "a step is pending") };
      case "UNDEFINED":
        return {
          error: reported("UndefinedStep", "a step has no step definition"),
        };
      case "AMBIGUOUS":
        return {
          error: reported(
            "AmbiguousStep",
            "a step matches more than one step definition",
          ),
        };
      default:
        return {
          error: reported(
            result.exception?.type ?? "Error",
            result.exception?.message ??
              result.message ??
              `the scenario ended as ${result.status}`,
          ),
        };
    }
  }

  /** The line of every scenario, background, step and example row, by node ID. */
  static lines(document: FeatureDocument): Map<string, number> {
    const lines = new Map<string, number>();
    const visit = (children: readonly FeatureChildNode[]): void => {
      for (const child of children) {
        if (child.rule) visit(child.rule.children);
        for (const block of [child.background, child.scenario]) {
          if (!block) continue;
          lines.set(block.id, block.location.line);
          for (const step of block.steps)
            lines.set(step.id, step.location.line);
          for (const examples of block.examples ?? []) {
            for (const row of examples.tableBody) {
              lines.set(row.id, row.location.line);
            }
          }
        }
      }
    };
    visit(document.feature?.children ?? []);
    return lines;
  }

  /**
   * The narrative from the steps: `given` joins the Given steps, `when` the
   * When steps that follow, and `then` is the first Then step. Each later
   * step is an `and` clause, written with its keyword when it is a Given or
   * When step.
   */
  private static steps(
    steps: readonly ScenarioStep[],
    problems: string[],
  ): Pick<Narrative, "and" | "given" | "then" | "when"> {
    const firstWhen = steps.findIndex((s) => s.type === "Action");
    const firstThen = steps.findIndex((s) => s.type === "Outcome");
    const ordered =
      firstWhen > 0 &&
      firstThen > firstWhen &&
      steps.slice(0, firstWhen).every((s) => s.type === "Context") &&
      steps.slice(firstWhen, firstThen).every((s) => s.type === "Action");
    if (!ordered) {
      problems.push(
        "the steps must be one or more Given steps, then one or more When steps, then a Then step",
      );
      return { given: "", when: "", then: "" };
    }
    const join = (from: number, to: number): string =>
      steps
        .slice(from, to)
        .map((s) => s.text)
        .join(" and ");
    const and = steps.slice(firstThen + 1).map((s) => {
      const word = WORD[s.type ?? ""];
      return word === undefined ? s.text : `${word} ${s.text}`;
    });
    return {
      given: join(0, firstWhen),
      when: join(firstWhen, firstThen),
      then: (steps[firstThen] as ScenarioStep).text,
      ...(and.length > 0 ? { and } : {}),
    };
  }

  /** Requirements, risk, scope, control and free tags from the scenario's tags. */
  private static tagged(
    tags: readonly { name: string }[],
    problems: string[],
  ): Pick<Narrative, "controls" | "requirements" | "risk" | "scope" | "tags"> {
    const requirements: string[] = [];
    const risks: string[] = [];
    const scopes: string[] = [];
    const controls: string[] = [];
    const free: string[] = [];
    for (const tag of new Set(tags.map((t) => t.name))) {
      const requirement = REQUIREMENT.exec(tag);
      const risk = RISK.exec(tag);
      const scope = SCOPE.exec(tag);
      const control = CONTROLS.exec(tag);
      if (requirement) requirements.push(requirement[1] as string);
      else if (risk) risks.push(risk[1] as string);
      else if (scope) scopes.push(scope[1] as string);
      else if (control) controls.push(control[1] as string);
      else free.push(tag.replace(/^@/, ""));
    }
    const risk = single(risks, "@risk-", problems);
    const scope = single(scopes, "@scope-", problems);
    const control = single(controls, "@controls-", problems);
    return {
      requirements,
      tags: free,
      ...(risk === undefined ? {} : { risk: risk as Risk }),
      ...(scope === undefined ? {} : { scope: scope as Scope }),
      ...(control === undefined ? {} : { controls: control }),
    };
  }
}
