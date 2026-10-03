import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const commitlint = require.resolve("@commitlint/cli/cli.js");
const setupHooks = join(
  root,
  "registry/presets/code-quality/tooling/setup-hooks.ts",
);
const checkCommits = join(root, "scripts/check-commits.ts");

function run(
  cwd: string,
  command: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Tests can run inside a real commit hook; never inherit its index or user's hook initialization.
  for (const name of Object.keys(env)) {
    if (name.startsWith("GIT_")) {
      delete env[name];
    }
  }
  return spawnSync(command, args, {
    cwd,
    input: options.input,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 5 * 1024 * 1024,
    env: {
      ...env,
      CI: "",
      HUSKY: "1",
      XDG_CONFIG_HOME: join(cwd, ".test-config"),
      GIT_CONFIG_GLOBAL: join(cwd, ".test-gitconfig"),
      ...options.env,
    },
  });
}

function success(
  cwd: string,
  command: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const result = run(cwd, command, args, options);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

async function gitFixture() {
  const directory = await mkdtemp(join(tmpdir(), "luigi-quality-"));
  await symlink(
    join(root, "node_modules"),
    join(directory, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(
    join(directory, ".gitignore"),
    "node_modules/\n.test-config/\n",
  );
  success(directory, "git", ["init", "--initial-branch=main"]);
  success(directory, "git", ["config", "user.name", "Quality Fixture"]);
  success(directory, "git", [
    "config",
    "user.email",
    "quality@example.invalid",
  ]);
  success(directory, "git", ["config", "commit.gpgsign", "false"]);
  return directory;
}

await test("commitlint 接受中文规范提交，拒绝缺少格式或不支持的类型", () => {
  const args = [commitlint, "--config", join(root, "commitlint.config.ts")];
  success(root, process.execPath, args, { input: "feat(cli): 支持交互安装\n" });
  success(root, process.execPath, args, {
    input: "fix(ui): 保留提交失败后的输入\n",
  });
  for (const input of [
    "新增交互安装\n",
    "feature: 新增交互安装\n",
    "fix: \n",
    `feat: ${"修".repeat(96)}\n`,
  ]) {
    const result = run(root, process.execPath, args, { input });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, `应拒绝提交消息：${input}`);
    assert.match(
      result.stdout + result.stderr,
      /type-empty|type-enum|subject-empty|header-max-length/,
    );
  }
  success(root, process.execPath, args, {
    input: "feat(cli)!: 调整命令入口\n\nBREAKING CHANGE: 改用 lt 命令。\n",
  });
});

await test("真实 Husky 钩子运行全量检查、保护部分暂存并校验 commit-msg", async () => {
  const directory = await gitFixture();
  try {
    await mkdir(join(directory, "src"));
    await mkdir(join(directory, ".husky"));
    await mkdir(join(directory, "tooling"));
    const rootPackage = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as {
      scripts: { precommit: string };
      "lint-staged": Record<string, string>;
    };
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "quality-fixture",
        private: true,
        type: "module",
        scripts: {
          precommit: rootPackage.scripts.precommit,
          lint: "eslint src --max-warnings=0",
          "format:check": "prettier --check .",
          typecheck: "tsc --noEmit",
        },
        "lint-staged": rootPackage["lint-staged"],
      }),
    );
    await writeFile(
      join(directory, "eslint.config.ts"),
      'import tseslint from "typescript-eslint";\nexport default tseslint.config(...tseslint.configs.recommended, { rules: { "no-debugger": "error" } });\n',
    );
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          skipLibCheck: true,
        },
        include: ["src"],
      }),
    );
    await copyFile(
      join(root, ".prettierrc.json"),
      join(directory, ".prettierrc.json"),
    );
    await writeFile(
      join(directory, ".prettierignore"),
      "node_modules\n.husky/_\n",
    );
    await copyFile(
      join(root, ".husky/pre-commit"),
      join(directory, ".husky/pre-commit"),
    );
    await copyFile(
      join(root, ".husky/commit-msg"),
      join(directory, ".husky/commit-msg"),
    );
    await copyFile(
      join(root, "registry/presets/code-quality/commitlint.config.ts"),
      join(directory, "commitlint.config.ts"),
    );
    await copyFile(
      join(root, "registry/presets/code-quality/tooling/commit-rules.ts"),
      join(directory, "tooling/commit-rules.ts"),
    );
    await writeFile(
      join(directory, "src/quality.ts"),
      "export const quality = 1;\n",
    );
    await writeFile(
      join(directory, "src/partial.ts"),
      "export const stagedValue = 1;\n",
    );
    success(directory, process.execPath, ["--import", "tsx", setupHooks]);
    assert.equal(
      success(directory, "git", ["config", "core.hooksPath"]).trim(),
      ".husky/_",
    );
    success(directory, process.execPath, [
      require.resolve("prettier/bin/prettier.cjs"),
      "--write",
      ".",
    ]);
    success(directory, "git", ["add", "."]);
    success(directory, "git", ["commit", "-m", "chore: 初始化测试仓库"], {
      env: { HUSKY: "0" },
    });
    const initial = success(directory, "git", ["rev-parse", "HEAD"]).trim();

    await writeFile(
      join(directory, "src/partial.ts"),
      "export const stagedValue=2;\n",
    );
    success(directory, "git", ["add", "src/partial.ts"]);
    // The violation is deliberately unstaged: a staged-only lint would miss it.
    await writeFile(
      join(directory, "src/quality.ts"),
      "export const quality = 1;\ndebugger;\n",
    );
    const failedLint = run(directory, "git", [
      "commit",
      "-m",
      "feat: 验证全量检查",
    ]);
    assert.notEqual(failedLint.status, 0);
    assert.match(failedLint.stdout + failedLint.stderr, /no-debugger/);
    assert.equal(
      success(directory, "git", ["rev-parse", "HEAD"]).trim(),
      initial,
    );

    await writeFile(
      join(directory, "src/quality.ts"),
      "export const quality = 1;\n",
    );
    await writeFile(
      join(directory, "src/partial.ts"),
      "export const stagedValue=2;\n",
    );
    success(directory, "git", ["add", "src/partial.ts"]);
    await writeFile(
      join(directory, "src/partial.ts"),
      "export const stagedValue=2;\n\nexport const localOnly = 3;\n",
    );
    success(directory, "git", ["commit", "-m", "feat: 验证部分暂存保护"]);
    const committed = success(directory, "git", [
      "show",
      "HEAD:src/partial.ts",
    ]);
    assert.equal(committed, "export const stagedValue = 2;\n");
    const working = await readFile(join(directory, "src/partial.ts"), "utf8");
    assert.match(working, /export const localOnly = 3;/);
    assert.match(
      success(directory, "git", ["diff", "--", "src/partial.ts"]),
      /localOnly/,
    );

    await writeFile(
      join(directory, "src/quality.ts"),
      "export const quality = 2;\n",
    );
    success(directory, "git", ["add", "src/quality.ts"]);
    const beforeInvalid = success(directory, "git", [
      "rev-parse",
      "HEAD",
    ]).trim();
    const failedMessage = run(directory, "git", [
      "commit",
      "-m",
      "错误提交消息",
    ]);
    assert.notEqual(failedMessage.status, 0);
    assert.match(
      failedMessage.stdout + failedMessage.stderr,
      /type-empty|subject-empty/,
    );
    assert.equal(
      success(directory, "git", ["rev-parse", "HEAD"]).trim(),
      beforeInvalid,
    );
    success(directory, "git", ["commit", "-m", "fix: 修正测试输入"]);
    assert.notEqual(
      success(directory, "git", ["rev-parse", "HEAD"]).trim(),
      beforeInvalid,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test("CI 提交校验限定 PR/push 范围，首次 push 检查完整历史", async () => {
  const directory = await gitFixture();
  try {
    await writeFile(
      join(directory, "package.json"),
      '{"private":true,"type":"module"}\n',
    );
    success(directory, "git", ["add", "."]);
    success(directory, "git", ["commit", "-m", "旧的非法提交"], {
      env: { HUSKY: "0" },
    });
    const base = success(directory, "git", ["rev-parse", "HEAD"]).trim();
    success(
      directory,
      "git",
      ["commit", "--allow-empty", "-m", "feat: 新增有效功能"],
      { env: { HUSKY: "0" } },
    );
    const head = success(directory, "git", ["rev-parse", "HEAD"]).trim();
    for (const event of ["pull_request", "push"]) {
      const output = success(
        directory,
        process.execPath,
        ["--import", "tsx", checkCommits],
        {
          env: { COMMIT_EVENT: event, COMMIT_BASE: base, COMMIT_HEAD: head },
        },
      );
      assert.match(output, /1 个提交/);
    }
    const firstPush = run(
      directory,
      process.execPath,
      ["--import", "tsx", checkCommits],
      {
        env: {
          COMMIT_EVENT: "push",
          COMMIT_BASE: "0".repeat(40),
          COMMIT_HEAD: head,
        },
      },
    );
    assert.notEqual(firstPush.status, 0);
    assert.match(firstPush.stderr, /2 个提交中有 1 个/);
    const invalidRange = run(
      directory,
      process.execPath,
      ["--import", "tsx", checkCommits],
      {
        env: {
          COMMIT_EVENT: "push",
          COMMIT_BASE: "HEAD; touch injected",
          COMMIT_HEAD: head,
        },
      },
    );
    assert.notEqual(invalidRange.status, 0);
    assert.match(invalidRange.stderr, /完整的 Git commit SHA/);
    success(
      directory,
      "git",
      ["commit", "--allow-empty", "-m", "范围中的非法提交"],
      { env: { HUSKY: "0" } },
    );
    const invalidHead = success(directory, "git", ["rev-parse", "HEAD"]).trim();
    for (const event of ["pull_request", "push"]) {
      const result = run(
        directory,
        process.execPath,
        ["--import", "tsx", checkCommits],
        {
          env: {
            COMMIT_EVENT: event,
            COMMIT_BASE: head,
            COMMIT_HEAD: invalidHead,
          },
        },
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /1 个提交中有 1 个/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
