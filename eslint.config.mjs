// @ts-check
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint flat config — Hex-Color-Gate + Type/Hook-Hygiene:
 *
 *   `no-restricted-syntax` with a regex selector against string Literals and
 *    template elements flags any Tailwind arbitrary hex-color value like
 *    `text-[#570006]` or `bg-[#fafaf9]`.
 *
 *  Why: we migrated ~730 hardcoded hex colors to design tokens (P1 + P2) and
 *  want the gate to close automatically. Any new `bg-[#<hex>]` anywhere in src/
 *  fails lint unless wrapped in `eslint-disable-next-line no-restricted-syntax`
 *  with a justification comment right above.
 *
 *  Scope of this config: NOTHING else. No react/hook/any rules, no code-style
 *  lints. Any additional lint rules are out of scope until we decide to expand.
 *
 *  To run:  `npm run lint`
 *  To fix individual residuals: add `// eslint-disable-next-line no-restricted-syntax -- reason`
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "public/**",
      "**/*.d.ts",
      "next-env.d.ts",
      "eslint.config.mjs",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    rules: {
      // 18.05.2026 (A1.9) — Aktivierte Type/Hook-Regeln als WARNING (nicht
      // error), damit existierende Codebasis nicht sofort rote Build-CI bricht.
      // Über Zeit auf "error" hochstufen. Plus rules-of-hooks als ERROR weil
      // das sind echte Runtime-Bugs, nicht Style.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "Hardcoded hex color in Tailwind arbitrary value. Use design tokens (brand, foreground, canvas, line, status-*, error/success/warning/info). If unavoidable, add `// eslint-disable-next-line no-restricted-syntax -- reason` above the line.",
        },
        {
          selector: "TemplateElement[value.raw=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "Hardcoded hex color in Tailwind arbitrary value (inside template literal). Use design tokens. If unavoidable, add `// eslint-disable-next-line no-restricted-syntax -- reason` above the line.",
        },
      ],
    },
  },
);
