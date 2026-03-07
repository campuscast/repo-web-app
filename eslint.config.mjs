import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Legacy feature code uses these patterns intentionally (CRDT sync, form.watch)
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Animate UI installed components — 3rd-party, don't lint
    "src/components/animate-ui/**",
    // Legacy backup
    "_legacy_backup/**",
  ]),
]);

export default eslintConfig;
