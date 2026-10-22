import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { transact } from "../src/transaction.js";
import type { ChangePlan } from "../src/transaction.js";

const plan: ChangePlan = {
  files: [
    { path: "assets/other.txt", content: "other" },
    { path: "assets/blocked.txt", content: "blocked" },
  ],
  reserveDirs: [],
};

await test("安装失败和清理失败同时保留，单个回滚失败不妨碍其余清理", async () => {
  const root = await mkdtemp(join(tmpdir(), "luigi-transaction-cleanup-"));
  const failure = new Error("模拟文件写入失败");
  try {
    await assert.rejects(
      transact(
        root,
        () => Promise.resolve(plan),
        false,
        async (handle, content) => {
          await handle.writeFile(content);
          if (content !== "blocked") return;
          // Replace one created file with a directory to cause a real, portable rm failure.
          await rm(join(root, "assets/blocked.txt"));
          await mkdir(join(root, "assets/blocked.txt"));
          throw failure;
        },
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.cause, failure);
        assert.equal(error.errors[0], failure);
        assert.equal(error.errors.length, 2);
        assert.match(error.message, /模拟文件写入失败/);
        assert.match(error.message, /回滚或清理失败/);
        assert.match(error.message, /blocked\.txt/);
        return true;
      },
    );
    // Despite one rollback failure, the other file, staging directory and lock were removed.
    assert.deepEqual(await readdir(root), ["assets"]);
    assert.deepEqual(await readdir(join(root, "assets")), ["blocked.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test("写入完成后清理失败显性报告，同时保留已写入的文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "luigi-transaction-committed-"));
  try {
    await assert.rejects(
      transact(
        root,
        () => Promise.resolve(plan),
        false,
        async (handle, content) => {
          await handle.writeFile(content);
          if (content !== "blocked") return;
          await rm(join(root, ".lt-install.lock"));
          await mkdir(join(root, ".lt-install.lock"));
        },
      ),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 1);
        assert.match(error.message, /安装已完成/);
        assert.match(error.message, /install\.lock/);
        return true;
      },
    );
    assert.equal(
      await readFile(join(root, "assets/other.txt"), "utf8"),
      "other",
    );
    assert.equal(
      await readFile(join(root, "assets/blocked.txt"), "utf8"),
      "blocked",
    );
    assert.deepEqual(await readdir(root), [".lt-install.lock", "assets"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test("清理成功时保持原始安装错误对象并完成全部回滚", async () => {
  const root = await mkdtemp(join(tmpdir(), "luigi-transaction-original-"));
  const failure = new Error("原始安装错误");
  try {
    await assert.rejects(
      transact(
        root,
        () => Promise.resolve(plan),
        false,
        () => Promise.reject(failure),
      ),
      (error: unknown) => error === failure,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
