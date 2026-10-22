import { createEslintConfig } from "./tooling/eslint-rules.js";

export default createEslintConfig({
  root: import.meta.dirname,
  typedFiles: [
    "src/**/*.ts",
    "test/**/*.ts",
    "scripts/**/*.ts",
    "*.ts",
    "tooling/**/*.ts",
  ],
});
