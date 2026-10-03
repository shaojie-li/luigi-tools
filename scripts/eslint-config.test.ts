import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { createEslintConfig } from "../registry/presets/code-quality/tooling/eslint-rules.js";

const root = fileURLToPath(new URL("..", import.meta.url));
// These in-memory fixtures exercise naming and React rules without a TS project.
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
    "src/features/taskDialog/task-state.ts",
    'export const taskState = "ready";',
  ],
  [
    "src/components/TaskList.tsx",
    "export function TaskList({ tasks }: { tasks: { id: string; title: string }[] }) { return <ul>{tasks.map((task) => <li key={task.id}>{task.title}</li>)}</ul>; }",
  ],
  [
    "src/components/taskDialog/index.tsx",
    'import { useState } from "react"; export function TaskDialog() { const [open, setOpen] = useState(false); return <button onClick={() => setOpen(!open)}>{String(open)}</button>; }',
  ],
] as const;

for (const [filename, source] of valid) {
  await test(`完整 ESLint 配置允许：${filename}`, () => {
    assert.deepEqual(lint(filename, source), []);
  });
}

const invalid = [
  [
    "src/hooks/use-task.ts",
    'import { useState } from "react"; export function useTask(ready: boolean) { if (ready) { return useState("task"); } return null; }',
    "react-hooks/rules-of-hooks",
  ],
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
  [
    "src/components/TaskList.tsx",
    "export function TaskList({ tasks }: { tasks: string[] }) { return <ul>{tasks.map((task) => <li>{task}</li>)}</ul>; }",
    "react-x/no-missing-key",
  ],
  [
    "src/components/TaskList.tsx",
    "export function TaskList({ tasks }: { tasks: string[] }) { return <ul>{tasks.map((task, index) => <li key={index}>{task}</li>)}</ul>; }",
    "react-x/no-array-index-key",
  ],
  [
    "src/components/TaskList.tsx",
    "export function TaskList() { function TaskRow() { return <li>task</li>; } return <ul><TaskRow /></ul>; }",
    "react-x/no-nested-component-definitions",
  ],
  [
    "src/components/TaskList.tsx",
    'import { useState } from "react"; export function TaskList({ ready }: { ready: boolean }) { if (ready) { const [task] = useState("task"); return <div>{task}</div>; } return null; }',
    "react-hooks/rules-of-hooks",
  ],
  [
    "src/components/task-list.tsx",
    "export function TaskList() { return <ul />; }",
    "local/react-naming",
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
