import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const source =
  process.env.LT_SOURCE ?? join(root, "test/fixtures/registry-v1.json");
const staging = await mkdtemp(join(tmpdir(), "agent-base-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

async function run(command: string, args: string[], cwd: string) {
  try {
    return await exec(command, args, {
      cwd,
      timeout: 180_000,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, CI: "1" },
    });
  } catch (error) {
    const details = error as Error & { stdout?: string; stderr?: string };
    throw new Error(
      `${command} ${args.join(" ")} 失败\n${details.stdout ?? ""}\n${details.stderr ?? ""}`,
      { cause: error },
    );
  }
}

try {
  console.log("1/5 打包公共 npm 产物");
  const packed = await run(
    npm,
    ["pack", "--json", "--pack-destination", staging],
    root,
  );
  const start = packed.stdout.indexOf("[\n");
  const packages = JSON.parse(packed.stdout.slice(start)) as {
    filename: string;
    name: string;
    version: string;
  }[];
  assert.equal(packages[0]?.name, "@luigix/tools");
  const tarball = join(staging, packages[0]!.filename);
  const consumer = join(staging, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    '{"name":"consumer","private":true}',
  );
  console.log("2/5 在仓库外通过 npm 安装并运行 CLI");
  await run(npm, ["install", "--no-audit", "--no-fund", tarball], consumer);
  const cli = join(consumer, "node_modules/@luigix/tools/dist/index.js");
  const installedFiles = await readdir(
    join(consumer, "node_modules/@luigix/tools"),
  );
  for (const excluded of [
    "registry",
    "packages",
    "src",
    "test",
    "scripts",
    "tooling",
  ]) {
    assert.ok(!installedFiles.includes(excluded), `分发包不应包含 ${excluded}`);
  }
  assert.equal(
    await readFile(
      join(consumer, "node_modules/@luigix/tools/LICENSE"),
      "utf8",
    ),
    await readFile(join(root, "LICENSE"), "utf8"),
  );
  const bin = join(consumer, "node_modules/.bin/lt");
  if (process.platform !== "win32") {
    const version = await run(bin, ["--version"], consumer);
    assert.equal(version.stdout.trim(), packages[0]!.version);
  }
  const listed = JSON.parse(
    (
      await run(
        process.execPath,
        [cli, "list", "--source", source, "--json"],
        consumer,
      )
    ).stdout,
  ) as { skills: unknown[] };
  assert.equal(listed.skills.length, 5);
  const app = join(staging, "business");
  console.log("3/5 通过已安装的 CLI 初始化业务项目并安装 npm 依赖");
  const initialized = JSON.parse(
    (
      await run(
        process.execPath,
        [
          cli,
          "init",
          "business-web",
          "--source",
          source,
          "--cwd",
          app,
          "--agent",
          "codex",
          "--package-manager",
          "npm",
          "--json",
        ],
        consumer,
      )
    ).stdout,
  ) as { dependencies: { packageManager: string; status: string } };
  assert.deepEqual(initialized.dependencies, {
    packageManager: "npm",
    status: "installed",
  });
  const report = JSON.parse(
    (
      await run(
        process.execPath,
        [cli, "doctor", "--cwd", app, "--json"],
        consumer,
      )
    ).stdout,
  ) as { ok: boolean };
  assert.equal(report.ok, true);
  assert.ok(!(await readdir(app)).includes("licenses"));
  for (const skill of [
    "web-ui",
    "forms",
    "tables",
    "github-projects",
    "profile-web-interaction",
  ])
    assert.ok(
      !(await readdir(join(app, ".agents/skills", skill))).includes("LICENSE"),
    );
  assert.match(
    await readFile(join(app, "src/components/ui/Button.tsx"), "utf8"),
    /@base-ui/,
  );
  console.log("4/5 运行 npm 模板完整质量检查、测试与生产构建");
  const build = await run(npm, ["run", "check"], app);
  console.log(build.stdout);
  console.log("5/5 通过 CLI 使用 pnpm 安装新项目并运行完整检查");
  const pnpmApp = join(staging, "pnpm-business");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  console.log(
    `验证 pnpm 版本：${(await run(pnpm, ["--version"], consumer)).stdout.trim()}`,
  );
  const pnpmInitialized = JSON.parse(
    (
      await run(
        process.execPath,
        [
          cli,
          "init",
          "business-web",
          "--source",
          source,
          "--cwd",
          pnpmApp,
          "--agent",
          "codex",
          "--package-manager",
          "pnpm",
          "--json",
        ],
        consumer,
      )
    ).stdout,
  ) as { dependencies: { packageManager: string; status: string } };
  assert.deepEqual(pnpmInitialized.dependencies, {
    packageManager: "pnpm",
    status: "installed",
  });
  console.log((await run(pnpm, ["run", "check"], pnpmApp)).stdout);
  console.log(
    "通过：公共包结构、仓库外安装、npm/pnpm 模板初始化与依赖安装、doctor、模板 lint/格式/类型检查、测试和构建。",
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
