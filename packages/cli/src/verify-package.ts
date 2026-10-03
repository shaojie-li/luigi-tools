import { readFile } from "node:fs/promises";
import { loadRegistry } from "./registry.js";

// Runs during npm pack/publish, never during consumer installation.
const metadata = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const registry = await loadRegistry();
if (registry.data.version !== metadata.version)
  throw new Error("CLI 与内置目录版本不同，请更新目录版本并重新构建。");
await readFile(new URL("./index.js", import.meta.url));
console.log(
  `已验证分发包：${registry.data.skills.length} 个 Skills，${registry.data.assets.length} 个资产。`,
);
