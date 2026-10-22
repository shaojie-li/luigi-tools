import { readFile } from "node:fs/promises";
import { sourcesSchema } from "./catalog.js";
import { parseData, parseJson } from "./schema.js";

// Package validation is offline and does not require content repositories.
parseData(
  sourcesSchema,
  parseJson(
    await readFile(new URL("../sources.json", import.meta.url), "utf8"),
    "默认来源",
  ),
  "默认来源",
);
await readFile(new URL("./index.js", import.meta.url));
await readFile(new URL("../LICENSE", import.meta.url));
console.log("已验证 CLI 分发包：默认来源配置、可执行文件和许可证。");
