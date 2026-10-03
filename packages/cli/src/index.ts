#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command, CommanderError } from "commander";
import { execute, render } from "./commands.js";
import type { Options } from "./commands.js";
import { AppError } from "./errors.js";
import { prompts } from "./prompts.js";

const json = process.argv.slice(2).includes("--json");
const program = new Command();
const metadata = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

async function run(
  command: string | undefined,
  kind?: string,
  names: string[] = [],
) {
  const options = program.opts<Options>();
  const interactive = Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !options.json &&
    !options.nonInteractive &&
    !process.env.CI,
  );
  const result = await execute(
    command,
    kind,
    names,
    options,
    interactive ? prompts : undefined,
  );
  process.stdout.write(
    `${options.json ? JSON.stringify(result) : render(result)}\n`,
  );
  if (!result.ok) process.exitCode = 1;
}

program
  .name("lt")
  .description("初始化业务项目，安装 Skills、UI 与项目预设")
  .version(metadata.version)
  .option("--cwd <directory>", "项目目录，默认当前目录")
  .option("--agent <agent>", "安装目标：codex 或 claude")
  .option("--source <path-or-url>", "本地或 HTTPS 目录 JSON，默认内置快照")
  .option("--source-sha256 <digest>", "固定目录原始内容的 SHA-256")
  .option("--dry-run", "检查安装计划，不写入文件")
  .option("--non-interactive", "禁用交互，参数不足时失败")
  .option("--json", "输出 JSON，同时禁用交互")
  .showSuggestionAfterError()
  .exitOverride()
  .configureOutput({ writeErr: () => {} })
  .action(() => run(undefined));
program
  .command("list")
  .description("查看可安装资产和已有安装记录")
  .action(() => run("list"));
program
  .command("init")
  .description("从业务模板初始化项目（包含 UI、预设与 Skills）")
  .argument("[template]", "模板名称")
  .action((template: string | undefined) =>
    run("init", "template", template ? [template] : []),
  );
program
  .command("add")
  .description("安装资产；参数不完整时交互选择")
  .argument("[type]", "skill、ui 或 preset")
  .argument("[names...]", "资产名称")
  .action((kind: string | undefined, names: string[]) =>
    run("add", kind, names),
  );
program
  .command("doctor")
  .description("离线检查本地受管理文件")
  .action(() => run("doctor"));

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0)
    process.exitCode = 0;
  else {
    const failure =
      error instanceof AppError
        ? error
        : new AppError(
            error instanceof CommanderError
              ? "INVALID_ARGUMENT"
              : "OPERATION_FAILED",
            error instanceof Error ? error.message : String(error),
            error instanceof CommanderError ? 2 : 1,
          );
    const output = {
      ok: false,
      error: { code: failure.code, message: failure.message },
    };
    if (json) process.stdout.write(`${JSON.stringify(output)}\n`);
    else if (failure.code !== "CANCELLED")
      process.stderr.write(`错误：${failure.message}\n`);
    process.exitCode = failure.exitCode;
  }
}
