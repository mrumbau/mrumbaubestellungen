// @ts-check
import tseslint from "typescript-eslint";

/**
 * Minimal ESLint flat config — single-purpose gate:
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
    },
    rules: {
      // Keep legacy @typescript-eslint/* rules registered-but-off so existing
      // `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments
      // scattered through the codebase continue to parse without errors. We may
      // enable these later — for now only the hex gate is active.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",

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
