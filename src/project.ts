import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AppError, isErrno } from "./errors.js";
import {
  agentPaths,
  manifestSchema,
  parseData,
  parseJson,
  sha256,
} from "./schema.js";
import type { Installation, Manifest, ProjectAsset } from "./schema.js";

export async function projectRoot(cwd: string): Promise<string> {
  const root = await realpath(resolve(cwd));
  if (!(await lstat(root)).isDirectory())
    throw new AppError("INVALID_PROJECT", `目标不是目录：${root}`, 2);
  return root;
}

export async function statIfExists(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }
}

// The caller supplies only fixed internal paths or schema-validated asset paths.
export async function safePath(
  root: string,
  relative: string,
): Promise<string> {
  const parts = relative.split("/");
  let path = root;
  for (const [index, part] of parts.entries()) {
    if (!part || part === "." || part === ".." || part.includes("\\"))
      throw new AppError("UNSAFE_PATH", `非法路径：${relative}`);
    path = join(path, part);
    const stat = await statIfExists(path);
    if (stat?.isSymbolicLink())
      throw new AppError("UNSAFE_PATH", `拒绝符号链接：${path}`);
    if (stat && index < parts.length - 1 && !stat.isDirectory())
      throw new AppError("PATH_CONFLICT", `路径不是目录：${path}`);
  }
  return path;
}

export async function readManifest(root: string): Promise<Manifest> {
  const path = await safePath(root, ".agent-base/manifest.json");
  if (!(await statIfExists(path)))
    return { schemaVersion: 1, installations: [], assets: [] };
  return parseData(
    manifestSchema,
    parseJson(await readFile(path, "utf8"), "安装记录"),
    "安装记录",
  );
}

export function destination(
  record: Pick<Installation, "name" | "agent">,
): string {
  return `${agentPaths[record.agent]}/${record.name}`;
}

export async function inspectInstallation(
  root: string,
  record: Installation,
): Promise<string[]> {
  const relative = destination(record);
  const path = await safePath(root, relative);
  const stat = await statIfExists(path);
  if (!stat) return [`缺少目录：${relative}`];
  if (!stat.isDirectory()) return [`应为目录：${relative}`];
  const actual = new Set<string>();
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const name = `${prefix}${item.name}`;
      if (item.isSymbolicLink())
        throw new AppError("UNSAFE_PATH", `拒绝符号链接：${relative}/${name}`);
      if (item.isDirectory()) await walk(join(dir, item.name), `${name}/`);
      else if (item.isFile()) actual.add(name);
      else
        throw new AppError(
          "UNSAFE_PATH",
          `不支持的文件类型：${relative}/${name}`,
        );
    }
  }
  await walk(path, "");
  const issues: string[] = [];
  for (const file of record.files) {
    if (!actual.delete(file.path))
      issues.push(`缺少文件：${relative}/${file.path}`);
    else if (
      sha256(
        await readFile(await safePath(root, `${relative}/${file.path}`)),
      ) !== file.sha256
    )
      issues.push(`内容已修改：${relative}/${file.path}`);
  }
  for (const name of actual) issues.push(`额外文件：${relative}/${name}`);
  return issues;
}

export async function doctor(root: string) {
  const manifest = await readManifest(root);
  const checks: { name: string; ok: boolean; issues: string[] }[] = [];
  if (await statIfExists(await safePath(root, ".agent-base/install.lock"))) {
    checks.push({
      name: "install.lock",
      ok: false,
      issues: [
        "发现安装锁；确认没有安装进程运行后才能手动删除 .agent-base/install.lock",
      ],
    });
  }
  for (const record of manifest.installations) {
    try {
      const issues = await inspectInstallation(root, record);
      checks.push({
        name: `${record.agent}/${record.name}`,
        ok: issues.length === 0,
        issues,
      });
    } catch (error) {
      checks.push({
        name: `${record.agent}/${record.name}`,
        ok: false,
        issues: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  for (const record of manifest.assets) {
    try {
      const issues = await inspectAsset(root, record);
      checks.push({
        name: `${record.type}/${record.name}`,
        ok: issues.length === 0,
        issues,
      });
    } catch (error) {
      checks.push({
        name: `${record.type}/${record.name}`,
        ok: false,
        issues: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  const unmanaged: string[] = [];
  for (const [agent, prefix] of Object.entries(agentPaths)) {
    const path = await safePath(root, prefix);
    if (!(await statIfExists(path))) continue;
    for (const entry of await readdir(path)) {
      if (
        !manifest.installations.some(
          (record) => record.agent === agent && record.name === entry,
        )
      )
        unmanaged.push(`${prefix}/${entry}`);
    }
  }
  return {
    command: "doctor",
    ok: checks.every((check) => check.ok),
    root,
    initialized: manifest.installations.length + manifest.assets.length > 0,
    checks,
    unmanaged,
  };
}

export async function inspectAsset(
  root: string,
  record: ProjectAsset,
): Promise<string[]> {
  const issues: string[] = [];
  for (const file of record.files) {
    const path = await safePath(root, file.path);
    const stat = await statIfExists(path);
    if (!stat?.isFile()) issues.push(`缺少文件或类型错误：${file.path}`);
    else if (sha256(await readFile(path)) !== file.sha256)
      issues.push(`内容已修改：${file.path}`);
  }
  return issues;
}
