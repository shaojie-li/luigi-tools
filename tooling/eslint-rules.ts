import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import checkFile from "eslint-plugin-check-file";
import globals from "globals";
import tseslint from "typescript-eslint";

interface Options {
  root: string;
  typedFiles: string[];
  ignores?: string[];
}

export function createEslintConfig({
  root,
  typedFiles,
  ignores = [],
}: Options) {
  return tseslint.config(
    {
      ignores: [
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
        "**/.husky/_/**",
        "**/.agents/**",
        "**/.claude/**",
        ...ignores,
      ],
    },
    {
      files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
      extends: [js.configs.recommended, ...tseslint.configs.recommended],
      languageOptions: { globals: globals.node },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      plugins: { "check-file": checkFile },
      rules: {
        eqeqeq: ["error", "always"],
        "no-debugger": "error",
        "check-file/folder-naming-convention": [
          "error",
          { "**/src/**/": "[a-z]*" },
        ],
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports" },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
        "check-file/filename-naming-convention": [
          "error",
          { "**/*.{js,mjs,cjs,ts,mts,cts}": "KEBAB_CASE" },
          { ignoreMiddleExtensions: true },
        ],
      },
    },
    {
      files: typedFiles,
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: root },
      },
      rules: {
        "@typescript-eslint/no-floating-promises": [
          "error",
          { ignoreVoid: false },
        ],
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/await-thenable": "error",
      },
    },
    // Keep this last. Formatting is owned by Prettier, not ESLint rules.
    prettier,
  );
}
