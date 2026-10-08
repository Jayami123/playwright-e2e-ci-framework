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
    files: ["tests/**/*.ts"],
    ...playwright.configs["flat/recommended"],
  },
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
