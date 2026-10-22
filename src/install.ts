import { AppError } from "./errors.js";
import { safePath, statIfExists } from "./project.js";
import type { LoadedRegistry } from "./registry.js";
import { discoverSkills } from "./skills.js";
import { transact } from "./transaction.js";
import type { WriteContent } from "./transaction.js";
import { agentPaths } from "./schema.js";
import type { Agent } from "./schema.js";

export async function planSkills(
  root: string,
  registry: LoadedRegistry,
  names: string[],
  agent: Agent,
) {
  const installed = await discoverSkills(root, agent);
  const items: {
    name: string;
    target: string;
    action: "install" | "unchanged";
  }[] = [];
  const files: { path: string; content: string }[] = [];
  const reserveDirs: string[] = [];
  for (const name of new Set(names)) {
    const skill = registry.data.skills.find((item) => item.name === name);
    if (!skill)
      throw new AppError(
        "UNKNOWN_SKILL",
        `找不到 Skill：${name}。使用 lt list 查看可用名称。`,
        2,
      );
    const existing = installed.find((item) => item.name === name);
    if (existing) {
      items.push({ name, target: existing.path, action: "unchanged" });
      continue;
    }
    const target = `${agentPaths[agent]}/${name}`;
    if (await statIfExists(await safePath(root, target)))
      throw new AppError("CONFLICT", `目标目录已存在，未覆盖：${target}`);
    reserveDirs.push(target);
    files.push(
      ...skill.files.map((file) => ({
        path: `${target}/${file.path}`,
        content: file.content,
      })),
    );
    items.push({ name, target, action: "install" });
  }
  return { files, reserveDirs, items };
}

export async function install(
  root: string,
  registry: LoadedRegistry,
  names: string[],
  agent: Agent,
  dryRun = false,
  writeContent?: WriteContent,
) {
  if (!names.length)
    throw new AppError("MISSING_SKILLS", "至少选择一个 Skill", 2);
  const result = await transact(
    root,
    () => planSkills(root, registry, names, agent),
    dryRun,
    writeContent,
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
