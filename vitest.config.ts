import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "src/**/__tests__/**/*.ts"],
    exclude: ["node_modules", ".next", "dist", "supabase"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/email-pipeline/vendor-parsers/**",
        "src/lib/validation.ts",
        "src/lib/formatters.ts",
        "src/lib/status-config.ts",
        "src/lib/email-pipeline/pipeline/xrechnung.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
