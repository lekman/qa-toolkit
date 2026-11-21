import type { TokenValues } from "./types";

import { ThemeError } from "./errors";

/** Tokens every template may use. */
const COMMON = [
  "date",
  "documentId",
  "environment",
  "levels",
  "runId",
  "sha12",
  "verdict",
  "version",
] as const;

/**
 * Which tokens each text may use. Title and classification are resolved
 * first, so they may not use each other or themselves; page numbers exist
 * only in the header and footer.
 */
const ALLOWED: Record<string, readonly string[]> = {
  title: COMMON,
  classification: COMMON,
  subtitle: [...COMMON, "title", "classification"],
  header: [...COMMON, "title", "classification", "page", "pages"],
  footer: [...COMMON, "title", "classification", "page", "pages"],
};

type Part = { text: string } | { token: string };

/** Theme text templates: `{token}` substitution with `{{` and `}}` escapes. */
export class Template {
  /** Split a template into text and tokens. Unbalanced braces throw. */
  static parse(template: string, where: string): Part[] {
    const parts: Part[] = [];
    let text = "";
    for (let i = 0; i < template.length; i++) {
      const char = template[i] as string;
      const next = template[i + 1];
      if (char === "{" && next === "{") {
        text += "{";
        i++;
      } else if (char === "}" && next === "}") {
        text += "}";
        i++;
      } else if (char === "{") {
        const end = template.indexOf("}", i + 1);
        if (end < 0)
          throw new ThemeError(
            `${where}: a "{" is not closed; write "{{" for a literal brace`,
          );
        if (text.length > 0) parts.push({ text });
        text = "";
        parts.push({ token: template.slice(i + 1, end) });
        i = end;
      } else if (char === "}") {
        throw new ThemeError(
          `${where}: a "}" has no "{"; write "}}" for a literal brace`,
        );
      } else {
        text += char;
      }
    }
    if (text.length > 0) parts.push({ text });
    return parts;
  }

  /** Render a template whose tokens were checked. */
  static render(
    template: string,
    values: TokenValues & Partial<Record<"page" | "pages", string>>,
  ): string {
    return Template.parse(template, "template")
      .map((part) =>
        "text" in part
          ? part.text
          : ((values as unknown as Record<string, string | undefined>)[
              part.token
            ] ?? ""),
      )
      .join("");
  }

  /** Check every template of a theme's `texts`. Throws naming the first unknown token. */
  static validate(texts: Record<string, string>, where: string): void {
    for (const [name, template] of Object.entries(texts)) {
      const allowed = ALLOWED[name] ?? COMMON;
      for (const part of Template.parse(template, `${where}: texts.${name}`)) {
        if ("token" in part && !allowed.includes(part.token)) {
          throw new ThemeError(
            `${where}: texts.${name} uses {${part.token}}, which is not a token it may use (${allowed.map((t) => `{${t}}`).join(", ")})`,
          );
        }
      }
    }
  }
}
