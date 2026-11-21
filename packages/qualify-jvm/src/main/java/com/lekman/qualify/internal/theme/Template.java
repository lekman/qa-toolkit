package com.lekman.qualify.internal.theme;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Theme text templates: {@code {token}} substitution with {@code {{} and {@code }}} escapes. */
public final class Template {

  private static final List<String> COMMON =
      List.of(
          "date", "documentId", "environment", "levels", "runId", "sha12", "verdict", "version");

  /**
   * Which tokens each text may use. Title and classification are resolved first, so they may not
   * use each other or themselves; page numbers exist only in the header and footer.
   */
  private static final Map<String, List<String>> ALLOWED =
      Map.of(
          "title", COMMON,
          "classification", COMMON,
          "subtitle", with(COMMON, "title", "classification"),
          "header", with(COMMON, "title", "classification", "page", "pages"),
          "footer", with(COMMON, "title", "classification", "page", "pages"));

  private Template() {}

  /**
   * One part of a template.
   *
   * @param text literal text, when this part is not a token
   * @param token the token name, when this part is a token
   * @param isToken whether this part is a token
   */
  public record Part(String text, String token, boolean isToken) {}

  /** Split a template into text and tokens. Unbalanced braces throw {@link ThemeError}. */
  public static List<Part> parse(String template, String where) {
    List<Part> parts = new ArrayList<>();
    StringBuilder text = new StringBuilder();
    for (int i = 0; i < template.length(); i++) {
      char c = template.charAt(i);
      char next = i + 1 < template.length() ? template.charAt(i + 1) : '\0';
      if (c == '{' && next == '{') {
        text.append('{');
        i++;
      } else if (c == '}' && next == '}') {
        text.append('}');
        i++;
      } else if (c == '{') {
        int end = template.indexOf('}', i + 1);
        if (end < 0) {
          throw new ThemeError(where + ": a \"{\" is not closed; write \"{{\" for a literal brace");
        }
        if (text.length() > 0) {
          parts.add(new Part(text.toString(), "", false));
          text.setLength(0);
        }
        parts.add(new Part("", template.substring(i + 1, end), true));
        i = end;
      } else if (c == '}') {
        throw new ThemeError(where + ": a \"}\" has no \"{\"; write \"}}\" for a literal brace");
      } else {
        text.append(c);
      }
    }
    if (text.length() > 0) {
      parts.add(new Part(text.toString(), "", false));
    }
    return parts;
  }

  /** Render a template whose tokens were checked. */
  public static String render(String template, Map<String, String> values) {
    StringBuilder out = new StringBuilder();
    for (Part part : parse(template, "template")) {
      out.append(part.isToken() ? values.getOrDefault(part.token(), "") : part.text());
    }
    return out.toString();
  }

  /** Check every template of a theme's texts. Throws naming the first token a text may not use. */
  public static void validate(Map<String, String> texts, String where) {
    for (Map.Entry<String, String> entry : texts.entrySet()) {
      List<String> allowed = ALLOWED.getOrDefault(entry.getKey(), COMMON);
      for (Part part : parse(entry.getValue(), where + ": texts." + entry.getKey())) {
        if (part.isToken() && !allowed.contains(part.token())) {
          throw new ThemeError(
              where
                  + ": texts."
                  + entry.getKey()
                  + " uses {"
                  + part.token()
                  + "}, which is not a token it may use ("
                  + allowed.stream().map(t -> "{" + t + "}").collect(Collectors.joining(", "))
                  + ")");
        }
      }
    }
  }

  private static List<String> with(List<String> base, String... more) {
    List<String> all = new ArrayList<>(base);
    all.addAll(List.of(more));
    return List.copyOf(all);
  }
}
