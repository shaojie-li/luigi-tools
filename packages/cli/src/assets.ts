import { mkdir, readFile, rmdir } from "node:fs/promises";
import { AppError } from "./errors.js";
import {
  destination,
  inspectAsset,
  inspectInstallation,
  readManifest,
  safePath,
  statIfExists,
} from "./project.js";
import type { LoadedRegistry } from "./registry.js";
import { parseJson } from "./schema.js";
import type {
  Agent,
  Asset,
  AssetType,
  Installation,
  ProjectAsset,
} from "./schema.js";
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
    const manifest = await readManifest(root);
    const additions: ProjectAsset[] = [];
    const skillAdditions: Installation[] = [];
    const files: { path: string; content: string }[] = [];
    const reserveDirs: string[] = [];
    const items: {
      name: string;
      target: string;
      action: "install" | "unchanged";
    }[] = [];
    for (const asset of assets) {
      const existing = manifest.assets.find(
        (item) => item.type === asset.type && item.name === asset.name,
      );
      if (existing) {
        const issues = await inspectAsset(root, existing);
        if (
          existing.version !== registry.data.version ||
          issues.length ||
          existing.files.length !== asset.files.length ||
          !existing.files.every((file) =>
            asset.files.some(
              (next) => file.path === next.path && file.sha256 === next.sha256,
            ),
          )
        )
          throw new AppError(
            "CONFLICT",
            `${asset.type}/${asset.name} 存在版本或本地差异，未覆盖。${issues.join("；")}`,
          );
        items.push({
          name: `${asset.type}/${asset.name}`,
          target: existing.files.map((file) => file.path).join(", "),
          action: "unchanged",
        });
        continue;
      }
      for (const file of asset.files) {
        const path = await safePath(root, file.path);
        if (
          (await statIfExists(path)) ||
          files.some(
            (entry) => entry.path.toLowerCase() === file.path.toLowerCase(),
          )
        )
          throw new AppError(
            "CONFLICT",
            `文件已存在或资产目标重复，未覆盖：${file.path}`,
          );
        files.push({ path: file.path, content: file.content });
      }
      additions.push({
        type: asset.type,
        name: asset.name,
        version: registry.data.version,
        source: registry.source,
        sourceSha256: registry.sha256,
        files: asset.files.map(({ path, sha256 }) => ({ path, sha256 })),
      });
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
    if (initialize && agent)
      for (const skill of registry.data.skills) {
        const record: Installation = {
          name: skill.name,
          agent,
          version: registry.data.version,
          source: registry.source,
          sourceSha256: registry.sha256,
          files: skill.files.map(({ path, sha256 }) => ({ path, sha256 })),
        };
        const existing = manifest.installations.find(
          (item) => item.agent === agent && item.name === skill.name,
        );
        if (existing) {
          const issues = await inspectInstallation(root, existing);
          if (
            issues.length ||
            existing.version !== record.version ||
            existing.files.length !== record.files.length ||
            !existing.files.every((file) =>
              record.files.some(
                (next) =>
                  file.path === next.path && file.sha256 === next.sha256,
              ),
            )
          )
            throw new AppError("CONFLICT", `Skill 存在差异：${skill.name}`);
          continue;
        }
        const target = destination(record);
        if (await statIfExists(await safePath(root, target)))
          throw new AppError("CONFLICT", `Skill 目录已存在：${target}`);
        skillAdditions.push(record);
        reserveDirs.push(target);
        files.push(
          ...skill.files.map((file) => ({
            path: `${target}/${file.path}`,
            content: file.content,
          })),
        );
        items.push({ name: `skill/${skill.name}`, target, action: "install" });
      }
    return {
      manifest: {
        ...manifest,
        assets: [...manifest.assets, ...additions],
        installations: [...manifest.installations, ...skillAdditions],
      },
      files,
      reserveDirs,
      items,
    };
  };
  // Preview validates the entire plan before even creating a new project directory.
  await prepare();
  let createdRoot = false;
  if (!dryRun && !(await statIfExists(root))) {
    await mkdir(root);
    createdRoot = true;
  }
  try {
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
              (asset) =>
                asset.type === "preset" && asset.name === "code-quality",
            )
          ? [
              "npx --yes --package=tsx@4.23.15 tsx tooling/setup-project.ts",
              "npm install",
              "npm run check",
            ]
          : [],
    };
  } catch (error) {
    if (createdRoot) await rmdir(root);
    throw error;
  }
}
