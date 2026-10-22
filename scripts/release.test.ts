import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import semanticRelease, { type Options } from "semantic-release";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(join(root, ".releaserc.json"), "utf8"),
) as Options;
const analyzer = config.plugins?.find(
  (plugin) =>
    Array.isArray(plugin) && plugin[0] === "@semantic-release/commit-analyzer",
);
assert.ok(analyzer, "发布配置必须声明提交分析插件");
const notesGenerator = config.plugins?.find(
  (plugin) =>
    Array.isArray(plugin) &&
    plugin[0] === "@semantic-release/release-notes-generator",
);
assert.ok(notesGenerator, "发布配置必须声明发布说明生成插件");

for (const scenario of [
  { messages: ["fix: 修复安装路径"], version: "0.1.1" },
  { messages: ["fix: 修复安装路径", "feat: 支持新来源"], version: "0.2.0" },
  { messages: ["feat(cli)!: 调整安装参数"], version: "1.0.0" },
  {
    messages: ["fix: 调整参数\n\nBREAKING CHANGE: 删除旧参数"],
    version: "1.0.0",
  },
  { messages: ["docs: 更新文档", "chore: 更新开发配置"], version: undefined },
]) {
  await test(`发布版本：${scenario.messages.join(" + ")} → ${scenario.version ?? "不发布"}`, async () => {
    const staging = await mkdtemp(join(tmpdir(), "luigi-release-test-"));
    const cwd = join(staging, "checkout");
    const remote = join(staging, "remote.git");
    const env = {
      PATH: process.env.PATH,
      HOME: staging,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: join(staging, "empty-gitconfig"),
      GIT_AUTHOR_NAME: "Release Test",
      GIT_AUTHOR_EMAIL: "release@example.invalid",
      GIT_COMMITTER_NAME: "Release Test",
      GIT_COMMITTER_EMAIL: "release@example.invalid",
    };
    const git = (args: string[], directory = cwd) =>
      exec("git", args, { cwd: directory, env });
    try {
      await git(["init", "--bare", "--initial-branch=main", remote], staging);
      await git(["clone", remote, cwd], staging);
      await git(["commit", "--allow-empty", "-m", "chore: 初始化"]);
      await git(["tag", "v0.1.0"]);
      for (const message of scenario.messages) {
        await git(["commit", "--allow-empty", "-m", message]);
      }
      await git(["push", "origin", "main", "--tags"]);
      await symlink(
        join(root, "node_modules"),
        join(cwd, "node_modules"),
        "junction",
      );
      // 运行真实版本分析与发布说明生成；隔离发布插件、凭据和远程服务。
      const result = await semanticRelease(
        {
          ...config,
          repositoryUrl: pathToFileURL(remote).href,
          plugins: [analyzer, notesGenerator],
          dryRun: true,
          ci: false,
        },
        { cwd, env },
      );
      assert.equal(
        result ? result.nextRelease.version : undefined,
        scenario.version,
      );
      if (result) {
        const notes = result.nextRelease.notes;
        assert.ok(notes, "需要发布时必须生成发布说明");
        assert.ok(notes.includes(result.nextRelease.version));
        if (scenario.version === "1.0.0") {
          assert.match(notes, /BREAKING CHANGES/);
        }
      }
      assert.equal((await git(["tag", "--list"])).stdout.trim(), "v0.1.0");
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  });
}

await test("发布回写 package.json，tag 与远程 main 一致，文档提交不重复发布", async () => {
  const staging = await mkdtemp(join(tmpdir(), "luigi-release-sync-"));
  const cwd = join(staging, "checkout");
  const remote = join(staging, "remote.git");
  const env = {
    PATH: process.env.PATH,
    HOME: staging,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(staging, "empty-gitconfig"),
    GIT_AUTHOR_NAME: "Release Test",
    GIT_AUTHOR_EMAIL: "release@example.invalid",
    GIT_COMMITTER_NAME: "Release Test",
    GIT_COMMITTER_EMAIL: "release@example.invalid",
  };
  const git = (args: string[], directory = cwd) =>
    exec("git", args, { cwd: directory, env });
  const gitPlugin = config.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "@semantic-release/git",
  );
  assert.ok(gitPlugin, "发布配置必须回写版本");
  assert.ok(
    config.plugins!.indexOf("@semantic-release/npm") <
      config.plugins!.indexOf(gitPlugin),
    "必须先更新包版本再提交",
  );
  try {
    await git(["init", "--bare", "--initial-branch=main", remote], staging);
    await git(["clone", remote, cwd], staging);
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "release-sync-fixture", version: "2.0.0" }),
    );
    await git(["add", "package.json"]);
    await git(["commit", "-m", "chore: 初始化"]);
    await git(["tag", "v2.0.0"]);
    await git(["commit", "--allow-empty", "-m", "fix: 修复版本同步"]);
    await git(["push", "origin", "main", "--tags"]);
    const checkedHead = (await git(["rev-parse", "HEAD"])).stdout.trim();
    await symlink(
      join(root, "node_modules"),
      join(cwd, "node_modules"),
      "junction",
    );
    // 未跟踪文件不能被版本提交意外收集。
    await writeFile(join(cwd, "untracked.txt"), "保留本地内容");
    const options: Options = {
      ...config,
      repositoryUrl: pathToFileURL(remote).href,
      plugins: [
        analyzer!,
        notesGenerator!,
        ["@semantic-release/npm", { npmPublish: false }],
        gitPlugin,
      ],
      ci: false,
    };
    const result = await semanticRelease(options, { cwd, env });
    assert.equal(result ? result.nextRelease.version : undefined, "2.0.1");
    const releaseHead = (await git(["rev-parse", "HEAD"])).stdout.trim();
    assert.notEqual(releaseHead, checkedHead);
    assert.equal(
      (await git(["rev-parse", "HEAD^"])).stdout.trim(),
      checkedHead,
    );
    assert.equal(
      (await git(["rev-parse", "v2.0.1"])).stdout.trim(),
      releaseHead,
    );
    assert.equal(
      (await git(["rev-parse", "main"], remote)).stdout.trim(),
      releaseHead,
    );
    assert.match(
      (await git(["log", "-1", "--format=%s"])).stdout,
      /^chore\(release\): 同步版本 2\.0\.1 \[skip ci\]/,
    );
    assert.equal(
      (
        await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])
      ).stdout.trim(),
      "package.json",
    );
    assert.match(
      (await git(["show", "main:package.json"], remote)).stdout,
      /"version":\s*"2\.0\.1"/,
    );
    await git(["commit", "--allow-empty", "-m", "docs: 更新说明"]);
    await git(["push", "origin", "main"]);
    assert.equal(await semanticRelease(options, { cwd, env }), false);
    assert.equal(
      (await git(["tag", "--list", "v2.0.*"])).stdout.trim(),
      "v2.0.0\nv2.0.1",
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
});
