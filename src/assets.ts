import { readFile } from "node:fs/promises";
import { AppError } from "./errors.js";
import { safePath, statIfExists } from "./project.js";
import { planSkills } from "./install.js";
import type { LoadedRegistry } from "./registry.js";
import { parseJson } from "./schema.js";
import type { Agent, Asset, AssetType } from "./schema.js";
import { transact } from "./transaction.js";

export async function installAssets(
  root: string,
  registry: LoadedRegistry,
  type: AssetType,
  names: string[],
  dryRun: boolean,
  agent?: Agent,
) {
  const initialize = type === "template";
  if (initialize && !agent)
    throw new AppError(
      "MISSING_AGENT",
      "初始化模板需要 --agent codex 或 --agent claude",
      2,
    );
  const assets: Asset[] = [];
  const visiting = new Set<string>();
  const resolved = new Set<string>();
  function visit(key: string) {
    if (resolved.has(key)) return;
    if (visiting.has(key))
      throw new AppError("INVALID_DATA", `资产循环依赖：${key}`, 2);
    const asset = registry.data.assets.find(
      (item) => `${item.type}/${item.name}` === key,
    );
    if (!asset) throw new AppError("UNKNOWN_ASSET", `找不到资产：${key}`, 2);
    visiting.add(key);
    for (const dependency of asset.requires) visit(dependency);
    visiting.delete(key);
    resolved.add(key);
    assets.push(asset);
  }
  for (const name of names) visit(`${type}/${name}`);
  if (!names.length) throw new AppError("MISSING_ASSET", "至少选择一个资产", 2);
  const prepare = async () => {
    const files: { path: string; content: string }[] = [];
    const reserveDirs: string[] = [];
    const items: {
      name: string;
      target: string;
      action: "install" | "unchanged";
    }[] = [];
    for (const asset of assets) {
      let identical = 0;
      for (const file of asset.files) {
        const path = await safePath(root, file.path);
        if (
          files.some(
            (entry) => entry.path.toLowerCase() === file.path.toLowerCase(),
          )
        )
          throw new AppError("CONFLICT", `资产目标重复，未覆盖：${file.path}`);
        const existing = await statIfExists(path);
        if (existing) {
          if (
            !existing.isFile() ||
            (await readFile(path, "utf8")) !== file.content
          )
            throw new AppError(
              "CONFLICT",
              `文件已存在且内容不同，未覆盖：${file.path}`,
            );
          identical++;
        }
      }
      if (identical && identical !== asset.files.length)
        throw new AppError(
          "CONFLICT",
          `资产文件仅部分存在，未覆盖：${asset.type}/${asset.name}`,
        );
      if (identical === asset.files.length) {
        items.push({
          name: `${asset.type}/${asset.name}`,
          target: asset.files.map((file) => file.path).join(", "),
          action: "unchanged",
        });
        continue;
      }
      files.push(
        ...asset.files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      );
      items.push({
        name: `${asset.type}/${asset.name}`,
        target: asset.files.map((file) => file.path).join(", "),
        action: "install",
      });
    }
    const dependencies = Object.assign(
      {},
      ...assets.map((asset) => asset.dependencies),
    ) as Record<string, string>;
    if (Object.keys(dependencies).length) {
      const packageFile = files.find((file) => file.path === "package.json");
      const packagePath = await safePath(root, "package.json");
      const json =
        packageFile?.content ??
        ((await statIfExists(packagePath))
          ? await readFile(packagePath, "utf8")
          : "{}");
      const pkg = parseJson(json, "package.json") as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      if (!pkg || typeof pkg !== "object")
        throw new AppError("INVALID_PROJECT", "package.json 必须是对象", 2);
      const missing = Object.keys(dependencies).filter(
        (name) => !pkg.dependencies?.[name] && !pkg.devDependencies?.[name],
      );
      if (missing.length)
        throw new AppError(
          "MISSING_DEPENDENCY",
          `项目缺少组件依赖。先执行 npm install ${missing.map((name) => `${name}@${dependencies[name]}`).join(" ")}，再重试。未写入文件。`,
        );
    }
    if (initialize && agent) {
      const skills = await planSkills(
        root,
        registry,
        registry.data.skills.map((skill) => skill.name),
        agent,
      );
      reserveDirs.push(...skills.reserveDirs);
      files.push(...skills.files);
      items.push(
        ...skills.items.map((item) => ({
          ...item,
          name: `skill/${item.name}`,
        })),
      );
    }
    return {
      files,
      reserveDirs,
      items,
    };
  };
  const result = await transact(root, prepare, dryRun);
  return {
    command: initialize ? "init" : "add",
    ok: true,
    root,
    version: registry.data.version,
    source: registry.source,
    sourceSha256: registry.sha256,
    dryRun,
    items: result.items,
    nextSteps: initialize
      ? [`cd ${JSON.stringify(root)}`, "npm install", "npm run dev"]
      : assets.some(
            (asset) => asset.type === "preset" && asset.name === "code-quality",
          )
        ? [
            "npx --yes --package=tsx@4.23.15 tsx tooling/setup-project.ts",
            "npm install",
            "npm run check",
          ]
        : [],
  };
}
