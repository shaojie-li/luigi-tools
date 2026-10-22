import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AppError } from "./errors.js";
import { loadRegistry, readSource } from "./registry.js";
import type { LoadedRegistry } from "./registry.js";
import { parseData, registrySchema, sha256 } from "./schema.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const key = z
  .string()
  .regex(/^(skill|ui|preset|template)\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
const reference = z.strictObject({
  url: z.string().min(1).max(2048),
  sha256: digest.optional(),
});
export const sourcesSchema = z.strictObject({
  schemaVersion: z.literal(2),
  sources: z.array(reference).min(1).max(10),
});
export const catalogSchema = z.strictObject({
  schemaVersion: z.literal(2),
  entries: z
    .array(
      z.strictObject({
        type: z.enum(["skill", "ui", "preset", "template"]),
        name: z
          .string()
          .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
          .max(64),
        description: z.string().min(1).max(1024),
        version,
        url: z.string().min(1).max(2048),
        sha256: digest,
        requires: z
          .array(z.strictObject({ key, version }))
          .max(100)
          .default([]),
      }),
    )
    .max(1000),
});
export type CatalogEntry = z.infer<typeof catalogSchema>["entries"][number];
export interface Catalog {
  source: string;
  sha256: string;
  version: string;
  entries: CatalogEntry[];
  legacy?: LoadedRegistry;
}

// Remote catalogs may reference only HTTPS; relative URLs resolve against the catalog URL.
export function resolveSource(base: string, child: string): string {
  if (/^https:\/\//.test(base)) {
    const url = new URL(child, base);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new AppError(
        "INVALID_SOURCE",
        "远程索引只能引用无凭据的 HTTPS 来源",
        2,
      );
    return url.href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(child)) {
    const url = new URL(child);
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new AppError(
        "INVALID_SOURCE",
        "索引只支持本地路径或 HTTPS 来源",
        2,
      );
    return url.href;
  }
  return resolve(dirname(base), child);
}

export async function loadCatalog(
  source?: string,
  expectedSha256?: string,
  fetcher: typeof fetch = fetch,
): Promise<Catalog> {
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256))
    throw new AppError(
      "INVALID_DIGEST",
      "--source-sha256 必须是 64 位小写十六进制摘要",
      2,
    );
  const location =
    source ??
    process.env.LT_SOURCE ??
    fileURLToPath(new URL("../sources.json", import.meta.url));
  const loaded = await readSource(location, undefined, fetcher);
  const legacy = registrySchema.safeParse(loaded.data);
  if (legacy.success) {
    if (expectedSha256 && expectedSha256 !== loaded.sha256)
      throw new AppError(
        "SOURCE_MISMATCH",
        "目录摘要与 --source-sha256 不匹配",
      );
    const registry = { ...loaded, data: legacy.data };
    return {
      ...loaded,
      version: legacy.data.version,
      legacy: registry,
      entries: [
        ...legacy.data.skills.map((s) => ({
          type: "skill" as const,
          name: s.name,
          description: s.description,
          version: legacy.data.version,
          url: loaded.source,
          sha256: loaded.sha256,
          requires: [],
        })),
        ...legacy.data.assets.map((a) => ({
          type: a.type,
          name: a.name,
          description: a.description,
          version: legacy.data.version,
          url: loaded.source,
          sha256: loaded.sha256,
          requires: a.requires.map((key) => ({
            key,
            version: legacy.data.version,
          })),
        })),
      ],
    };
  }
  const sources = sourcesSchema.safeParse(loaded.data);
  const entries: CatalogEntry[] = [];
  const hashes = [loaded.sha256];
  const indexes = sources.success
    ? await Promise.all(
        sources.data.sources.map(async (ref) =>
          readSource(
            resolveSource(loaded.source, ref.url),
            ref.sha256,
            fetcher,
          ),
        ),
      )
    : [loaded];
  for (const index of indexes) {
    const catalog = parseData(catalogSchema, index.data, "资产索引");
    if (sources.success) hashes.push(index.sha256);
    entries.push(
      ...catalog.entries.map((entry) => ({
        ...entry,
        url: resolveSource(index.source, entry.url),
      })),
    );
  }
  const identities = new Set<string>();
  for (const entry of entries) {
    const identity = `${entry.type}/${entry.name}@${entry.version}`;
    if (identities.has(identity))
      throw new AppError("INVALID_DATA", `重复资产版本：${identity}`, 2);
    identities.add(identity);
  }
  const hash = sources.success ? sha256(hashes.join("\n")) : loaded.sha256;
  if (
    expectedSha256 &&
    (!/^[a-f0-9]{64}$/.test(expectedSha256) || expectedSha256 !== hash)
  )
    throw new AppError("SOURCE_MISMATCH", "目录摘要与 --source-sha256 不匹配");
  return { source: loaded.source, sha256: hash, version: "2", entries };
}

export function latestEntries(catalog: Catalog): CatalogEntry[] {
  const latest = new Map<string, CatalogEntry>();
  for (const entry of catalog.entries) {
    const key = `${entry.type}/${entry.name}`;
    const previous = latest.get(key);
    if (!previous || compareVersions(entry.version, previous.version) > 0)
      latest.set(key, entry);
  }
  return [...latest.values()];
}
function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number),
    right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = left[i]! - right[i]!;
    if (diff) return diff;
  }
  return 0;
}

export async function materialize(
  catalog: Catalog,
  keys: string[],
  fetcher: typeof fetch = fetch,
): Promise<LoadedRegistry> {
  if (catalog.legacy) return catalog.legacy;
  const selected = new Map<string, CatalogEntry>();
  const visiting = new Set<string>();
  const latest = latestEntries(catalog);
  function visit(key: string, version?: string) {
    if (visiting.has(key))
      throw new AppError("INVALID_DATA", `资产循环依赖：${key}`, 2);
    const entry = version
      ? catalog.entries.find(
          (e) => `${e.type}/${e.name}` === key && e.version === version,
        )
      : latest.find((e) => `${e.type}/${e.name}` === key);
    if (!entry)
      throw new AppError(
        "UNKNOWN_ASSET",
        `找不到资产：${key}${version ? `@${version}` : ""}`,
        2,
      );
    const previous = selected.get(key);
    if (previous) {
      if (previous.version !== entry.version)
        throw new AppError(
          "VERSION_CONFLICT",
          `依赖版本冲突：${key}@${previous.version} / ${entry.version}`,
          2,
        );
      return;
    }
    if (
      entry.type !== "template" &&
      entry.requires.some(
        (ref) =>
          ref.key.startsWith("skill/") || ref.key.startsWith("template/"),
      )
    )
      throw new AppError(
        "INVALID_DATA",
        `仅模板可组合 Skills，依赖中不允许模板：${key}`,
        2,
      );
    if (entry.requires.some((ref) => ref.key.startsWith("template/")))
      throw new AppError("INVALID_DATA", "不允许模板依赖模板", 2);
    if (entry.type === "skill" && entry.requires.length)
      throw new AppError("INVALID_DATA", "Skill 必须自包含", 2);
    visiting.add(key);
    for (const ref of entry.requires) visit(ref.key, ref.version);
    visiting.delete(key);
    selected.set(key, entry);
    if (selected.size > 100)
      throw new AppError("INVALID_DATA", "单次安装最多 100 个资产", 2);
  }
  for (const key of keys) visit(key);
  const result: LoadedRegistry = {
    data: {
      schemaVersion: 1,
      version: selected.get(keys[0]!)?.version ?? "0.0.0",
      skills: [],
      assets: [],
    },
    source: catalog.source,
    sha256: catalog.sha256,
  };
  let total = 0;
  // Bound concurrent memory use; every payload is verified before the transaction begins.
  for (const [key, entry] of selected) {
    const payload = await loadRegistry(entry.url, entry.sha256, fetcher);
    const { skills, assets } = payload.data;
    if (
      payload.data.version !== entry.version ||
      skills.length + assets.length !== 1
    )
      throw new AppError("INVALID_DATA", `资产快照与索引版本不匹配：${key}`, 2);
    const item = entry.type === "skill" ? skills[0] : assets[0];
    if (
      !item ||
      item.name !== entry.name ||
      ("type" in item && item.type !== entry.type) ||
      (assets[0] && assets[0].requires.length)
    )
      throw new AppError("INVALID_DATA", `资产快照与索引身份不匹配：${key}`, 2);
    total += item.files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content),
      0,
    );
    if (total > 20 * 1024 * 1024)
      throw new AppError("SOURCE_TOO_LARGE", "单次安装超过 20 MB 限制");
    if (entry.type === "skill") result.data.skills.push(skills[0]!);
    else
      result.data.assets.push({
        ...assets[0]!,
        requires: entry.requires
          .filter((ref) => !ref.key.startsWith("skill/"))
          .map((ref) => ref.key),
      });
  }
  // Reuse all file/path/digest checks, including references in the resolved graph.
  result.data = parseData(registrySchema, result.data, "安装计划");
  return result;
}
