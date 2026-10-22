import "./fixtures/setup.js";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { execute, render } from "../src/commands.js";
import { install } from "../src/install.js";
import { loadRegistry } from "../src/registry.js";
import { discoverSkills } from "../src/skills.js";
import type { Prompts } from "../src/prompts.js";

async function temp(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "lt-skill-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

await test("按 SKILL.md 的 name 识别，支持不同目录名和 YAML 引号", async (t) => {
  const root = await temp(t);
  const path = ".agents/skills/local-copy";
  await mkdir(join(root, path), { recursive: true });
  const content =
    '---\r\nname: "forms" # 本地安装\r\ndescription: 表单\r\n---\r\n用户内容';
  await writeFile(join(root, path, "SKILL.md"), content);
  await mkdir(join(root, ".agents/skills/empty"));
  await mkdir(join(root, ".claude/skills/forms"), { recursive: true });
  await writeFile(
    join(root, ".claude/skills/forms/SKILL.md"),
    "---\nname: forms\n---\nClaude 内容",
  );
  const result = await execute("list", undefined, [], { cwd: root }, undefined);
  assert.ok("skills" in result);
  assert.deepEqual(result.skills.find((s) => s.name === "forms")?.installed, [
    { agent: "codex", path },
    {
      agent: "claude",
      path: ".claude/skills/forms",
    },
  ]);
  assert.match(render(result), /已安装：codex, claude/);
  const filtered = await execute(
    "list",
    undefined,
    [],
    { cwd: root, agent: "codex" },
    undefined,
  );
  assert.ok("skills" in filtered);
  assert.equal(
    filtered.skills.find((s) => s.name === "forms")?.installed.length,
    1,
  );
  const unexpected = async (): Promise<never> => {
    throw new Error("不应调用此交互");
  };
  const ui: Prompts = {
    action: unexpected,
    kind: unexpected,
    agent: unexpected,
    writeTarget: unexpected,
    assets: unexpected,
    packageManager: unexpected,
    async skills(_available, installed) {
      assert.deepEqual(installed, ["forms"]);
      return ["tables"];
    },
  };
  await execute(
    "add",
    "skill",
    [],
    { cwd: root, agent: "codex", dryRun: true },
    ui,
  );
  const repeated = await install(
    root,
    await loadRegistry(),
    ["forms"],
    "codex",
  );
  assert.equal(repeated.items[0]?.action, "unchanged");
  assert.equal(repeated.items[0]?.target, path);
  assert.deepEqual(await readdir(join(root, ".agents/skills")), [
    "empty",
    "local-copy",
  ]);
  assert.deepEqual(await readdir(root), [".agents", ".claude"]);
  assert.equal(await readFile(join(root, path, "SKILL.md"), "utf8"), content);
});

await test("SKILL.md 已删除时不标记已安装", async (t) => {
  const root = await temp(t);
  await install(root, await loadRegistry(), ["forms"], "codex");
  await rm(join(root, ".agents/skills/forms/SKILL.md"));
  const result = await execute("list", undefined, [], { cwd: root }, undefined);
  assert.ok("skills" in result);
  assert.deepEqual(
    result.skills.find((s) => s.name === "forms")?.installed,
    [],
  );
});

await test("实际安装状态不依赖版本记录", async (t) => {
  const root = await temp(t);
  const registry = await loadRegistry();
  await install(root, registry, ["forms"], "codex");
  const result = await execute("list", undefined, [], { cwd: root }, undefined);
  assert.ok("skills" in result);
  assert.deepEqual(result.skills.find((s) => s.name === "forms")?.installed, [
    {
      agent: "codex",
      path: ".agents/skills/forms",
    },
  ]);
});

await test("无效元数据和符号链接显性失败，不伪造已安装状态", async (t) => {
  const root = await temp(t);
  const directory = join(root, ".agents/skills/forms");
  await mkdir(directory, { recursive: true });
  for (const content of [
    "无元数据",
    "---\nname: [\n---\n",
    "---\ndescription: test\n---\n",
  ]) {
    await writeFile(join(directory, "SKILL.md"), content);
    await assert.rejects(
      discoverSkills(root),
      /Skill .*元数据|Skill 缺少有效 name/,
    );
  }
  await rm(join(directory, "SKILL.md"));
  await symlink(join(root, "outside.md"), join(directory, "SKILL.md"));
  await assert.rejects(discoverSkills(root), /符号链接/);
});
