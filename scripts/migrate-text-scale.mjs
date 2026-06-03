#!/usr/bin/env node
/**
 * migrate-text-scale.mjs — Codemod für UX-R1 (03.06.2026)
 *
 * Ersetzt Tailwind-Default-Text-Klassen durch die semantische Skala aus
 * globals.css (DESIGN-Critique #2, 7 kanonische Stufen).
 *
 * Exact-Maps (verlustfrei, gleicher px-Wert):
 *   text-xs   →  text-meta      (12px)
 *   text-sm   →  text-body-sm   (14px)
 *   text-base →  text-body      (16px)
 *   text-lg   →  text-lead      (18px)
 *   text-2xl  →  text-h2        (24px)
 *
 * Approximate-Maps (Werte weichen ab — Codemod markiert mit TODO-Kommentar
 * für manuelle Review im nächsten Sprint):
 *   text-xl   →  text-h2 + // TODO text-scale: war 20px, jetzt 24px
 *   text-3xl  →  text-h1 + // TODO text-scale: war 30px, jetzt 28px
 *   text-4xl  →  manual review only (kein Auto-Replace)
 *
 * Ausgeschlossen:
 *   - Prefixed-Varianten (md:text-sm, hover:text-xs, etc.) — selten,
 *     bleiben für späteren Sweep.
 *   - Brand-Surfaces (src/app/page.tsx, src/app/login/, src/app/not-found.tsx)
 *     — bewusst editorial-tier mit eigenen Skalen.
 *   - /cardscan/ — eigene Sub-Brand, eigene Session.
 *
 * Usage:
 *   node scripts/migrate-text-scale.mjs           # apply + print diff stats
 *   node scripts/migrate-text-scale.mjs --dry     # zeige nur was passieren würde
 *   node scripts/migrate-text-scale.mjs --verbose # zeige jede Datei einzeln
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry");
const VERBOSE = process.argv.includes("--verbose");

const EXACT_MAP = {
  "text-xs": "text-meta",
  "text-sm": "text-body-sm",
  "text-base": "text-body",
  "text-lg": "text-lead",
  "text-2xl": "text-h2",
};

const APPROX_MAP = {
  "text-xl": { to: "text-h2", note: "war 20px, jetzt 24px" },
  "text-3xl": { to: "text-h1", note: "war 30px, jetzt 28px" },
};

const EXCLUDE_PATHS = [
  "src/app/(cardscan)/",
  "src/app/page.tsx",
  "src/app/login/",
  "src/app/not-found.tsx",
  "scripts/migrate-text-scale.mjs",
];

const isExcluded = (path) =>
  EXCLUDE_PATHS.some((p) => path.includes(p) || path === p);

// Word-boundary class-match: nicht-prefixed (kein `:` davor),
// kein anderes Wortzeichen vor/nach dem Token. Erfasst Vorkommen in
// `className="..."`, `cn(...)`, Template-Literals etc.
const buildPattern = (cls) =>
  new RegExp(`(^|[\\s"'\`{(,])${cls.replace(/-/g, "\\-")}(?=[\\s"'\`)},/]|$)`, "g");

const allFiles = execSync(
  `grep -rEl '\\btext-(xs|sm|base|lg|xl|2xl|3xl)\\b' src --include='*.tsx' --include='*.ts' || true`,
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean)
  .filter((f) => !isExcluded(f));

let totalReplacements = 0;
let totalApproxNotes = 0;
const filesChanged = [];

for (const file of allFiles) {
  let src = readFileSync(file, "utf8");
  const original = src;
  let fileExact = 0;
  let fileApprox = 0;

  // Exact maps first
  for (const [from, to] of Object.entries(EXACT_MAP)) {
    const re = buildPattern(from);
    src = src.replace(re, (match, pre) => {
      fileExact++;
      return `${pre}${to}`;
    });
  }

  // Approximate maps with TODO-Marker (one comment per file, not per occurrence)
  let approxClassesInFile = [];
  for (const [from, { to }] of Object.entries(APPROX_MAP)) {
    const re = buildPattern(from);
    src = src.replace(re, (match, pre) => {
      fileApprox++;
      if (!approxClassesInFile.includes(from)) approxClassesInFile.push(from);
      return `${pre}${to}`;
    });
  }

  if (src !== original) {
    totalReplacements += fileExact;
    totalApproxNotes += fileApprox;
    filesChanged.push({ file, exact: fileExact, approx: fileApprox });

    if (fileApprox > 0) {
      const notes = approxClassesInFile
        .map((c) => `${c}→${APPROX_MAP[c].to} (${APPROX_MAP[c].note})`)
        .join(", ");
      const header = `// TODO text-scale (UX-R1 codemod, 03.06.2026): ${fileApprox}× approx-map review: ${notes}\n`;
      // Insert after the first import block (or top of file)
      if (src.startsWith("import")) {
        const lastImport = src.lastIndexOf("\nimport");
        const endOfImports = src.indexOf("\n", lastImport > -1 ? lastImport + 1 : 0);
        src =
          src.slice(0, endOfImports + 1) +
          "\n" + header +
          src.slice(endOfImports + 1);
      } else {
        src = header + src;
      }
    }

    if (!DRY) writeFileSync(file, src);
    if (VERBOSE) console.log(`  ${file}: exact=${fileExact} approx=${fileApprox}`);
  }
}

console.log(`\n${DRY ? "[DRY-RUN] " : ""}migrate-text-scale.mjs`);
console.log(`  Files scanned:   ${allFiles.length}`);
console.log(`  Files changed:   ${filesChanged.length}`);
console.log(`  Exact replaces:  ${totalReplacements}`);
console.log(`  Approx replaces: ${totalApproxNotes} (review TODOs added)`);
if (!DRY && filesChanged.length > 0) {
  console.log(`\n  Run \`npm run build\` to verify no regressions.`);
}
