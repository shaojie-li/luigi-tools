import assert from "node:assert/strict";
import test from "node:test";
import { loadRegistry, readSource } from "../src/registry.js";
import { sha256 } from "../src/schema.js";

const url = "https://example.test/index.json";
const body = JSON.stringify({ schemaVersion: 2, entries: [] });
const reset = () =>
  new TypeError("fetch failed", {
    cause: Object.assign(new Error("TLS connection reset"), {
      code: "ECONNRESET",
    }),
  });

await test("TLS 重置后最多尝试 5 次，第 5 次成功返回数据；每次使用独立超时", async () => {
  const signals = new Set<AbortSignal>();
  let attempts = 0;
  const result = await readSource(url, sha256(body), async (_input, init) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    signals.add(init.signal);
    if (++attempts < 5) throw reset();
    return new Response(body);
  });
  assert.equal(attempts, 5);
  assert.equal(signals.size, 5);
  assert.deepEqual(result.data, JSON.parse(body));
});

await test("连续 5 次网络失败后 reject，保留来源和最终错误码，不发第 6 次请求", async () => {
  let attempts = 0;
  await assert.rejects(
    readSource(url, undefined, async () => {
      attempts++;
      throw reset();
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error);
      assert.equal(error.code, "DOWNLOAD_FAILED");
      assert.ok(error.message.includes(url));
      assert.match(error.message, /已尝试 5 次.*ECONNRESET/);
      return true;
    },
  );
  assert.equal(attempts, 5);
});

await test("503 释放失败响应后重试，响应流中途断开后重新下载完整正文", async () => {
  let attempts = 0;
  let cancelled = false;
  const result = await readSource(url, sha256(body), async () => {
    attempts++;
    if (attempts === 1)
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status: 503 },
      );
    if (attempts === 2) {
      let pulls = 0;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (pulls++ === 0)
              controller.enqueue(new TextEncoder().encode("partial"));
            else controller.error(reset());
          },
        }),
      );
    }
    return new Response(body);
  });
  assert.equal(attempts, 3);
  assert.equal(cancelled, true);
  assert.equal(result.sha256, sha256(body));
});

await test("404、证书错误和拒绝重定向不重试", async () => {
  const failures = [
    async () => new Response("not found", { status: 404 }),
    async (): Promise<Response> => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("invalid certificate"), {
          code: "CERT_HAS_EXPIRED",
        }),
      });
    },
    async (): Promise<Response> => {
      throw new TypeError("fetch failed", {
        cause: new Error("unexpected redirect"),
      });
    },
  ];
  for (const fail of failures) {
    let attempts = 0;
    await assert.rejects(
      readSource(url, undefined, () => {
        attempts++;
        return fail();
      }),
      /目录下载失败/,
    );
    assert.equal(attempts, 1);
  }
});

await test("摘要错误、无效 JSON、响应超限不重试", async () => {
  for (const mode of ["digest", "json", "size"]) {
    let attempts = 0;
    const payload =
      mode === "json"
        ? "invalid json"
        : mode === "size"
          ? "x".repeat(2 * 1024 * 1024 + 1)
          : body;
    await assert.rejects(
      readSource(
        url,
        mode === "digest" ? "0".repeat(64) : undefined,
        async () => {
          attempts++;
          return new Response(payload);
        },
      ),
      /摘要|JSON|2 MB/,
    );
    assert.equal(attempts, 1);
  }
});

await test("超时和临时 DNS 故障允许重试", async () => {
  for (const error of [
    new DOMException("request timed out", "TimeoutError"),
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("DNS temporarily unavailable"), {
        code: "EAI_AGAIN",
      }),
    }),
  ]) {
    let attempts = 0;
    await readSource(url, undefined, async () => {
      if (++attempts === 1) throw error;
      return new Response(body);
    });
    assert.equal(attempts, 2);
  }
});

await test("读取响应正文时超时触发 AbortError 也重试", async (t) => {
  const controller = new AbortController();
  let timeouts = 0;
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    assert.equal(milliseconds, 15_000);
    return ++timeouts === 1 ? controller.signal : new AbortController().signal;
  });
  let attempts = 0;
  const result = await readSource(url, sha256(body), async () => {
    if (++attempts === 1) {
      controller.abort();
      return new Response(
        new ReadableStream({
          start(stream) {
            stream.error(
              new DOMException("The operation was aborted", "AbortError"),
            );
          },
        }),
      );
    }
    return new Response(body);
  });
  assert.equal(attempts, 2);
  assert.equal(result.sha256, sha256(body));
});

await test("HTTPS 下载错误包含来源、底层原因和错误码，覆盖响应流断开", async () => {
  const url = "https://example.test/index.json";
  const cause = Object.assign(new Error("连接被重置"), { code: "ECONNRESET" });
  const failure = new TypeError("fetch failed", { cause });
  for (const fetcher of [
    async () => {
      throw failure;
    },
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(failure);
          },
        }),
      ),
  ]) {
    await assert.rejects(
      loadRegistry(url, undefined, fetcher),
      (error: unknown) => {
        assert.ok(error instanceof Error && "code" in error);
        assert.equal(error.code, "DOWNLOAD_FAILED");
        assert.ok(error.message.includes(url));
        assert.match(error.message, /fetch failed.*连接被重置.*ECONNRESET/);
        return true;
      },
    );
  }
});
