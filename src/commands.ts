import { installAssets } from "./assets.js";
import { installDependencies } from "./dependencies.js";
import { AppError } from "./errors.js";
import { install } from "./install.js";
import { doctor } from "./doctor.js";
import { discoverSkills } from "./skills.js";
import { projectRoot, safePath, statIfExists } from "./project.js";
import type { Prompts } from "./prompts.js";
import { loadCatalog, latestEntries, materialize } from "./catalog.js";
import {
  agentPaths,
  agentSchema,
  assetTypeSchema,
  parseData,
  packageManagerSchema,
} from "./schema.js";
import type { Agent } from "./schema.js";
import { resolveWriteTarget } from "./write-target.js";

export interface Options {
  cwd?: string;
  agent?: string;
  source?: string;
  sourceSha256?: string;
  dryRun?: boolean;
  json?: boolean;
  nonInteractive?: boolean;
  packageManager?: string;
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
        "参数不完整。示例：lt list 或 lt add skill web-ui --agent codex --cwd . --non-interactive",
        2,
      );
    return ui;
  };
  const command = action ?? (await requireUi().action());
  if (options.packageManager !== undefined && command !== "init")
    throw new AppError("INVALID_OPTION", "--package-manager 仅适用于 init", 2);
  let packageManager =
    options.packageManager !== undefined
      ? parseData(packageManagerSchema, options.packageManager, "包管理器")
      : undefined;
  const root =
    command === "init" || command === "add"
      ? await resolveWriteTarget(
          options.cwd ?? (ui && command === "add" ? process.cwd() : undefined),
          ui,
        )
      : await projectRoot(options.cwd ?? process.cwd());
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
  let agent = options.agent
    ? parseData(agentSchema, options.agent, "Agent")
    : undefined;
  if (!ui && command !== "list" && !names.length) requireUi();
  const type =
    command === "list"
      ? undefined
      : command === "init"
        ? "template"
        : (kind ?? (await requireUi().kind()));
  if (type && type !== "skill") parseData(assetTypeSchema, type, "资产类型");
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
  const catalog = await loadCatalog(options.source, options.sourceSha256);
  const entries = latestEntries(catalog);
  const localSkills =
    type === undefined || type === "skill"
      ? await discoverSkills(root, agent)
      : [];
  if (type === undefined) {
    return {
      command,
      ok: true,
      root,
      version: catalog.version,
      source: catalog.source,
      sourceSha256: catalog.sha256,
      assets: entries
        .filter((entry) => entry.type !== "skill")
        .map((asset) => ({
          type: asset.type,
          name: asset.name,
          description: asset.description,
          version: asset.version,
          installed: null,
        })),
      skills: entries
        .filter((entry) => entry.type === "skill")
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          version: skill.version,
          installed: localSkills
            .filter((local) => local.name === skill.name)
            .map((local) => ({ agent: local.agent, path: local.path })),
        })),
    };
  }
  if (type !== "skill") {
    const selected = names.length
      ? names
      : await requireUi().assets(
          entries.filter((asset) => asset.type === type),
          type === "template",
        );
    if (command === "init")
      packageManager ??= ui ? await ui.packageManager() : "none";
    const registry = await materialize(
      catalog,
      selected.map((name) => `${type}/${name}`),
    );
    const result = await installAssets(
      root,
      registry,
      parseData(assetTypeSchema, type, "资产类型"),
      selected,
      options.dryRun ?? false,
      agent,
    );
    const dependencies =
      packageManager === undefined
        ? undefined
        : {
            packageManager,
            status:
              packageManager === "none"
                ? ("skipped" as const)
                : result.dryRun
                  ? ("planned" as const)
                  : ("installed" as const),
          };
    if (packageManager && packageManager !== "none" && !result.dryRun)
      await installDependencies(root, packageManager);
    const manager = packageManager === "pnpm" ? "pnpm" : "npm";
    return {
      ...result,
      ...(dependencies ? { dependencies } : {}),
      nextSteps:
        command === "init"
          ? [
              `cd ${JSON.stringify(root)}`,
              ...(dependencies?.status === "installed"
                ? []
                : [`${manager} install`]),
              `${manager} run tooling:setup`,
              `${manager} run dev`,
            ]
          : result.nextSteps,
      replay: replayCommand(
        command,
        type,
        selected,
        root,
        registry.source,
        registry.sha256,
        packageManager ? { ...options, packageManager } : options,
        agent,
      ),
    };
  }
  const selected = names.length
    ? names
    : await requireUi().skills(
        entries.filter((entry) => entry.type === "skill"),
        [...new Set(localSkills.map((skill) => skill.name))],
      );
  const registry = await materialize(
    catalog,
    selected.map((name) => `skill/${name}`),
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
  commandArgs.push("--source", source);
  if (options.packageManager)
    commandArgs.push("--package-manager", options.packageManager);
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
      `可用资产 · ${result.source}`,
      ...result.skills.map(
        (skill) =>
          `${skill.name}@${skill.version}\t${skill.description}${skill.installed.length ? ` [已安装：${skill.installed.map((item) => item.agent).join(", ")}]` : ""}`,
      ),
      ...(result.assets ?? []).map(
        (asset) =>
          `${asset.type}/${asset.name}@${asset.version}\t${asset.description}${asset.installed ? " [已安装]" : ""}`,
      ),
    ].join("\n");
  }
  if (result.command === "doctor" && "checks" in result) {
    return [
      `项目：${result.root}`,
      "检查本地 Skill 元数据和安装锁；不校验历史版本或 UI/预设文件差异。",
      ...result.checks.map(
        (check) =>
          `${check.ok ? "✓" : "✗"} ${check.name}${check.issues.length ? `\n  ${check.issues.join("\n  ")}` : "：元数据有效"}`,
      ),
    ].join("\n");
  }
  if ("items" in result) {
    return [
      `${result.dryRun ? "预览，未写入" : "安装结果"} · ${result.root}`,
      ...result.items.map(
        (item) =>
          `${item.action === "unchanged" ? "保持不变" : result.dryRun ? "将安装" : "已安装"}：${item.target}`,
      ),
      `复用命令：${result.replay}`,
      ...("dependencies" in result && result.dependencies
        ? [
            result.dependencies.status === "skipped"
              ? "依赖：暂未安装"
              : `依赖：${result.dependencies.status === "planned" ? "将使用" : "已使用"} ${result.dependencies.packageManager} 安装`,
          ]
        : []),
      ...("nextSteps" in result ? result.nextSteps : []),
    ].join("\n");
  }
  throw new AppError("INTERNAL_ERROR", "无法显示命令结果");
}
