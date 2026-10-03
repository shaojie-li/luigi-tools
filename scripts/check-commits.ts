import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const commitlint = require.resolve("@commitlint/cli/cli.js");
const config = fileURLToPath(
  new URL("../commitlint.config.ts", import.meta.url),
);

function commitSha(value: string | undefined, name: string): string {
  if (!value || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value)) {
    throw new Error(`${name} 必须是完整的 Git commit SHA。`);
  }
  return value;
}

function checkCommits() {
  const event = process.env.COMMIT_EVENT;
  if (event !== "pull_request" && event !== "push") {
    throw new Error("COMMIT_EVENT 必须为 pull_request 或 push。");
  }
  const head = commitSha(process.env.COMMIT_HEAD, "COMMIT_HEAD");
  const base = commitSha(process.env.COMMIT_BASE, "COMMIT_BASE");
  if (/^0+$/.test(head) || (event === "pull_request" && /^0+$/.test(base))) {
    throw new Error("当前事件的提交范围不能使用空 SHA。");
  }

  // 首次 push 没有 before commit，检查本次分支的完整历史。
  const range = /^0+$/.test(base) ? head : `${base}..${head}`;
  const log = execFileSync(
    "git",
    ["log", "--reverse", "--format=%H%x00%B%x00", range, "--"],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const entries = log.split("\0");
  let checked = 0;
  let failed = 0;
  for (let index = 0; index + 1 < entries.length; index += 2) {
    const sha = entries[index]?.trim();
    const message = entries[index + 1];
    if (!sha || message === undefined) {
      throw new Error("Git 提交记录格式不正确，无法完成提交校验。");
    }
    checked += 1;
    try {
      execFileSync(process.execPath, [commitlint, "--config", config], {
        input: message,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      failed += 1;
      const details = error as Error & { stdout?: string; stderr?: string };
      console.error(
        `提交 ${sha} 未通过检查：\n${details.stdout ?? ""}${details.stderr ?? ""}`,
      );
    }
  }
  if (failed > 0) {
    throw new Error(`${checked} 个提交中有 ${failed} 个不符合提交规范。`);
  }
  console.log(`提交规范检查通过：${checked} 个提交。`);
}

try {
  checkCommits();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
