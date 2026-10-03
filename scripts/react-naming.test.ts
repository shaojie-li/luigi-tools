import assert from "node:assert/strict";
import test from "node:test";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { reactNaming } from "../registry/presets/code-quality/tooling/react-naming.js";

function lint(filename: string, source: string) {
  return new Linter().verify(
    source,
    [
      {
        files: ["**/*.{jsx,tsx}"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { local: { rules: { "react-naming": reactNaming } } },
        rules: { "local/react-naming": "error" },
      },
    ],
    { filename },
  );
}

const valid = [
  [
    "src/components/TaskDialog.tsx",
    "export function TaskDialog() { return <div />; }",
  ],
  [
    "src/components/taskDialog/index.tsx",
    "export function TaskDialog() { return <div />; }",
  ],
  [
    "src/components/taskDialog/index.tsx",
    'export { TaskDialog } from "./TaskDialog";',
  ],
  [
    "src/components/taskDialog/index.tsx",
    'export { TaskDialog as default } from "./TaskDialog";',
  ],
  [
    "src/components/taskDialog/index.tsx",
    "function TaskDialog() { return <div />; } export default TaskDialog;",
  ],
  [
    "src/components/taskDialog/index.tsx",
    "export const TaskDialog = memo(() => <div />); export const Header = () => <header />;",
  ],
  [
    "src/components/taskDialog/TaskDialog.test.tsx",
    'test("renders", () => render(<TaskDialog />));',
  ],
  [
    "src/components/taskDialog/TaskDialog.stories.tsx",
    "export const Default = { render: () => <TaskDialog /> };",
  ],
  [
    "src/components/TaskDialog.tsx",
    "function renderRow() { return <tr />; } export function TaskDialog() { return <table>{renderRow()}</table>; }",
  ],
  [
    "src/main.tsx",
    'createRoot(document.getElementById("root")!).render(<App />);',
  ],
  [
    "src/components/TaskDialog.tsx",
    "export class TaskDialog extends React.Component { render() { return <div />; } }",
  ],
] as const;

for (const [filename, source] of valid) {
  await test(`允许规范命名：${filename} — ${source.slice(0, 45)}`, () => {
    assert.deepEqual(lint(filename, source), []);
  });
}

const invalid = [
  [
    "src/components/task-dialog.tsx",
    "export function TaskDialog() { return <div />; }",
    "filename",
  ],
  [
    "src/components/taskDialog.tsx",
    "export function TaskDialog() { return <div />; }",
    "filename",
  ],
  [
    "src/components/TaskDialog/index.tsx",
    "export function TaskDialog() { return <div />; }",
    "folder",
  ],
  [
    "src/Features/taskDialog/index.tsx",
    "export function TaskDialog() { return <div />; }",
    "folder",
  ],
  [
    "src/components/taskDialog/index.tsx",
    "export function Dialog() { return <div />; }",
    "entry",
  ],
  [
    "src/components/taskDialog/index.tsx",
    'export { Dialog } from "./Dialog";',
    "entry",
  ],
  [
    "src/components/task-dialog/index.tsx",
    "export function TaskDialog() { return <div />; }",
    "entry",
  ],
  [
    "src/components/TaskDialog.tsx",
    "export function taskDialog() { return <div />; }",
    "component",
  ],
  [
    "src/components/TaskDialog.tsx",
    "const taskDialog = () => <div />; export { taskDialog };",
    "component",
  ],
  [
    "src/components/TaskDialog.tsx",
    "export const taskDialog = memo(() => <div />);",
    "component",
  ],
  [
    "src/components/TaskDialog.tsx",
    "export const taskDialog = React.forwardRef(() => null);",
    "component",
  ],
  [
    "src/components/TaskDialog.tsx",
    "function TaskDialog() { return <div />; } export { TaskDialog as taskDialog };",
    "component",
  ],
  [
    "src/components/TaskDialog.tsx",
    "export default () => <div />;",
    "anonymous",
  ],
  [
    "src/components/TaskDialog.tsx",
    "export default memo(() => <div />);",
    "anonymous",
  ],
  [
    "src/main.tsx",
    "function App() { return <div />; } createRoot(root).render(<App />);",
    "bootstrap",
  ],
  ["src/main.test.tsx", "export const App = () => <div />;", "filename"],
  ["src/index.stories.tsx", "export const App = () => <div />;", "filename"],
] as const;

for (const [filename, source, messageId] of invalid) {
  await test(`拒绝 ${messageId}：${filename} — ${source.slice(0, 45)}`, () => {
    const messages = lint(filename, source);
    assert.ok(
      messages.some(
        (message) =>
          message.ruleId === "local/react-naming" &&
          message.messageId === messageId,
      ),
      JSON.stringify(messages),
    );
    assert.ok(
      messages.every((message) => !message.fatal),
      JSON.stringify(messages),
    );
  });
}
