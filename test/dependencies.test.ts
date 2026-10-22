import "./fixtures/setup.js";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { execute, render } from "../src/commands.js";
import { AppError } from "../src/errors.js";
import { projectRoot } from "../src/project.js";
import { doctor } from "../src/doctor.js";
import type { Prompts } from "../src/prompts.js";
import { loadRegistry } from "../src/registry.js";
import { sha256 } from "../src/schema.js";

const cli = fileURLToPath(new URL("../src/index.ts", import.meta.url));

async function fixture(t: TestContext, exitCode = 0) {
  const parent = await projectRoot(
    await mkdtemp(join(tmpdir(), "lt-dependencies-")),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const bin = join(parent, "bin");
  await mkdir(bin);
  for (const manager of ["npm", "pnpm"]) {
    const file = join(bin, `${manager}.ts`);
    await writeFile(
      file,
      `#!${process.execPath}
import { existsSync, writeFileSync } from "node:fs";
writeFileSync("install-call.json", JSON.stringify({
  manager: ${JSON.stringify(manager)}, args: process.argv.slice(2), cwd: process.cwd(),
  generated: existsSync("package.json") && existsSync(".agents/skills/web-ui/SKILL.md"),
}));
console.log("package-manager stdout");
console.error("package-manager stderr");
if (${exitCode} !== 0) console.error("\\u001b[31mERR_PNPM_FETCH_503\\u001b[0m registry 返回 503，依赖下载失败");
process.exitCode = ${exitCode};
`,
    );
    await chmod(file, 0o755);
    await symlink(file, join(bin, manager));
  }
  const content = JSON.stringify({ name: "fixture-app", private: true });
  const source = join(parent, "registry.json");
  await writeFile(
    source,
    JSON.stringify({
      schemaVersion: 1,
      version: "0.1.0",
      skills: [(await loadRegistry()).data.skills[0]],
      assets: [
        {
          type: "template",
          name: "test-app",
          description: "测试模板",
          requires: [],
          dependencies: {},
          files: [{ path: "package.json", content, sha256: sha256(content) }],
        },
      ],
    }),
  );
  const root = join(parent, "project with spaces");
  const options = { cwd: root, agent: "codex", source };
  function run(
    args: string[],
    path = `${bin}${delimiter}${process.env.PATH ?? ""}`,
  ) {
    return new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolve) => {
        execFile(
          process.execPath,
          [
            "--import",
            import.meta.resolve("tsx"),
            cli,
            ...args,
            "--cwd",
            root,
            "--source",
            source,
            "--json",
          ],
          {
            cwd: parent,
            env: { ...process.env, PATH: path, CI: "1" },
            timeout: 15_000,
          },
          (error, stdout, stderr) =>
            resolve({
              code: error ? Number(error.code) || 1 : 0,
              stdout,
              stderr,
            }),
        );
      },
    );
  }
  return { parent, root, options, run };
}

function prompts(overrides: Partial<Prompts>): Prompts {
  const unexpected = async (): Promise<never> => {
    throw new Error("不应询问其他参数");
  };
  return {
    action: unexpected,
    kind: unexpected,
    writeTarget: unexpected,
    agent: unexpected,
    assets: unexpected,
    skills: unexpected,
    packageManager: unexpected,
    ...overrides,
  };
}

await test("npm/pnpm 在生成项目后于目标目录安装；日志不污染 JSON，复用和启动命令保留选择", async (t) => {
  for (const manager of ["npm", "pnpm"]) {
    const { root, run } = await fixture(t);
    const result = await run([
      "init",
      "test-app",
      "--agent",
      "codex",
      "--package-manager",
      manager,
    ]);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.dependencies, {
      packageManager: manager,
      status: "installed",
    });
    assert.ok(output.replay.includes(`--package-manager ${manager}`));
    assert.ok(output.nextSteps.includes(`${manager} run dev`));
    assert.ok(output.nextSteps.includes(`${manager} run tooling:setup`));
    assert.ok(!output.nextSteps.includes(`${manager} install`));
    assert.match(result.stderr, /package-manager stdout/);
    assert.match(result.stderr, /package-manager stderr/);
    assert.deepEqual(
      JSON.parse(await readFile(join(root, "install-call.json"), "utf8")),
      {
        manager,
        args: ["install"],
        cwd: root,
        generated: true,
      },
    );
    assert.equal((await doctor(root)).ok, true);
  }
});

await test("dry-run 不执行包管理器、不创建项目；none 和非交互省略参数均跳过安装", async (t) => {
  const { parent, root, run } = await fixture(t);
  const before = await readdir(parent);
  const preview = await run([
    "init",
    "test-app",
    "--agent",
    "codex",
    "--package-manager",
    "pnpm",
    "--dry-run",
  ]);
  assert.equal(preview.code, 0, preview.stdout);
  assert.equal(JSON.parse(preview.stdout).dependencies.status, "planned");
  assert.deepEqual(await readdir(parent), before);
  assert.equal(preview.stderr, "");
  for (const args of [[], ["--package-manager", "none"]]) {
    const result = await run(["init", "test-app", "--agent", "codex", ...args]);
    assert.equal(result.code, 0, result.stdout);
    assert.deepEqual(JSON.parse(result.stdout).dependencies, {
      packageManager: "none",
      status: "skipped",
    });
    assert.equal(result.stderr, "");
    assert.deepEqual(await readdir(root), [".agents", "package.json"]);
  }
});

await test("包管理器失败时返回错误、保留项目和安装中间文件，并给出重试指引", async (t) => {
  const { root, run } = await fixture(t, 7);
  const result = await run([
    "init",
    "test-app",
    "--agent",
    "codex",
    "--package-manager",
    "pnpm",
  ]);
  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.error.code, "DEPENDENCY_INSTALL_FAILED");
  assert.match(output.error.message, /退出码 7/);
  assert.match(output.error.message, /package-manager stdout/);
  assert.match(output.error.message, /package-manager stderr/);
  assert.match(output.error.message, /ERR_PNPM_FETCH_503.*依赖下载失败/);
  assert.ok(!output.error.message.includes("\u001b"));
  assert.match(output.error.message, /已保留.*pnpm install 重试/);
  assert.ok(output.error.message.includes(root));
  assert.equal((await doctor(root)).ok, true);
  assert.ok((await readdir(root)).includes("install-call.json"));
});

await test("包管理器不存在时显性失败，保留项目供安装工具后重试", async (t) => {
  const { root, run } = await fixture(t);
  const result = await run(
    ["init", "test-app", "--agent", "codex", "--package-manager", "pnpm"],
    "",
  );
  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.error.code, "DEPENDENCY_INSTALL_FAILED");
  assert.match(output.error.message, /ENOENT/);
  assert.equal((await doctor(root)).ok, true);
});

await test("非法包管理器、非 init 命令及模板冲突在执行安装前拒绝", async (t) => {
  const { parent, root, run } = await fixture(t);
  const before = await readdir(parent);
  for (const args of [
    ["init", "test-app", "--agent", "codex", "--package-manager", "yarn"],
    ["add", "preset", "github-projects", "--package-manager", "npm"],
    ["list", "--package-manager", "pnpm"],
    ["doctor", "--package-manager", "none"],
  ]) {
    const result = await run(args);
    assert.equal(result.code, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal(result.stderr, "");
    assert.deepEqual(await readdir(parent), before);
  }
  await mkdir(root);
  await writeFile(join(root, "package.json"), "original");
  const conflict = await run([
    "init",
    "test-app",
    "--agent",
    "codex",
    "--package-manager",
    "npm",
  ]);
  assert.equal(conflict.code, 1);
  assert.equal(conflict.stderr, "");
  assert.deepEqual(await readdir(root), ["package.json"]);
  assert.equal(await readFile(join(root, "package.json"), "utf8"), "original");
});

await test("交互选择包管理器在写入前完成；显式参数跳过选择，取消零写入", async (t) => {
  const { parent, options } = await fixture(t);
  const before = await readdir(parent);
  const preview = await execute(
    "init",
    "template",
    ["test-app"],
    { ...options, dryRun: true },
    prompts({
      async packageManager() {
        assert.deepEqual(await readdir(parent), before);
        return "pnpm";
      },
    }),
  );
  assert.ok("dependencies" in preview);
  assert.deepEqual(preview.dependencies, {
    packageManager: "pnpm",
    status: "planned",
  });
  assert.match(render(preview), /将使用 pnpm 安装/);
  const cancelled = new AppError("CANCELLED", "用户取消", 130);
  await assert.rejects(
    execute(
      "init",
      "template",
      ["test-app"],
      options,
      prompts({
        async packageManager() {
          throw cancelled;
        },
      }),
    ),
    (error: unknown) => error === cancelled,
  );
  assert.deepEqual(await readdir(parent), before);
  const skipped = await execute(
    "init",
    "template",
    ["test-app"],
    { ...options, packageManager: "none" },
    prompts({}),
  );
  assert.match(render(skipped), /依赖：暂未安装/);
});
