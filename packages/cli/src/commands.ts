import { basename, dirname, join, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { installAssets } from "./assets.js";
import { AppError } from "./errors.js";
import { install } from "./install.js";
import {
  doctor,
  projectRoot,
  readManifest,
  safePath,
  statIfExists,
} from "./project.js";
import type { Prompts } from "./prompts.js";
import { loadRegistry } from "./registry.js";
import {
  agentPaths,
  agentSchema,
  assetTypeSchema,
  parseData,
} from "./schema.js";
import type { Agent } from "./schema.js";

export interface Options {
  cwd?: string;
  agent?: string;
  source?: string;
  sourceSha256?: string;
  dryRun?: boolean;
  json?: boolean;
  nonInteractive?: boolean;
}

export async function execute(
  action: string | undefined,
  kind: string | undefined,
  names: string[],
  options: Options,
  ui: Prompts | undefined,
) {
  const requireUi = () => {
    if (!ui)
      throw new AppError(
        "MISSING_ARGUMENT",
        "参数不完整。示例：lt list 或 lt add skill web-ui --agent codex --non-interactive",
        2,
      );
    return ui;
  };
  const command = action ?? (await requireUi().action());
  const target = resolve(options.cwd ?? process.cwd());
  const root =
    command === "init" && !(await statIfExists(target))
      ? join(await realpath(dirname(target)), basename(target))
      : await projectRoot(target);
  if (command === "doctor") {
    if (
      options.source ||
      options.sourceSha256 ||
      options.dryRun ||
      options.agent
    )
      throw new AppError(
        "INVALID_OPTION",
        "doctor 检查全部本地安装，不接受 --source、--source-sha256、--dry-run 或 --agent",
        2,
      );
    return doctor(root);
  }
  if (command === "list" && options.dryRun)
    throw new AppError("INVALID_OPTION", "--dry-run 仅适用于 add", 2);
  const registry = await loadRegistry(options.source, options.sourceSha256);
  const manifest = await readManifest(root);
  let agent = options.agent
    ? parseData(agentSchema, options.agent, "Agent")
    : undefined;
  if (command === "list") {
    return {
      command,
      ok: true,
      root,
      version: registry.data.version,
      source: registry.source,
      sourceSha256: registry.sha256,
      assets: registry.data.assets.map((asset) => ({
        type: asset.type,
        name: asset.name,
        description: asset.description,
        installed: manifest.assets.some(
          (record) => record.type === asset.type && record.name === asset.name,
        ),
      })),
      skills: registry.data.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        installed: manifest.installations
          .filter(
            (record) =>
              record.name === skill.name && (!agent || record.agent === agent),
          )
          .map((record) => ({ agent: record.agent, version: record.version })),
      })),
    };
  }
  const type =
    command === "init" ? "template" : (kind ?? (await requireUi().kind()));
  if (type !== "skill") parseData(assetTypeSchema, type, "资产类型");
  if (type === "template" && command !== "init")
    throw new AppError("INVALID_KIND", "模板请使用 lt init <template>", 2);
  if (!agent && (type === "skill" || type === "template")) {
    const detected: Agent[] = [];
    for (const [key, prefix] of Object.entries(agentPaths)) {
      const directory = prefix.split("/")[0]!;
      if ((await statIfExists(await safePath(root, directory)))?.isDirectory())
        detected.push(key as Agent);
    }
    agent = detected.length === 1 ? detected[0]! : await requireUi().agent();
  }
  if (type !== "skill") {
    const selected = names.length
      ? names
      : await requireUi().assets(
          registry.data.assets.filter((asset) => asset.type === type),
          type === "template",
        );
    const result = await installAssets(
      root,
      registry,
      parseData(assetTypeSchema, type, "资产类型"),
      selected,
      options.dryRun ?? false,
      agent,
    );
    return {
      ...result,
      replay: replayCommand(
        command,
        type,
        selected,
        root,
        registry.source,
        registry.sha256,
        options,
        agent,
      ),
    };
  }
  const selected = names.length
    ? names
    : await requireUi().skills(
        registry.data.skills,
        manifest.installations
          .filter((record) => record.agent === agent)
          .map((record) => record.name),
      );
  const result = await install(
    root,
    registry,
    selected,
    agent!,
    options.dryRun,
  );
  return {
    ...result,
    replay: replayCommand(
      "add",
      "skill",
      selected,
      root,
      registry.source,
      registry.sha256,
      options,
      agent,
    ),
  };
}

function replayCommand(
  command: string,
  type: string,
  names: string[],
  root: string,
  source: string,
  digest: string,
  options: Options,
  agent?: Agent,
) {
  const commandArgs = [
    "lt",
    command,
    ...(command === "init" ? [] : [type]),
    ...new Set(names),
    "--cwd",
    root,
  ];
  if (agent) commandArgs.push("--agent", agent);
  if (options.source) commandArgs.push("--source", source);
  commandArgs.push("--source-sha256", digest, "--non-interactive");
  if (options.dryRun) commandArgs.push("--dry-run");
  return commandArgs
    .map((arg) =>
      /^[a-zA-Z0-9_./:=@-]+$/.test(arg)
        ? arg
        : "'" + arg.replaceAll("'", "'\\''") + "'",
    )
    .join(" ");
}

export type Result = Awaited<ReturnType<typeof execute>>;

export function render(result: Result): string {
  if (result.command === "list" && "skills" in result) {
    return [
      `可用资产 · v${result.version} · ${result.source}`,
      ...result.skills.map(
        (skill) =>
          `${skill.name}\t${skill.description}${skill.installed.length ? ` [安装记录：${skill.installed.map((item) => `${item.agent}@${item.version}`).join(", ")}]` : ""}`,
      ),
      ...(result.assets ?? []).map(
        (asset) =>
          `${asset.type}/${asset.name}\t${asset.description}${asset.installed ? " [已安装]" : ""}`,
      ),
    ].join("\n");
  }
  if (result.command === "doctor" && "checks" in result) {
    return [
      `项目：${result.root}`,
      ...(!result.initialized ? ["尚无受管理的资产安装记录。"] : []),
      ...result.checks.map(
        (check) =>
          `${check.ok ? "✓" : "✗"} ${check.name}${check.issues.length ? `\n  ${check.issues.join("\n  ")}` : "：文件完整"}`,
      ),
      ...(result.unmanaged.length
        ? [`未管理的目录（不修改）：${result.unmanaged.join(", ")}`]
        : []),
    ].join("\n");
  }
  if ("items" in result) {
    return [
      `${result.dryRun ? "预览，未写入" : "安装结果"} · v${result.version} · ${result.root}`,
      ...result.items.map(
        (item) =>
          `${item.action === "unchanged" ? "保持不变" : result.dryRun ? "将安装" : "已安装"}：${item.target}`,
      ),
      `复用命令：${result.replay}`,
      ...("nextSteps" in result ? result.nextSteps : []),
    ].join("\n");
  }
  throw new AppError("INTERNAL_ERROR", "无法显示命令结果");
}
