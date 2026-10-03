import {
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { AppError, isErrno } from "./errors.js";
import { safePath, statIfExists } from "./project.js";
import type { Manifest } from "./schema.js";

export interface ChangePlan {
  manifest: Manifest;
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
  commitManifest: typeof rename = rename,
): Promise<T> {
  const initial = await prepare();
  if (dryRun || !initial.files.length) return initial;
  const dirs: string[] = [];
  const files: string[] = [];
  const stateDir = await safePath(root, ".agent-base");
  const lockPath = await safePath(root, ".agent-base/install.lock");
  let locked = false;
  let stage: string | undefined;
  let committed = false;
  let current = initial;
  let failed = false;
  let failure: unknown;
  try {
    await ensureDir(root, stateDir, dirs);
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
      stage = await mkdtemp(join(stateDir, "stage-"));
      await writeFile(
        join(stage, "manifest.json"),
        `${JSON.stringify(current.manifest, null, 2)}\n`,
        { flag: "wx" },
      );
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
          await handle.writeFile(file.content);
        } finally {
          await handle.close();
        }
      }
      await commitManifest(
        join(stage, "manifest.json"),
        await safePath(root, ".agent-base/manifest.json"),
      );
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
  if (stage) {
    const stageDirectory = stage;
    await cleanup(() => rm(stageDirectory, { recursive: true, force: true }));
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
