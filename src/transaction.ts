import { mkdir, open, rm, rmdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { AppError, isErrno } from "./errors.js";
import { safePath, statIfExists } from "./project.js";
import type { FileHandle } from "node:fs/promises";

export type WriteContent = (
  handle: FileHandle,
  content: string,
) => Promise<void>;

export interface ChangePlan {
  files: { path: string; content: string }[];
  reserveDirs: string[];
}

async function ensureDir(root: string, path: string, created: string[]) {
  await safePath(root, relative(root, path).split("\\").join("/"));
  const existing = await statIfExists(path);
  if (existing) {
    if (!existing.isDirectory())
      throw new AppError("PATH_CONFLICT", `目标不是目录：${path}`);
    return;
  }
  if (dirname(path) !== root) await ensureDir(root, dirname(path), created);
  await mkdir(path);
  created.push(path);
}

export async function transact<T extends ChangePlan>(
  root: string,
  prepare: () => Promise<T>,
  dryRun = false,
  writeContent: WriteContent = (handle, content) => handle.writeFile(content),
): Promise<T> {
  const initial = await prepare();
  if (dryRun || !initial.files.length) return initial;
  const dirs: string[] = [];
  const files: string[] = [];
  const lockPath = await safePath(root, ".lt-install.lock");
  let locked = false;
  let committed = false;
  let current = initial;
  let failed = false;
  let failure: unknown;
  try {
    if (!(await statIfExists(root))) {
      await mkdir(root);
      dirs.push(root);
    }
    try {
      const lock = await open(lockPath, "wx");
      locked = true;
      try {
        await lock.writeFile(`${process.pid}\n`);
      } finally {
        await lock.close();
      }
    } catch (error) {
      if (isErrno(error, "EEXIST"))
        throw new AppError(
          "LOCKED",
          "已有安装锁，请等待当前安装完成；残留锁需确认无进程运行后人工清理。",
        );
      throw error;
    }
    current = await prepare();
    if (current.files.length) {
      for (const directory of current.reserveDirs) {
        const target = await safePath(root, directory);
        await ensureDir(root, dirname(target), dirs);
        await mkdir(target);
        dirs.push(target);
      }
      for (const file of current.files) {
        const path = await safePath(root, file.path);
        if (dirname(path) !== root) await ensureDir(root, dirname(path), dirs);
        const handle = await open(path, "wx");
        files.push(path);
        try {
          await writeContent(handle, file.content);
        } finally {
          await handle.close();
        }
      }
      committed = true;
    }
  } catch (error) {
    failed = true;
    failure = error;
  }

  const cleanupErrors: unknown[] = [];
  async function cleanup(operation: () => Promise<void>) {
    try {
      await operation();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (!committed) {
    for (const file of files.reverse()) {
      await cleanup(() => rm(file));
    }
  }
  if (locked) await cleanup(() => rm(lockPath));
  for (const dir of [...dirs].reverse()) {
    await cleanup(async () => {
      try {
        await rmdir(dir);
      } catch (error) {
        if (
          !isErrno(error, "ENOTEMPTY") &&
          !isErrno(error, "ENOENT") &&
          !isErrno(error, "EEXIST")
        ) {
          throw error;
        }
      }
    });
  }
  if (cleanupErrors.length) {
    const describe = (error: unknown) =>
      error instanceof Error ? error.message : String(error);
    const context = failed
      ? `安装失败：${describe(failure)}。`
      : "安装已完成，但";
    throw new AggregateError(
      failed ? [failure, ...cleanupErrors] : cleanupErrors,
      `${context}回滚或清理失败：${cleanupErrors.map(describe).join("；")}`,
      failed ? { cause: failure } : undefined,
    );
  }
  if (failed) throw failure;
  return current;
}
