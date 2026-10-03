import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { execute } from "../src/commands.js";
import { install } from "../src/install.js";
import { doctor, projectRoot, readManifest } from "../src/project.js";
import { loadRegistry } from "../src/registry.js";
import { parseData, registrySchema, sha256 } from "../src/schema.js";
import type { Registry } from "../src/schema.js";
import { installAssets } from "../src/assets.js";

const cli = fileURLToPath(new URL("../src/index.ts", import.meta.url));
async function temp(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), "agent-base-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return projectRoot(path);
}
function run(cwd: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), cli, ...args],
        { cwd, env: { ...process.env, CI: "1" }, timeout: 15_000 },
        (error, stdout, stderr) => {
          resolve({
            code: error ? Number(error.code) || 1 : 0,
            stdout,
            stderr,
          });
        },
      );
    },
  );
}

await test("list 输出可解析 JSON；未知参数和缺失参数不会等待输入", async (t) => {
  const root = await temp(t);
  const listed = await run(root, ["list", "--json"]);
  assert.equal(listed.code, 0);
  assert.equal(listed.stderr, "");
  assert.deepEqual(
    JSON.parse(listed.stdout).skills.map(
      (skill: { name: string }) => skill.name,
    ),
    ["web-ui", "forms", "tables", "github-projects"],
  );
  for (const args of [
    ["--json"],
    ["add", "skill", "--agent", "codex", "--json"],
    ["list", "--wat", "--json"],
  ]) {
    const result = await run(root, args);
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal(result.stderr, "");
  }
  assert.deepEqual(await readdir(root), []);
});

await test("完整命令在仓库外安装；重复安装保持 manifest 和文件内容不变", async (t) => {
  const root = await temp(t);
  const args = [
    "add",
    "skill",
    "web-ui",
    "forms",
    "--agent",
    "codex",
    "--json",
  ];
  assert.equal((await run(root, args)).code, 0);
  const before = await readFile(
    join(root, ".agent-base/manifest.json"),
    "utf8",
  );
  assert.match(
    await readFile(join(root, ".agents/skills/web-ui/SKILL.md"), "utf8"),
    /name: web-ui/,
  );
  const result = await run(root, args);
  assert.equal(result.code, 0);
  assert.ok(
    JSON.parse(result.stdout).items.every(
      (item: { action: string }) => item.action === "unchanged",
    ),
  );
  assert.equal(
    await readFile(join(root, ".agent-base/manifest.json"), "utf8"),
    before,
  );
  assert.equal((await doctor(root)).ok, true);
});

await test("dry-run 零写入并展示精确目标", async (t) => {
  const root = await temp(t);
  const result = await run(root, [
    "add",
    "skill",
    "forms",
    "--agent",
    "claude",
    "--dry-run",
    "--json",
  ]);
  assert.equal(result.code, 0);
  assert.equal(
    JSON.parse(result.stdout).items[0].target,
    ".claude/skills/forms",
  );
  assert.deepEqual(await readdir(root), []);
});

await test("不接管已有目录；多 Skill 冲突时整批不写入", async (t) => {
  const root = await temp(t);
  await mkdir(join(root, ".agents/skills/forms"), { recursive: true });
  await writeFile(join(root, ".agents/skills/forms/SKILL.md"), "用户文件");
  const registry = await loadRegistry();
  await assert.rejects(
    install(root, registry, ["web-ui", "forms"], "codex"),
    /不受 CLI 管理/,
  );
  assert.deepEqual(await readdir(join(root, ".agents/skills")), ["forms"]);
  assert.equal(
    await readFile(join(root, ".agents/skills/forms/SKILL.md"), "utf8"),
    "用户文件",
  );
  assert.deepEqual(await readdir(root), [".agents"]);
});

await test("doctor 检测修改、删除和额外文件；add 不覆盖本地修改", async (t) => {
  const root = await temp(t);
  const registry = await loadRegistry();
  await install(root, registry, ["web-ui", "forms"], "codex");
  await writeFile(join(root, ".agents/skills/web-ui/SKILL.md"), "本地修改");
  await rm(join(root, ".agents/skills/forms/SKILL.md"));
  await writeFile(join(root, ".agents/skills/forms/local.txt"), "自定义");
  const result = await run(root, ["doctor", "--json"]);
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.match(JSON.stringify(report), /内容已修改/);
  assert.match(JSON.stringify(report), /缺少文件/);
  assert.match(JSON.stringify(report), /额外文件/);
  await assert.rejects(install(root, registry, ["web-ui"], "codex"), /未覆盖/);
  assert.equal(
    await readFile(join(root, ".agents/skills/web-ui/SKILL.md"), "utf8"),
    "本地修改",
  );
});

await test("符号链接无法把写入导向项目之外", async (t) => {
  const root = await temp(t);
  const outside = await temp(t);
  await symlink(outside, join(root, ".agents"), "dir");
  await assert.rejects(
    install(root, await loadRegistry(), ["forms"], "codex"),
    /符号链接/,
  );
  assert.deepEqual(await readdir(outside), []);
});

await test("非法安装记录拒绝读取外部路径", async (t) => {
  const root = await temp(t);
  await mkdir(join(root, ".agent-base"));
  await writeFile(
    join(root, ".agent-base/manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      installations: [{ name: "../outside" }],
    }),
  );
  await assert.rejects(doctor(root), /安装记录不合法/);
});

await test("提交 manifest 失败后回滚整批写入并保留已有记录", async (t) => {
  const root = await temp(t);
  const registry = await loadRegistry();
  await install(root, registry, ["web-ui"], "codex");
  const before = await readFile(
    join(root, ".agent-base/manifest.json"),
    "utf8",
  );
  await assert.rejects(
    install(root, registry, ["forms", "tables"], "codex", false, async () => {
      throw new Error("模拟磁盘写入失败");
    }),
    /模拟磁盘/,
  );
  assert.deepEqual(await readdir(join(root, ".agents/skills")), ["web-ui"]);
  assert.deepEqual(await readdir(join(root, ".agent-base")), ["manifest.json"]);
  assert.equal(
    await readFile(join(root, ".agent-base/manifest.json"), "utf8"),
    before,
  );
  assert.equal((await doctor(root)).ok, true);
});

await test("首次安装失败不留下中间文件或空目录", async (t) => {
  const root = await temp(t);
  await assert.rejects(
    install(
      root,
      await loadRegistry(),
      ["forms"],
      "claude",
      false,
      async () => {
        throw new Error("失败");
      },
    ),
  );
  assert.deepEqual(await readdir(root), []);
});

await test("安装锁拒绝并发写入且不删除其他进程的锁", async (t) => {
  const root = await temp(t);
  await mkdir(join(root, ".agent-base"));
  await writeFile(join(root, ".agent-base/install.lock"), "123");
  await assert.rejects(
    install(root, await loadRegistry(), ["forms"], "codex"),
    /安装锁/,
  );
  assert.equal(
    await readFile(join(root, ".agent-base/install.lock"), "utf8"),
    "123",
  );
  assert.equal((await doctor(root)).ok, false);
  assert.deepEqual(await readdir(root), [".agent-base"]);
});

await test("交互收集的选择与完整命令执行同一安装逻辑", async (t) => {
  const root = await temp(t);
  const calls: string[] = [];
  const result = await execute(
    undefined,
    undefined,
    [],
    { cwd: root },
    {
      async action() {
        calls.push("action");
        return "add";
      },
      async kind() {
        calls.push("kind");
        return "skill";
      },
      async assets() {
        return [];
      },
      async agent() {
        calls.push("agent");
        return "claude";
      },
      async skills() {
        calls.push("skills");
        return ["forms", "tables"];
      },
    },
  );
  assert.deepEqual(calls, ["action", "kind", "agent", "skills"]);
  assert.equal(result.ok, true);
  assert.equal((await readManifest(root)).installations.length, 2);
});

await test("恰好一个 Agent 配置时可检测；选择中途取消零写入", async (t) => {
  const root = await temp(t);
  await mkdir(join(root, ".claude"));
  await execute("add", "skill", ["forms"], { cwd: root }, undefined);
  assert.equal((await readManifest(root)).installations[0]?.agent, "claude");
  const empty = await temp(t);
  await assert.rejects(
    execute(
      "add",
      "skill",
      [],
      { cwd: empty },
      {
        async action() {
          return "add";
        },
        async kind() {
          return "skill";
        },
        async assets() {
          return [];
        },
        async agent() {
          return "codex";
        },
        async skills() {
          throw new Error("取消选择");
        },
      },
    ),
    /取消选择/,
  );
  assert.deepEqual(await readdir(empty), []);
});

await test("版本变化通过 add 明确拒绝，不实现隐式升级", async (t) => {
  const root = await temp(t);
  const registry = await loadRegistry();
  await install(root, registry, ["forms"], "codex");
  await assert.rejects(
    install(
      root,
      { ...registry, data: { ...registry.data, version: "0.2.0" } },
      ["forms"],
      "codex",
    ),
    /存在差异/,
  );
});

await test("目录 schema 拒绝穿越、重复、大小写碰撞和摘要篡改", async () => {
  const original = (await loadRegistry()).data;
  const change = (mutate: (registry: Registry) => void) => {
    const data = structuredClone(original);
    mutate(data);
    assert.throws(() => parseData(registrySchema, data, "目录"));
  };
  for (const path of [
    "../outside",
    "/absolute",
    "a/../../b",
    "a\\b",
    "con.txt",
    "a.",
  ])
    change((data) => {
      data.skills[0]!.files[0]!.path = path;
    });
  change((data) => {
    data.skills[0]!.files[0]!.content += "tampered";
  });
  change((data) => {
    data.skills.push(data.skills[0]!);
  });
  change((data) => {
    data.skills[0]!.files.push({
      ...data.skills[0]!.files[0]!,
      path: "skill.md",
    });
  });
});

await test("HTTPS 目录校验摘要、超时配置、失败状态、体积上限与协议", async () => {
  const payload = JSON.stringify((await loadRegistry()).data);
  const fetcher: typeof fetch = async (_input, init) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    return new Response(payload);
  };
  const registry = await loadRegistry(
    "https://example.test/v1/index.json",
    sha256(payload),
    fetcher,
  );
  assert.equal(registry.source, "https://example.test/v1/index.json");
  await assert.rejects(
    loadRegistry("https://example.test/index.json", "0".repeat(64), fetcher),
    /摘要/,
  );
  await assert.rejects(
    loadRegistry("http://example.test/index.json", undefined, fetcher),
    /HTTPS/,
  );
  await assert.rejects(
    loadRegistry(
      "https://example.test/index.json",
      undefined,
      async () => new Response("", { status: 500 }),
    ),
    /HTTP 500/,
  );
  await assert.rejects(
    loadRegistry(
      "https://example.test/index.json",
      undefined,
      async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    ),
    /2 MB/,
  );
  await assert.rejects(
    loadRegistry("https://example.test/index.json", undefined, async () => {
      throw new Error("网络断开");
    }),
    /网络断开/,
  );
});

await test("完整命令可以从指定本地目录快照安装附带资源", async (t) => {
  const root = await temp(t);
  const sourceRoot = await temp(t);
  const registry = (await loadRegistry()).data;
  registry.skills[0]!.files.push({
    path: "references/usage.md",
    content: "资源内容",
    sha256: sha256("资源内容"),
  });
  const source = join(sourceRoot, "index.json");
  const payload = JSON.stringify(registry);
  await writeFile(source, payload);
  const result = await run(root, [
    "add",
    "skill",
    "web-ui",
    "--agent",
    "codex",
    "--source",
    source,
    "--source-sha256",
    sha256(payload),
    "--json",
  ]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(
    await readFile(
      join(root, ".agents/skills/web-ui/references/usage.md"),
      "utf8",
    ),
    "资源内容",
  );
  assert.equal(
    (await readManifest(root)).installations[0]?.sourceSha256,
    sha256(payload),
  );
});

await test("init 创建新项目并安装组件、管理预设与四个 Skills", async (t) => {
  const parent = await temp(t);
  const root = join(parent, "new-project");
  const preview = await run(parent, [
    "init",
    "business-web",
    "--cwd",
    root,
    "--agent",
    "codex",
    "--dry-run",
    "--json",
  ]);
  assert.equal(preview.code, 0, preview.stdout);
  assert.deepEqual(await readdir(parent), []);
  const result = await run(parent, [
    "init",
    "business-web",
    "--cwd",
    root,
    "--agent",
    "codex",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stdout);
  assert.equal(
    JSON.parse(await readFile(join(root, "package.json"), "utf8")).name,
    "business-web",
  );
  assert.match(
    await readFile(join(root, "src/components/ui/Button.tsx"), "utf8"),
    /@base-ui/,
  );
  assert.match(
    await readFile(join(root, ".github/ISSUE_TEMPLATE/feature.yml"), "utf8"),
    /验收标准/,
  );
  const manifest = await readManifest(root);
  assert.equal(manifest.installations.length, 4);
  assert.equal(manifest.assets.length, 6);
  assert.equal((await doctor(root)).ok, true);
  const again = await run(root, [
    "init",
    "business-web",
    "--agent",
    "codex",
    "--json",
  ]);
  assert.equal(again.code, 0, again.stdout);
  assert.ok(
    JSON.parse(again.stdout).items.every(
      (item: { action: string }) => item.action === "unchanged",
    ),
  );
});

await test("业务模板遇到现有 package.json 时整批拒绝；不写组件或 Skills", async (t) => {
  const root = await temp(t);
  await writeFile(join(root, "package.json"), '{"name":"existing"}');
  const result = await run(root, [
    "init",
    "business-web",
    "--agent",
    "codex",
    "--json",
  ]);
  assert.equal(result.code, 1);
  assert.deepEqual(await readdir(root), ["package.json"]);
  assert.equal(
    await readFile(join(root, "package.json"), "utf8"),
    '{"name":"existing"}',
  );
});

await test("UI 可独立安装；缺依赖时明确报错且零写入", async (t) => {
  const root = await temp(t);
  const registry = await loadRegistry();
  await assert.rejects(
    installAssets(root, registry, "ui", ["button"], false),
    /缺少组件依赖/,
  );
  assert.deepEqual(await readdir(root), []);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        react: "^19",
        "@base-ui/react": "^1.8",
        tailwindcss: "^4",
      },
    }),
  );
  await installAssets(root, registry, "ui", ["button"], false);
  assert.equal((await doctor(root)).ok, true);
  await writeFile(join(root, "src/components/ui/Button.tsx"), "customized");
  await assert.rejects(
    installAssets(root, registry, "ui", ["button"], false),
    /未覆盖/,
  );
  assert.equal((await doctor(root)).ok, false);
});

await test("GitHub Projects 预设可独立安装，无需 Agent 或远程凭据", async (t) => {
  const root = await temp(t);
  const result = await run(root, [
    "add",
    "preset",
    "github-projects",
    "--json",
  ]);
  assert.equal(result.code, 0, result.stdout);
  assert.equal((await readManifest(root)).installations.length, 0);
  assert.equal((await doctor(root)).ok, true);
});

await test("质量预设可独立安装，保留 package.json 并给出显式设置命令", async (t) => {
  const root = await temp(t);
  const original = '{"name":"existing","type":"module"}\n';
  await writeFile(join(root, "package.json"), original);
  const result = await run(root, ["add", "preset", "code-quality", "--json"]);
  assert.equal(result.code, 0, result.stdout);
  assert.equal(await readFile(join(root, "package.json"), "utf8"), original);
  assert.match(
    JSON.parse(result.stdout).nextSteps[0],
    /tooling\/setup-project.ts/,
  );
  assert.match(
    await readFile(join(root, "docs/coding-standards.md"), "utf8"),
    /PascalCase/,
  );
  assert.equal((await doctor(root)).ok, true);
  const again = await run(root, ["add", "preset", "code-quality", "--json"]);
  assert.equal(again.code, 0, again.stdout);
  assert.ok(
    JSON.parse(again.stdout).items.every(
      (item: { action: string }) => item.action === "unchanged",
    ),
  );
});

await test("远程资产不能写入保留目录，循环依赖在写入前失败", async (t) => {
  const root = await temp(t);
  const registry = await loadRegistry();
  const invalid = structuredClone(registry.data);
  invalid.assets[0]!.files[0]!.path = ".git/config";
  assert.throws(() => parseData(registrySchema, invalid, "目录"), /保留路径/);
  registry.data.assets[0]!.requires = ["ui/button"];
  await assert.rejects(
    installAssets(root, registry, "ui", ["button"], false),
    /循环依赖/,
  );
  assert.deepEqual(await readdir(root), []);
});
