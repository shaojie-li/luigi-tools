import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { createEslintConfig } from "../tooling/eslint-rules.js";

const root = fileURLToPath(new URL("..", import.meta.url));
// These in-memory fixtures exercise CLI naming and correctness rules without a TS project.
// Keep the type-aware block intact but outside the fixture paths.
const config = createEslintConfig({
  root,
  typedFiles: ["type-aware-fixtures/**/*.ts"],
});

function lint(filename: string, source: string) {
  // typescript-eslint's compatible flat config omits ESLint 10's index signature.
  return new Linter({ cwd: root }).verify(source, config as Linter.Config[], {
    filename,
  });
}

const valid = [
  ["src/lib/task-state.ts", 'export const taskState = "ready";'],
  [
    "src/features/install-plan/task-state.ts",
    'export const taskState = "ready";',
  ],
] as const;

for (const [filename, source] of valid) {
  await test(`完整 ESLint 配置允许：${filename}`, () => {
    assert.deepEqual(lint(filename, source), []);
  });
}

const invalid = [
  [
    "src/lib/taskState.ts",
    'export const taskState = "ready";',
    "check-file/filename-naming-convention",
  ],
  [
    "src/Features/task-state.ts",
    'export const taskState = "ready";',
    "check-file/folder-naming-convention",
  ],
  ["src/lib/task-state.ts", "debugger;", "no-debugger"],
  [
    "src/lib/task-state.ts",
    "export const equal = (value: unknown) => value == null;",
    "eqeqeq",
  ],
] as const;

for (const [filename, source, ruleId] of invalid) {
  await test(`完整 ESLint 配置拦截 ${ruleId}：${filename}`, () => {
    const messages = lint(filename, source);
    assert.ok(
      messages.some(
        (message) => message.ruleId === ruleId && message.severity === 2,
      ),
      JSON.stringify(messages),
    );
    assert.ok(
      messages.every((message) => !message.fatal),
      JSON.stringify(messages),
    );
  });
}
