import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
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
  console.log("1/4 打包公共 npm 产物");
  const packed = await run(
    npm,
    ["pack", "--json", "--pack-destination", staging],
    join(root, "packages/cli"),
  );
  const start = packed.stdout.indexOf("[\n");
  const packages = JSON.parse(packed.stdout.slice(start)) as {
    filename: string;
    name: string;
  }[];
  assert.equal(packages[0]?.name, "@luigi/tools");
  const tarball = join(staging, packages[0]!.filename);
  const consumer = join(staging, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    '{"name":"consumer","private":true}',
  );
  console.log("2/4 在仓库外通过 npm 安装并运行 CLI");
  await run(npm, ["install", "--no-audit", "--no-fund", tarball], consumer);
  const cli = join(consumer, "node_modules/@luigi/tools/dist/index.js");
  const bin = join(consumer, "node_modules/.bin/lt");
  if (process.platform !== "win32") {
    const version = await run(bin, ["--version"], consumer);
    assert.equal(version.stdout.trim(), "0.1.0");
  }
  const listed = JSON.parse(
    (await run(process.execPath, [cli, "list", "--json"], consumer)).stdout,
  ) as { skills: unknown[] };
  assert.equal(listed.skills.length, 4);
  const app = join(staging, "business");
  console.log("3/4 通过已安装的 CLI 初始化业务项目");
  await run(
    process.execPath,
    [cli, "init", "business-web", "--cwd", app, "--agent", "codex", "--json"],
    consumer,
  );
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
  assert.match(
    await readFile(join(app, "src/components/ui/Button.tsx"), "utf8"),
    /@base-ui/,
  );
  console.log("4/4 安装模板依赖，运行完整质量检查、测试与生产构建");
  await run(npm, ["install", "--no-audit", "--no-fund"], app);
  const build = await run(npm, ["run", "check"], app);
  console.log(build.stdout);
  console.log(
    "通过：公共包结构、仓库外安装、模板初始化、doctor、模板 lint/格式/类型检查、测试和构建。",
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
