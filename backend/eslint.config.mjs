// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "core-kit/**",
      "cache/**",
      "tmp/**",
      "storage/**",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  {
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      // The installed ESLint/plugin versions require these defaults explicitly.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: false,
          allowTernary: false,
          allowTaggedTemplates: false,
        },
      ],

      // General rules
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
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
  }
);
