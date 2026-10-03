import { rename } from "node:fs/promises";
import { AppError } from "./errors.js";
import {
  destination,
  inspectInstallation,
  readManifest,
  safePath,
  statIfExists,
} from "./project.js";
import type { LoadedRegistry } from "./registry.js";
import { transact } from "./transaction.js";
import type { Agent, Installation } from "./schema.js";

interface PlanItem {
  name: string;
  target: string;
  action: "install" | "unchanged";
}

async function plan(
  root: string,
  registry: LoadedRegistry,
  names: string[],
  agent: Agent,
) {
  const manifest = await readManifest(root);
  const items: PlanItem[] = [];
  const additions: Installation[] = [];
  for (const name of new Set(names)) {
    const skill = registry.data.skills.find((item) => item.name === name);
    if (!skill)
      throw new AppError(
        "UNKNOWN_SKILL",
        `找不到 Skill：${name}。使用 lt list 查看可用名称。`,
        2,
      );
    const record: Installation = {
      name,
      agent,
      version: registry.data.version,
      source: registry.source,
      sourceSha256: registry.sha256,
      files: skill.files.map(({ path, sha256 }) => ({ path, sha256 })),
    };
    const target = destination(record);
    const existing = manifest.installations.find(
      (entry) => entry.name === name && entry.agent === agent,
    );
    const path = await safePath(root, target);
    if (existing) {
      const issues = await inspectInstallation(root, existing);
      const sameFiles =
        existing.files.length === record.files.length &&
        existing.files.every((file) =>
          record.files.some(
            (next) => next.path === file.path && next.sha256 === file.sha256,
          ),
        );
      if (issues.length || existing.version !== record.version || !sameFiles) {
        throw new AppError(
          "CONFLICT",
          `${target} 与安装目标存在差异，未覆盖。${issues.join("；")} 请先审查本地和上游差异。`,
        );
      }
      items.push({ name, target, action: "unchanged" });
    } else {
      if (await statIfExists(path))
        throw new AppError(
          "CONFLICT",
          `目标已存在且不受 CLI 管理，未覆盖：${target}`,
        );
      additions.push(record);
      items.push({ name, target, action: "install" });
    }
  }
  return { manifest, items, additions };
}

export async function install(
  root: string,
  registry: LoadedRegistry,
  names: string[],
  agent: Agent,
  dryRun = false,
  commitManifest: typeof rename = rename,
) {
  if (!names.length)
    throw new AppError("MISSING_SKILLS", "至少选择一个 Skill", 2);
  const result = await transact(
    root,
    async () => {
      const current = await plan(root, registry, names, agent);
      return {
        manifest: {
          ...current.manifest,
          installations: [
            ...current.manifest.installations,
            ...current.additions,
          ],
        },
        reserveDirs: current.additions.map(destination),
        files: current.additions.flatMap((record) =>
          registry.data.skills
            .find((skill) => skill.name === record.name)!
            .files.map((file) => ({
              path: `${destination(record)}/${file.path}`,
              content: file.content,
            })),
        ),
        items: current.items,
      };
    },
    dryRun,
    commitManifest,
  );
  return {
    command: "add",
    ok: true,
    root,
    version: registry.data.version,
    source: registry.source,
    sourceSha256: registry.sha256,
    dryRun,
    items: result.items,
  };
}
