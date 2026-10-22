import { readFile, readdir } from "node:fs/promises";
import { parse } from "yaml";
import { AppError } from "./errors.js";
import { safePath, statIfExists } from "./project.js";
import { agentPaths } from "./schema.js";
import type { Agent } from "./schema.js";

export interface LocalSkill {
  name: string;
  agent: Agent;
  path: string;
}

export async function discoverSkills(
  root: string,
  agent?: Agent,
): Promise<LocalSkill[]> {
  const skills: LocalSkill[] = [];
  const agents: Agent[] = agent ? [agent] : ["codex", "claude"];
  for (const current of agents) {
    const prefix = agentPaths[current];
    const directory = await safePath(root, prefix);
    if (!(await statIfExists(directory))) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      // Keep the existing policy against following links outside the target.
      if (entry.isSymbolicLink())
        await safePath(root, `${prefix}/${entry.name}`);
      if (!entry.isDirectory()) continue;
      const path = `${prefix}/${entry.name}`;
      const file = await safePath(root, `${path}/SKILL.md`);
      const stat = await statIfExists(file);
      if (!stat) continue;
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
        throw new AppError(
          "INVALID_SKILL",
          `无法读取 Skill 元数据：${path}/SKILL.md`,
          2,
        );
      const content = await readFile(file, "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(
        content,
      );
      if (!frontmatter)
        throw new AppError(
          "INVALID_SKILL",
          `Skill 缺少 YAML 元数据：${path}/SKILL.md`,
          2,
        );
      let metadata: unknown;
      try {
        metadata = parse(frontmatter[1]!, { maxAliasCount: 0 });
      } catch (error) {
        throw new AppError(
          "INVALID_SKILL",
          `Skill 元数据解析失败：${path}/SKILL.md；${error instanceof Error ? error.message : String(error)}`,
          2,
        );
      }
      if (
        !metadata ||
        typeof metadata !== "object" ||
        !("name" in metadata) ||
        typeof metadata.name !== "string" ||
        !metadata.name.trim()
      )
        throw new AppError(
          "INVALID_SKILL",
          `Skill 缺少有效 name：${path}/SKILL.md`,
          2,
        );
      skills.push({ name: metadata.name, agent: current, path });
    }
  }
  return skills;
}
