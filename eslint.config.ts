import { createEslintConfig } from "./registry/presets/code-quality/tooling/eslint-rules.js";

export default createEslintConfig({
  root: import.meta.dirname,
  typedFiles: [
    "packages/**/*.ts",
    "scripts/**/*.ts",
    "*.ts",
    "registry/presets/code-quality/tooling/**/*.ts",
  ],
  // Template/UI sources are linted here, and type-aware linted after CLI installation in smoke.
  ignores: ["packages/cli/registry/**"],
});
