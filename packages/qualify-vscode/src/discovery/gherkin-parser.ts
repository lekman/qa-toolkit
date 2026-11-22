import type { Declaration } from "./types";

import { Levels } from "../levels";
import { DeclarationRules } from "./declaration-rules";

const SCENARIO =
  /^\s*(Scenario Outline|Scenario Template|Scenario|Example):\s*(.*)$/;
const STEP = /^\s*(Given|When|Then|And|But|\*)\s/;
const STEP_TYPE: Readonly<Record<string, string>> = {
  Given: "given",
  Then: "then",
  When: "when",
};

/** A scenario while its steps are read. */
interface Open {
  declaration: Declaration;
  outline: boolean;
  steps: string[];
}

/** The steps are Given steps, then When steps, then a Then step, as the cucumber adapter requires. */
const ordered = (steps: readonly string[]): boolean => {
  const when = steps.indexOf("when");
  const then = steps.indexOf("then");
  return (
    when > 0 &&
    then > when &&
    steps.slice(0, when).every((s) => s === "given") &&
    steps.slice(when, then).every((s) => s === "when")
  );
};

/**
 * Reads the scenarios of a Gherkin feature file that are qualification
 * tests: those whose name starts with a level prefix, such as
 * `IU-SUPPORT-001 Support lists every ticket`. Tags carry the requirements
 * (`@REQ-…`), risk (`@risk-…`) and scope (`@scope-…`), as the cucumber
 * adapter of `@lekman/qualify` reads them. Feature and rule tags apply to
 * every scenario under them. English keywords only.
 */
export class GherkinParser {
  /** The qualification scenarios in a feature file. */
  static parse(file: string, text: string): Declaration[] {
    const found: Declaration[] = [];
    let featureTags: string[] = [];
    let ruleTags: string[] = [];
    let pending: string[] = [];
    let open: Open | undefined;
    let fence: string | undefined;
    const finish = (): void => {
      if (open === undefined) return;
      found.push(GherkinParser.finish(open));
      open = undefined;
    };
    text.split(/\r?\n/).forEach((raw, index) => {
      const line = raw.trim();
      if (fence !== undefined) {
        if (line.startsWith(fence)) fence = undefined;
        return;
      }
      if (line.startsWith('"""') || line.startsWith("```")) {
        fence = line.slice(0, 3);
        return;
      }
      if (line.startsWith("@")) {
        pending.push(
          ...(line.split("#")[0] as string)
            .split(/\s+/)
            .filter((t) => t.startsWith("@")),
        );
        return;
      }
      const step = STEP.exec(line);
      if (step && open !== undefined) {
        const word = step[1] as string;
        const type =
          STEP_TYPE[word] ?? open.steps[open.steps.length - 1] ?? "other";
        open.steps.push(type);
        return;
      }
      if (/^Feature:/.test(line)) {
        featureTags = pending;
        pending = [];
      } else if (/^Rule:/.test(line)) {
        finish();
        ruleTags = pending;
        pending = [];
      } else if (/^(Background|Examples|Scenarios):/.test(line)) {
        finish();
        pending = [];
      } else {
        const scenario = SCENARIO.exec(line);
        if (scenario) {
          finish();
          const tags = [...featureTags, ...ruleTags, ...pending];
          pending = [];
          open = GherkinParser.open(file, index + 1, scenario, tags);
        }
      }
    });
    finish();
    return found;
  }

  /** Checks a scenario once its steps are read. */
  private static finish(open: Open): Declaration {
    const d = open.declaration;
    const problems = [...d.problems];
    if (open.outline) {
      problems.push(
        "a Scenario Outline runs once per example, and one ID must map to one record; write a Scenario for each ID",
      );
    }
    const fields = new Set(["given", "when", "then"]);
    if (!ordered(open.steps)) {
      problems.push(
        "the steps must be one or more Given steps, then one or more When steps, then a Then step",
      );
    }
    if (d.scope !== undefined) fields.add("scope");
    return DeclarationRules.check({ ...d, problems }, fields);
  }

  /** A scenario that starts on a line, or `undefined` when it is not a qualification test. */
  private static open(
    file: string,
    line: number,
    scenario: RegExpExecArray,
    tags: readonly string[],
  ): Open | undefined {
    const name = (scenario[2] as string).trim();
    const [id = "", ...rest] = name.split(/\s+/);
    const level = Levels.ofId(id);
    if (level === undefined) return undefined;
    const requirements: string[] = [];
    const free: string[] = [];
    const problems: string[] = [];
    const risks: string[] = [];
    const scopes: string[] = [];
    for (const tag of new Set(tags)) {
      if (/^@REQ-/.test(tag)) requirements.push(tag.slice(1));
      else if (tag.startsWith("@risk-")) risks.push(tag.slice(6));
      else if (tag.startsWith("@scope-")) scopes.push(tag.slice(7));
      else if (!tag.startsWith("@controls-")) free.push(tag.slice(1));
    }
    if (risks.length > 1)
      problems.push(`more than one @risk- tag: ${risks.join(", ")}`);
    if (scopes.length > 1)
      problems.push(`more than one @scope- tag: ${scopes.join(", ")}`);
    return {
      declaration: {
        file,
        framework: "cucumber",
        id,
        language: "gherkin",
        level,
        line,
        problems,
        requirements,
        tags: free,
        title: rest.join(" "),
        ...(risks[0] === undefined ? {} : { risk: risks[0] }),
        ...(scopes[0] === undefined ? {} : { scope: scopes[0] }),
      },
      outline:
        (scenario[1] as string) !== "Scenario" && scenario[1] !== "Example",
      steps: [],
    };
  }
}
