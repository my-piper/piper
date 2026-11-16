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
      "src/ui-kit/**",
      "*.config.mjs",
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
          // `const { omitted, ...rest } = x` drops a field on purpose
          ignoreRestSiblings: true,
          caughtErrors: "none",
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
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // A focused test silently skips the rest of the suite in CI.
    files: ["tests/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name=/^f(describe|it)$/]",
          message:
            "Commit the whole suite: replace fdescribe/fit with describe/it.",
        },
        {
          selector: "MemberExpression[property.name='only']",
          message: "Commit the whole suite: remove .only.",
        },
      ],
    },
  },
);
