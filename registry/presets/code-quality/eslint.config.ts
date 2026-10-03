import { createEslintConfig } from "./tooling/eslint-rules.js";

export default createEslintConfig({
  root: import.meta.dirname,
  typedFiles: ["**/*.{ts,tsx}"],
});
