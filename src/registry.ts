import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { AppError } from "./errors.js";
import { parseData, parseJson, registrySchema, sha256 } from "./schema.js";
import type { Registry } from "./schema.js";

const maxBytes = 2 * 1024 * 1024;
export interface LoadedRegistry {
  data: Registry;
  origins?: Record<string, { version: string; source: string; sha256: string }>;
  source: string;
  sha256: string;
}

export async function readSource(
  source?: string,
  expectedSha256?: string,
  fetcher: typeof fetch = fetch,
): Promise<{ data: unknown; source: string; sha256: string }> {
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new AppError(
      "INVALID_DIGEST",
      "--source-sha256 必须是 64 位小写十六进制摘要",
      2,
    );
  }
  const location = source ?? process.env.LT_SOURCE;
  if (!location) throw new AppError("MISSING_SOURCE", "请指定目录来源", 2);
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
    bytes = await downloadSource(url, fetcher);
    identity = url.href;
  } else {
    const path = resolve(location);
    if ((await stat(path)).size > maxBytes)
      throw new AppError("SOURCE_TOO_LARGE", "目录超过 2 MB 限制");
    bytes = await readFile(path);
    identity = path;
  }
  if (bytes.length > maxBytes)
    throw new AppError("SOURCE_TOO_LARGE", "目录超过 2 MB 限制");
  const hash = sha256(bytes);
  if (expectedSha256 && expectedSha256 !== hash)
    throw new AppError("SOURCE_MISMATCH", "目录摘要与 --source-sha256 不匹配");
  const data = parseJson(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    "目录",
  );
  return { data, source: identity, sha256: hash };
}

export async function loadRegistry(
  source?: string,
  expectedSha256?: string,
  fetcher: typeof fetch = fetch,
): Promise<LoadedRegistry> {
  const loaded = await readSource(source, expectedSha256, fetcher);
  return { ...loaded, data: parseData(registrySchema, loaded.data, "目录") };
}

export function assetOrigin(registry: LoadedRegistry, key: string) {
  return (
    registry.origins?.[key] ?? {
      version: registry.data.version,
      source: registry.source,
      sha256: registry.sha256,
    }
  );
}

const maxAttempts = 5;
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
const retryableNetworkCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

async function downloadSource(
  url: URL,
  fetcher: typeof fetch,
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryable = false;
    const signal = AbortSignal.timeout(15_000);
    try {
      const response = await fetcher(url, {
        signal,
        redirect: "error",
      });
      if (!response.ok || !response.body) {
        retryable = retryableStatuses.has(response.status);
        await response.body?.cancel();
        throw new AppError("DOWNLOAD_FAILED", `HTTP ${response.status}`);
      }
      // Each retry starts with an empty buffer, including after a body disconnect.
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxBytes)
          throw new AppError("SOURCE_TOO_LARGE", "目录超过 2 MB 限制");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof AppError && error.code !== "DOWNLOAD_FAILED")
        throw error;
      retryable ||= signal.aborted || isRetryableNetworkError(error);
      if (retryable && attempt < maxAttempts) {
        await setTimeout(250 * 2 ** (attempt - 1));
        continue;
      }
      throw new AppError(
        "DOWNLOAD_FAILED",
        `目录下载失败：${url.href}；已尝试 ${attempt} 次；${networkErrorDetail(error)}。请检查网络连接；使用代理时需确保 Node 已配置代理。`,
      );
    }
  }
  throw new AppError("INTERNAL_ERROR", "下载重试计数异常");
}

function isRetryableNetworkError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current.name === "TimeoutError") return true;
    if ("code" in current && typeof current.code === "string")
      return retryableNetworkCodes.has(current.code);
    current = current.cause;
  }
  return (
    error instanceof TypeError &&
    error.message === "fetch failed" &&
    error.cause === undefined
  );
}

function networkErrorDetail(error: unknown): string {
  const details: string[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code =
      "code" in current && typeof current.code === "string"
        ? ` [${current.code}]`
        : "";
    details.push(`${current.name}: ${current.message}${code}`);
    current = current.cause;
  }
  return details.length ? details.join("；") : String(error);
}
