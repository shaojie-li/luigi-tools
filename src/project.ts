import { lstat, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AppError, isErrno } from "./errors.js";

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
