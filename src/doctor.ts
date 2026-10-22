import { readdir } from "node:fs/promises";
import { discoverSkills } from "./skills.js";
import { safePath, statIfExists } from "./project.js";
import { agentPaths } from "./schema.js";
import type { Agent } from "./schema.js";

export async function doctor(root: string) {
  const checks: { name: string; ok: boolean; issues: string[] }[] = [];
  if (await statIfExists(await safePath(root, ".lt-install.lock")))
    checks.push({
      name: "install.lock",
      ok: false,
      issues: [
        "发现安装锁；确认没有安装进程运行后才能手动删除 .lt-install.lock",
      ],
    });
  for (const agent of ["codex", "claude"] as Agent[]) {
    try {
      const skills = await discoverSkills(root, agent);
      checks.push(
        ...skills.map((skill) => ({
          name: `${agent}/${skill.name}`,
          ok: true,
          issues: [] as string[],
        })),
      );
      const directory = await safePath(root, agentPaths[agent]);
      if (await statIfExists(directory))
        for (const entry of await readdir(directory, { withFileTypes: true }))
          if (
            entry.isDirectory() &&
            !skills.some(
              (skill) => skill.path === `${agentPaths[agent]}/${entry.name}`,
            )
          )
            checks.push({
              name: `${agent}/${entry.name}`,
              ok: false,
              issues: ["缺少 SKILL.md"],
            });
    } catch (error) {
      checks.push({
        name: agent,
        ok: false,
        issues: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  return {
    command: "doctor",
    ok: checks.every((check) => check.ok),
    root,
    checks,
  };
}
