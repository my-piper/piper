// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".angular/**",
      "dist/**",
      "dist-browser/**",
      "out-tsc/**",
      "coverage/**",
      "tmp/**",
      "test-results/**",
      "playwright-report/**",
      "tests/browser/support/serve.bundle.mjs",
      "*.config.mjs",
      ".vitest/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Keep compatibility with ESLint versions that require explicit defaults.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: false,
          allowTernary: false,
          allowTaggedTemplates: false,
        },
      ],
    },
  },
  {
    // A focused test silently skips the rest of the suite in CI.
    files: ["tests/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='only']",
          message: "Commit the whole suite: remove .only.",
        },
      ],
    },
  },
);
