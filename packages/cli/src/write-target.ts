import { basename, dirname, join, resolve } from "node:path";
import { AppError } from "./errors.js";
import { projectRoot, statIfExists } from "./project.js";
import type { Prompts } from "./prompts.js";

export type WriteTargetChoice =
  { mode: "current" } | { mode: "new"; name: string };

export function validateDirectoryName(name: string | undefined) {
  if (!name?.trim()) return "请输入新文件夹名称";
  if (
    name === "." ||
    name === ".." ||
    /[/\\]/.test(name) ||
    name.includes("\0")
  )
    return "请输入单个文件夹名称，不支持路径或 .、..";
  return undefined;
}

export async function resolveWriteTarget(
  cwd: string | undefined,
  ui: Prompts | undefined,
): Promise<string> {
  let target: string;
  if (cwd !== undefined) {
    if (!cwd.trim())
      throw new AppError("INVALID_ARGUMENT", "--cwd 不能为空", 2);
    target = resolve(cwd);
  } else {
    if (!ui)
      throw new AppError(
        "MISSING_ARGUMENT",
        "写入操作需要显式指定 --cwd。示例：lt add skill web-ui --agent codex --cwd . --non-interactive；新目录可使用 --cwd ./my-app。",
        2,
      );
    const current = await projectRoot(process.cwd());
    const choice = await ui.writeTarget(current);
    if (choice.mode === "current") return current;
    const name = choice.name.trim();
    const issue = validateDirectoryName(name);
    if (issue) throw new AppError("INVALID_ARGUMENT", issue, 2);
    target = join(current, name);
    if (await statIfExists(target))
      throw new AppError(
        "PATH_CONFLICT",
        `新文件夹已存在：${target}。请使用其他名称，或通过 --cwd 指定已有目录。`,
        2,
      );
  }
  if (await statIfExists(target)) return projectRoot(target);
  return join(await projectRoot(dirname(target)), basename(target));
}
