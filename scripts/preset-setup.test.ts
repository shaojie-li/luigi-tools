import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tooling = join(root, "registry/presets/code-quality/tooling");
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");

interface PackageConfig {
  name: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  "lint-staged"?: Record<string, string>;
}

function setup(cwd: string) {
  const result = spawnSync(
    process.execPath,
    [tsx, join(tooling, "setup-project.ts")],
    { cwd, encoding: "utf8", timeout: 10_000 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

async function fixture(contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "luigi-preset-setup-"));
  await writeFile(join(directory, "package.json"), contents);
  return directory;
}

await test("质量预设补齐必需配置，保留业务配置，重复执行保持幂等", async () => {
  const original: PackageConfig = {
    name: "business-project",
    type: "module",
    scripts: { dev: "vite", test: "vitest run", build: "vite build" },
    dependencies: { react: "19.3.0" },
    devDependencies: { vite: "8.3.2" },
    "lint-staged": { "*.sql": "sql-formatter --check" },
  };
  const directory = await fixture(JSON.stringify(original));
  try {
    const first = setup(directory);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const firstBytes = await readFile(join(directory, "package.json"), "utf8");
    const actual = JSON.parse(firstBytes) as PackageConfig;
    const required = JSON.parse(
      await readFile(join(tooling, "project-config.json"), "utf8"),
    ) as Pick<PackageConfig, "scripts" | "devDependencies" | "lint-staged">;
    assert.deepEqual(actual, {
      ...original,
      scripts: { ...required.scripts, ...original.scripts },
      devDependencies: {
        ...required.devDependencies,
        ...original.devDependencies,
      },
      "lint-staged": { ...required["lint-staged"], ...original["lint-staged"] },
    });
    assert.ok(actual.scripts?.precommit);
    assert.ok(actual.devDependencies?.eslint);
    assert.equal(
      actual["lint-staged"]?.["*"],
      "prettier --write --ignore-unknown",
    );
    const second = setup(directory);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.equal(
      await readFile(join(directory, "package.json"), "utf8"),
      firstBytes,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("质量预设遇到已有脚本冲突时显性失败，package.json 字节不变", async () => {
  const original =
    '{\n\t"name": "existing-project", "type": "module",\n\t"scripts": { "lint": "custom-linter .", "dev": "vite" }\n}\n';
  const directory = await fixture(original);
  try {
    const result = setup(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /已有配置冲突/);
    assert.match(result.stderr, /scripts\.lint/);
    assert.match(result.stderr, /custom-linter/);
    assert.equal(
      await readFile(join(directory, "package.json"), "utf8"),
      original,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("质量预设拒绝非 ESM 项目且不写入 package.json", async () => {
  for (const type of [undefined, "commonjs"]) {
    const original = JSON.stringify({ name: "unsupported-project", type });
    const directory = await fixture(original);
    try {
      const result = setup(directory);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /TypeScript ESM 项目/);
      assert.equal(
        await readFile(join(directory, "package.json"), "utf8"),
        original,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

await test("质量预设拒绝 package.json 符号链接，保留链接目标", async () => {
  const original = '{"name":"external","type":"module"}\n';
  const directory = await fixture(original);
  try {
    const outside = join(directory, "outside.json");
    await writeFile(outside, original);
    await rm(join(directory, "package.json"));
    await symlink(outside, join(directory, "package.json"));
    const result = setup(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /符号链接/);
    assert.equal(await readFile(outside, "utf8"), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
