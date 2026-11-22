import type { Argument, CallSite, Declaration, Source } from "./types";

import { DeclarationRules } from "./declaration-rules";
import { SourceScanner } from "./source-scanner";

/** Field names that differ between languages, as the declaration names them. */
const ALIASES: Readonly<Record<string, string>> = { and_: "and" };

/**
 * Builds a declaration from the arguments of a declaring call or annotation:
 * `oq("OQ-…", "title", { … })`, `@qualify.oq("OQ-…", …)`, `@OQ(id = …)` or
 * `[OQ("OQ-…", …)]`.
 */
export class CallArguments {
  /**
   * The declaration. `positional` names the arguments that come before the
   * named ones, such as `["id", "title"]`. `fields` is `false` when the named
   * fields cannot be read, such as an options object held in a variable.
   */
  static declaration(
    source: Source,
    site: CallSite,
    args: readonly Argument[],
    positional: readonly string[],
    readable = true,
  ): Declaration {
    const values = CallArguments.values(source, args, positional);
    const problems: string[] = [];
    const text = (name: string): string | undefined => {
      const arg = values.get(name);
      return arg === undefined
        ? undefined
        : SourceScanner.literal(source.text, source.masked, arg);
    };
    const list = (name: string): string[] => {
      const arg = values.get(name);
      if (arg === undefined) return [];
      return SourceScanner.strings(
        source.text,
        source.masked,
        arg.start,
        arg.start + arg.text.length,
      );
    };
    const word = (name: string): string | undefined => {
      const arg = values.get(name);
      if (arg === undefined) return undefined;
      return text(name) ?? SourceScanner.identifier(arg.text);
    };
    let id = text("id");
    if (id === undefined) {
      const raw = values.get("id")?.text;
      problems.push(
        raw === undefined
          ? "the declaration has no ID"
          : "the ID is not a string literal, so it cannot be read without running the test",
      );
      id = raw ?? "(no ID)";
    }
    let title = text("title");
    if (title === undefined) {
      title = values.get("title")?.text ?? "";
      if (values.has("title")) {
        problems.push("the title is not a string literal");
      }
    }
    const risk = word("risk");
    const scope = word("scope");
    const declaration: Declaration = {
      ...site,
      id,
      problems,
      requirements: list("requirements"),
      tags: list("tags"),
      title,
      ...(risk === undefined ? {} : { risk }),
      ...(scope === undefined ? {} : { scope }),
    };
    return DeclarationRules.check(
      declaration,
      readable ? new Set(values.keys()) : undefined,
    );
  }

  /** The arguments by field name: the positional ones first, then the named ones. */
  static values(
    source: Source,
    args: readonly Argument[],
    positional: readonly string[],
  ): Map<string, Argument> {
    const values = new Map<string, Argument>();
    args.forEach((arg, index) => {
      const named = SourceScanner.named(source.text, source.masked, arg);
      if (named.key !== undefined) {
        values.set(ALIASES[named.key] ?? named.key, named);
      } else if (index < positional.length) {
        values.set(positional[index] as string, arg);
      }
    });
    return values;
  }
}
