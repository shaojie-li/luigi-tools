import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  parseData,
  parseJson,
  registrySchema,
  sha256,
} from "../packages/cli/src/schema.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const license = await readFile(join(root, "LICENSE"), "utf8");
const catalog = parseJson(
  await readFile(join(root, "skills/catalog.json"), "utf8"),
  "目录描述",
) as { schemaVersion: number; version: string; skills: string[] };
async function readFiles(directory: string) {
  const files: { path: string; content: string; sha256: string }[] = [];
  async function walk(path: string, prefix = ""): Promise<void> {
    const entries = (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, "en"),
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        throw new Error(`不分发符号链接：${entry.name}`);
      if (entry.isDirectory())
        await walk(join(path, entry.name), `${prefix}${entry.name}/`);
      else if (entry.isFile()) {
        const content = new TextDecoder("utf-8", { fatal: true }).decode(
          await readFile(join(path, entry.name)),
        );
        files.push({
          path: `${prefix}${entry.name}`,
          content,
          sha256: sha256(content),
        });
      } else throw new Error(`不支持的文件：${entry.name}`);
    }
  }
  await walk(directory);
  return files;
}
const skills = [];
for (const name of catalog.skills) {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new Error(`非法 Skill 名称：${name}`);
  const directory = join(root, "skills", name);
  const files = await readFiles(directory);
  const content = files.find((file) => file.path === "SKILL.md")?.content;
  const frontmatter = content?.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  )?.[1];
  if (!frontmatter) throw new Error(`${name} 缺少 YAML frontmatter`);
  const metadata = parse(frontmatter) as {
    name?: unknown;
    description?: unknown;
  };
  if (metadata.name !== name || typeof metadata.description !== "string")
    throw new Error(`${name} 的元数据不匹配`);
  files.push({ path: "LICENSE", content: license, sha256: sha256(license) });
  skills.push({ name, description: metadata.description, files });
}
const assetCatalog = parseJson(
  await readFile(join(root, "registry/catalog.json"), "utf8"),
  "资产目录",
) as {
  assets: {
    directory: string;
    type: string;
    name: string;
    description: string;
    requires?: string[];
    dependencies?: Record<string, string>;
  }[];
};
const assets = [];
for (const { directory, ...metadata } of assetCatalog.assets) {
  const files = await readFiles(join(root, directory));
  if (metadata.type === "preset" && metadata.name === "code-quality") {
    const content = await readFile(
      join(root, "docs/coding-standards.md"),
      "utf8",
    );
    files.push({
      path: "docs/coding-standards.md",
      content,
      sha256: sha256(content),
    });
  }
  // Independent assets need their own notices without colliding when composed.
  const notice = `@luigix/tools: ${metadata.type}/${metadata.name}\n\n${license}`;
  files.push({
    path: `licenses/luigi-tools/${metadata.type}-${metadata.name}.txt`,
    content: notice,
    sha256: sha256(notice),
  });
  assets.push({ ...metadata, files });
}
const registry = parseData(
  registrySchema,
  {
    schemaVersion: catalog.schemaVersion,
    version: catalog.version,
    skills,
    assets,
  },
  "内置目录",
);
const output = join(root, "packages/cli/registry");
await mkdir(output, { recursive: true });
await writeFile(join(root, "packages/cli/LICENSE"), license);
await writeFile(
  join(output, "index.json"),
  `${JSON.stringify(registry, null, 2)}\n`,
);
console.log(
  `已构建 ${skills.length} 个 Skills 和 ${assets.length} 个资产 · v${registry.version}`,
);
