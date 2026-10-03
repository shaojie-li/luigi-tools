import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// This bootstrap uses Node built-ins only, so it can run before installing devDependencies.
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

const path = resolve("package.json");
const metadata = await lstat(path);
if (!metadata.isFile() || metadata.isSymbolicLink()) {
  throw new Error("package.json 必须是普通文件，不能是符号链接。未写入文件。");
}
const original = await readFile(path, "utf8");
const pkg = object(JSON.parse(original), "package.json");
const required = object(
  JSON.parse(
    await readFile(new URL("./project-config.json", import.meta.url), "utf8"),
  ),
  "project-config.json",
);
if (pkg.type !== "module") {
  throw new Error(
    "此预设用于 TypeScript ESM 项目，请先明确将 package.json 的 type 设为 module。未写入文件。",
  );
}
const conflicts: string[] = [];
for (const field of ["scripts", "devDependencies", "lint-staged"]) {
  const current = object(pkg[field] ?? {}, field);
  const additions = object(required[field], field);
  for (const [name, value] of Object.entries(additions)) {
    if (current[name] !== undefined && current[name] !== value) {
      conflicts.push(
        `${field}.${name}: 当前 ${JSON.stringify(current[name])}，预设 ${JSON.stringify(value)}`,
      );
    }
  }
  pkg[field] = { ...additions, ...current };
}
if (conflicts.length) {
  throw new Error(
    `检测到已有配置冲突，请审查并手动合并后重试。未写入文件。\n${conflicts.join("\n")}`,
  );
}
const next = `${JSON.stringify(pkg, null, 2)}\n`;
if (next !== original) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, next, { flag: "wx", mode: metadata.mode });
    // Best-effort conflict detection; rename keeps a failed write from truncating the original.
    const current = await lstat(path);
    if (
      current.isSymbolicLink() ||
      (await readFile(path, "utf8")) !== original
    ) {
      throw new Error("package.json 已被其他进程修改，请重试。");
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
console.log(
  "已补齐质量检查脚本和开发依赖。接下来运行 npm install；已有 Git 仓库会自动启用 Husky。",
);
