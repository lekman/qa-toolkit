import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";

export default [
  // `.ua/` holds generated knowledge-graph data and the scratch scripts the
  // analysis writes. `.venv/` is a Python package's virtual environment, which
  // carries third-party JavaScript, and `qualify-jvm/build/` holds Gradle's
  // HTML reports. Both are gitignored, but eslint keeps its own list.
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/.ua/",
      "**/.venv/",
      "packages/qualify-jvm/build/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.mts", "**/*.mjs"],
    plugins: { jsdoc, perfectionist },
    rules: {
      // Sorted imports, and sorted names inside each import.
      "perfectionist/sort-imports": "error",
      "perfectionist/sort-named-imports": "error",

      // Static class members in a fixed order, so .claude/rules/clean-architecture.md
      // describes what the linter enforces.
      "perfectionist/sort-classes": "error",

      // Every exported class, function, and public class property carries a
      // comment. Internal helpers are exempt. The fixer stays off: it inserts
      // empty stubs, which satisfy the rule without saying anything.
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ClassDeclaration: true,
            FunctionDeclaration: true,
            MethodDefinition: true,
          },
          contexts: ['PropertyDefinition:not([accessibility="private"])'],
          checkConstructors: false,
          enableFixer: false,
        },
      ],
    },
  },
];
