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
import { loadCatalog, materialize } from "../src/catalog.js";
import type { Registry } from "../src/schema.js";
import { sha256 } from "../src/schema.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

const staging = await mkdtemp(join(tmpdir(), "luigi-tools-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

interface Initialized {
  dryRun: boolean;
  dependencies: { packageManager: string; status: string };
  items: { action: string }[];
}

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
  // Exercise the current v2 protocol with tiny, local assets. Legacy tests use v1 directly.
  let source = process.env.LT_SOURCE;
  if (!source) {
    const fixture = JSON.parse(
      await readFile(join(root, "test/fixtures/registry-v1.json"), "utf8"),
    ) as Registry;
    const entries = [];
    for (const item of [
      ...fixture.skills.map((skill) => ({ ...skill, type: "skill" as const })),
      ...fixture.assets,
    ]) {
      const payload = JSON.stringify({
        schemaVersion: 1,
        version: fixture.version,
        skills:
          item.type === "skill"
            ? [fixture.skills.find((skill) => skill.name === item.name)]
            : [],
        assets: item.type === "skill" ? [] : [{ ...item, requires: [] }],
      });
      const filename = `${sha256(payload)}.json`;
      await writeFile(join(staging, filename), payload);
      entries.push({
        type: item.type,
        name: item.name,
        description: item.description,
        version: fixture.version,
        url: filename,
        sha256: sha256(payload),
        requires: [
          ...("requires" in item ? item.requires : []),
          ...(item.type === "template"
            ? fixture.skills.map((skill) => `skill/${skill.name}`)
            : []),
        ].map((key) => ({ key, version: fixture.version })),
      });
    }
    source = join(staging, "index.json");
    await writeFile(source, JSON.stringify({ schemaVersion: 2, entries }));
  }
  console.log("1/4 打包公共 npm 产物");
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
  console.log("2/4 在仓库外通过 npm 安装并运行 CLI");
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
  ) as { skills: { name: string }[]; assets: { type: string; name: string }[] };
  const templates = listed.assets.filter((asset) => asset.type === "template");
  const template =
    templates.find((asset) => asset.name === "business-web") ?? templates[0];
  assert.ok(template, "smoke 来源必须提供至少一个模板");
  const expected = await materialize(await loadCatalog(source), [
    `template/${template.name}`,
  ]);
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  console.log(
    `验证 pnpm 版本：${(await run(pnpm, ["--version"], consumer)).stdout.trim()}`,
  );
  for (const [index, manager] of ["npm", "pnpm"].entries()) {
    const app = join(staging, `${manager}-app`);
    console.log(`${index + 3}/4 验证 ${manager} 模板写入、依赖安装及 check`);
    const args: string[] = [
      cli,
      "init",
      template.name,
      "--source",
      source,
      "--cwd",
      app,
      "--agent",
      "codex",
      "--json",
    ];
    const initialize = async (
      packageManager: string,
      extra: string[] = [],
    ): Promise<Initialized> =>
      JSON.parse(
        (
          await run(
            process.execPath,
            [...args, "--package-manager", packageManager, ...extra],
            consumer,
          )
        ).stdout,
      ) as Initialized;
    const preview = await initialize(manager, ["--dry-run"]);
    assert.equal(preview.dryRun, true);
    assert.equal(preview.dependencies.status, "planned");
    assert.ok(!(await readdir(staging)).includes(`${manager}-app`));
    await initialize("none");
    for (const asset of expected.data.assets)
      for (const file of asset.files)
        assert.equal(
          await readFile(join(app, file.path), "utf8"),
          file.content,
        );
    for (const skill of expected.data.skills)
      for (const file of skill.files)
        assert.equal(
          await readFile(
            join(app, ".agents/skills", skill.name, file.path),
            "utf8",
          ),
          file.content,
        );
    const again = await initialize("none");
    assert.ok(again.items.length > 0);
    assert.ok(again.items.every((item) => item.action === "unchanged"));
    const initialized = await initialize(manager);
    assert.deepEqual(initialized.dependencies, {
      packageManager: manager,
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
    assert.ok(!(await readdir(app)).includes(".agent-base"));
    assert.ok(!(await readdir(app)).includes(".lt-install.lock"));
    console.log(
      (await run(manager === "npm" ? npm : pnpm, ["run", "check"], app)).stdout,
    );
  }
  console.log(
    "通过：公共包结构、仓库外入口、v2/指定来源安装、文件一致性、dry-run、重复安装、npm/pnpm 依赖安装与模板 check。",
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
