import "./fixtures/setup.js";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { execute } from "../src/commands.js";
import { AppError } from "../src/errors.js";
import { install } from "../src/install.js";
import { doctor, projectRoot, readManifest } from "../src/project.js";
import type { Prompts } from "../src/prompts.js";
import { loadRegistry } from "../src/registry.js";
import { resolveWriteTarget } from "../src/write-target.js";

async function temp(t: TestContext) {
  const root = await projectRoot(await mkdtemp(join(tmpdir(), "lt-target-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.mock.method(process, "cwd", () => root);
  return root;
}

function prompts(overrides: Partial<Prompts> = {}): Prompts {
  const unexpected = async (): Promise<never> => {
    throw new Error("不应调用其他交互");
  };
  return {
    writeTarget: unexpected,
    packageManager: unexpected,
    action: unexpected,
    kind: unexpected,
    assets: unexpected,
    agent: unexpected,
    skills: unexpected,
    ...overrides,
  };
}

await test("init、Skill、预设与 UI 共用目录选择，当前目录路径完整显示", async (t) => {
  const root = await temp(t);
  let selections = 0;
  const ui = prompts({
    async packageManager() {
      return "none";
    },
    async writeTarget(current) {
      assert.equal(current, root);
      selections++;
      return { mode: "current" };
    },
  });
  for (const [command, kind, name] of [
    ["init", "template", "business-web"],
    ["add", "skill", "forms"],
    ["add", "preset", "github-projects"],
    ["add", "ui", "button"],
  ] as const) {
    const result = await execute(command, kind, [name], { agent: "codex" }, ui);
    assert.equal(result.root, root);
    assert.equal(result.ok, true);
  }
  assert.equal(selections, 4);
  assert.equal((await doctor(root)).ok, true);
});

await test("选择新文件夹后预览零写入；安装 Skill 不附带初始化模板", async (t) => {
  const parent = await temp(t);
  const root = join(parent, "my skills");
  const ui = prompts({
    async writeTarget(current) {
      assert.equal(current, parent);
      return { mode: "new", name: "my skills" };
    },
  });
  const preview = await execute(
    "add",
    "skill",
    ["forms"],
    { agent: "codex", dryRun: true },
    ui,
  );
  assert.equal(preview.root, root);
  assert.deepEqual(await readdir(parent), []);
  const result = await execute(
    "add",
    "skill",
    ["forms"],
    { agent: "codex" },
    ui,
  );
  assert.equal(result.root, root);
  assert.ok("replay" in result);
  assert.ok(result.replay.includes(`--cwd '${root}'`));
  assert.deepEqual(await readdir(root), [".agent-base", ".agents"]);
  assert.equal((await readManifest(root)).assets.length, 0);
  assert.equal((await doctor(root)).ok, true);
});

await test("显式 --cwd 跳过交互，预设可以安装到新目录", async (t) => {
  const parent = await temp(t);
  const root = join(parent, "preset");
  const result = await execute(
    "add",
    "preset",
    ["github-projects"],
    { cwd: "./preset" },
    prompts(),
  );
  assert.equal(result.root, root);
  assert.equal((await doctor(root)).ok, true);
});

await test("只读命令默认当前目录，不询问或创建目录", async (t) => {
  const root = await temp(t);
  for (const command of ["list", "doctor"]) {
    const result = await execute(command, undefined, [], {}, prompts());
    assert.equal(result.root, root);
    assert.equal(result.ok, true);
  }
  assert.deepEqual(await readdir(root), []);
});

await test("目录选择或后续选择取消均不创建新文件夹", async (t) => {
  const root = await temp(t);
  const cancelled = new AppError("CANCELLED", "用户取消", 130);
  for (const stage of ["directory", "agent", "skills"]) {
    await assert.rejects(
      execute(
        "add",
        "skill",
        [],
        {},
        prompts({
          async writeTarget() {
            if (stage === "directory") throw cancelled;
            return { mode: "new", name: "new-project" };
          },
          async agent() {
            if (stage === "agent") throw cancelled;
            return "codex";
          },
          async skills() {
            throw cancelled;
          },
        }),
      ),
      (error: unknown) => error === cancelled,
    );
    assert.deepEqual(await readdir(root), []);
  }
});

await test("新文件夹名称拒绝路径穿越和已有目录，不改动已有文件", async (t) => {
  const root = await temp(t);
  await mkdir(join(root, "existing"));
  await writeFile(join(root, "existing", "keep.txt"), "keep");
  for (const name of [
    "",
    " ",
    ".",
    "..",
    "../escape",
    "/absolute",
    "a/b",
    "a\\b",
    "existing",
  ]) {
    await assert.rejects(
      resolveWriteTarget(
        undefined,
        prompts({
          async writeTarget() {
            return { mode: "new", name };
          },
        }),
      ),
      /文件夹|路径/,
    );
  }
  await assert.rejects(resolveWriteTarget("", prompts()), /不能为空/);
  await assert.rejects(
    resolveWriteTarget("./missing/child", prompts()),
    /ENOENT/,
  );
  await assert.rejects(
    resolveWriteTarget("./existing/keep.txt", prompts()),
    /不是目录/,
  );
  assert.deepEqual(await readdir(root), ["existing"]);
  assert.deepEqual(await readdir(join(root, "existing")), ["keep.txt"]);
});

await test("新目录安装在资产或依赖校验失败时零写入", async (t) => {
  const parent = await temp(t);
  for (const [kind, name, message] of [
    ["skill", "unknown", /找不到 Skill/],
    ["preset", "unknown", /找不到资产/],
    ["ui", "button", /缺少组件依赖/],
  ] as const) {
    await assert.rejects(
      execute(
        "add",
        kind,
        [name],
        {
          cwd: join(parent, kind),
          agent: "codex",
        },
        undefined,
      ),
      message,
    );
    assert.deepEqual(await readdir(parent), []);
  }
});

await test("新目录安装提交失败时回滚文件及本次创建的根目录", async (t) => {
  const parent = await temp(t);
  const failure = new Error("模拟提交失败");
  await assert.rejects(
    install(
      join(parent, "new-project"),
      await loadRegistry(),
      ["forms"],
      "codex",
      false,
      () => Promise.reject(failure),
    ),
    (error: unknown) => error === failure,
  );
  assert.deepEqual(await readdir(parent), []);
});
