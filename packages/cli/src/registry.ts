import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.js";
import { parseData, parseJson, registrySchema, sha256 } from "./schema.js";
import type { Registry } from "./schema.js";

const maxBytes = 2 * 1024 * 1024;
export interface LoadedRegistry {
  data: Registry;
  source: string;
  sha256: string;
}

export async function loadRegistry(
  source?: string,
  expectedSha256?: string,
  fetcher: typeof fetch = fetch,
): Promise<LoadedRegistry> {
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new AppError(
      "INVALID_DIGEST",
      "--source-sha256 必须是 64 位小写十六进制摘要",
      2,
    );
  }
  const location =
    source ?? fileURLToPath(new URL("../registry/index.json", import.meta.url));
  let bytes: Uint8Array;
  let identity: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(location)) {
    const url = new URL(location);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new AppError(
        "INVALID_SOURCE",
        "远程目录必须是无凭据、无 fragment 的 HTTPS URL",
        2,
      );
    }
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok || !response.body)
      throw new AppError(
        "DOWNLOAD_FAILED",
        `目录下载失败：HTTP ${response.status}`,
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes)
        throw new AppError("SOURCE_TOO_LARGE", "目录超过 2 MB 限制");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    identity = url.href;
  } else {
    const path = resolve(location);
    if ((await stat(path)).size > maxBytes)
      throw new AppError("SOURCE_TOO_LARGE", "目录超过 2 MB 限制");
    bytes = await readFile(path);
    identity = source ? path : "bundled";
  }
  if (bytes.length > maxBytes)
    throw new AppError("SOURCE_TOO_LARGE", "目录超过 2 MB 限制");
  const hash = sha256(bytes);
  if (expectedSha256 && expectedSha256 !== hash)
    throw new AppError("SOURCE_MISMATCH", "目录摘要与 --source-sha256 不匹配");
  const data = parseData(
    registrySchema,
    parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), "目录"),
    "目录",
  );
  return { data, source: identity, sha256: hash };
}
