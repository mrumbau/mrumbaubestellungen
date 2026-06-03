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
        // UX-R1 (03.06.2026) — Tailwind-Default-Color-Gate.
        // Drei-Sprachen-Disziplin v2 sagt: Status, Brand, Owner, Score haben
        // eigene Token (`status-*-bg`, `bg-brand`, `foreground-muted`, etc.).
        // Tailwind-Default-Skalen (text-slate-500, bg-emerald-500, etc.) sind
        // Anti-Pattern weil sie das Token-System bypassen — sie würden bei
        // einem Brand-Refresh stehenbleiben.
        // Whitelist: globale Tailwind-State-Klassen (transparent, current,
        // inherit, white, black) bleiben erlaubt — sie sind keine Skalen.
        // Stub als WARN, damit der Build nicht bricht solange wir die
        // 249-Default-Color-Leaks aus dem Audit noch nicht alle migriert
        // haben. Wird in UX-R6 auf "error" hochgestuft.
        // CardScan ist über die files-Section ausgenommen weil
        // /cardscan/-Komponenten emerald-* aus eigener Sub-Brand nutzen.
        {
          selector: "Literal[value=/\\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|accent|caret|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "UX-R1 Token-Bypass: Tailwind-Default-Color (z.B. text-slate-500). Nutze stattdessen Design-Tokens: text-foreground-muted, bg-canvas, border-line, status-*-bg/-text, --feedback-*. Wenn nötig im /cardscan-Scope: dort sind cs-* und Emerald-Skalen ok.",
        },
        {
          selector: "TemplateElement[value.raw=/\\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|accent|caret|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "UX-R1 Token-Bypass: Tailwind-Default-Color in Template-Literal. Nutze Design-Tokens (siehe Sister-Rule).",
        },
      ],
    },
  },
  // CardScan-Sub-Brand-Ausnahme: emerald-* und cs-* Tokens dürfen im
  // CardScan-Scope frei genutzt werden. Override deaktiviert die UX-R1-Regeln
  // nur für die zwei Default-Color-Selectors (Indices 2 und 3 oben).
  {
    files: ["src/app/(cardscan)/**/*.{ts,tsx}", "src/components/cardscan/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "Hardcoded hex color in Tailwind arbitrary value. Use design tokens.",
        },
        {
          selector: "TemplateElement[value.raw=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "Hardcoded hex color in Tailwind arbitrary value (template literal). Use design tokens.",
        },
      ],
    },
  },
);
