import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      ".auth/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/**/*.ts", "src/products/**/*.ts"],
    rules: {
      "playwright/no-nth-methods": "error",
      "playwright/no-raw-locators": "error",
      "playwright/no-wait-for-timeout": "error",
      // Tags are declared on test options (`tag: ["@cal", …]`), not only in titles.
      "playwright/require-tags": "error",
    },
  },
  {
    rules: {
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
    },
  },
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
