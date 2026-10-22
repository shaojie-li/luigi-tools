import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadCatalog, materialize, latestEntries } from "../src/catalog.js";
import { installAssets } from "../src/assets.js";
import { projectRoot } from "../src/project.js";
import { doctor } from "../src/doctor.js";
import { execute } from "../src/commands.js";
import { sha256 } from "../src/schema.js";
import type { CatalogEntry } from "../src/catalog.js";

function fixture() {
  const base = "https://assets.example.test/";
  const bodies = new Map<string, string>();
  const requested: string[] = [];
  const entries: CatalogEntry[] = [];
  function add(
    type: CatalogEntry["type"],
    name: string,
    version = "1.0.0",
    requires: CatalogEntry["requires"] = [],
  ) {
    const content =
      type === "skill"
        ? `---\nname: ${name}\ndescription: 测试\n---\n${version}`
        : `${name}@${version}`;
    const item = {
      name,
      description: "测试",
      files: [
        {
          path: type === "skill" ? "SKILL.md" : `${name}.txt`,
          content,
          sha256: sha256(content),
        },
      ],
    };
    const payload = JSON.stringify({
      schemaVersion: 1,
      version,
      skills: type === "skill" ? [item] : [],
      assets:
        type === "skill"
          ? []
          : [{ ...item, type, requires: [], dependencies: {} }],
    });
    const url = `${base}${type}/${name}-${version}.json`;
    const entry = {
      type,
      name,
      version,
      description: "测试",
      url,
      sha256: sha256(payload),
      requires,
    };
    entries.push(entry);
    bodies.set(url, payload);
    return entry;
  }
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const url = String(input);
    requested.push(url);
    const body = bodies.get(url);
    return body === undefined
      ? new Response("", { status: 404 })
      : new Response(body);
  };
  function publish() {
    const groups = ["skill", "ui", "starter"];
    for (const group of groups) {
      bodies.set(
        `${base}${group}/index.json`,
        JSON.stringify({
          schemaVersion: 2,
          entries: entries.filter((e) =>
            group === "starter"
              ? e.type === "template" || e.type === "preset"
              : e.type === group,
          ),
        }),
      );
    }
    bodies.set(
      `${base}sources.json`,
      JSON.stringify({
        schemaVersion: 2,
        sources: groups.map((group) => ({ url: `${group}/index.json` })),
      }),
    );
    return loadCatalog(`${base}sources.json`, undefined, fetcher);
  }
  return { base, bodies, requested, entries, add, fetcher, publish };
}

await test("list 只读取轻量索引；选择一个 UI 只下载该资产，允许纯 UI 来源", async () => {
  const f = fixture();
  const button = f.add("ui", "button");
  f.add("skill", "forms");
  const catalog = await f.publish();
  assert.equal(latestEntries(catalog).length, 2);
  assert.equal(f.requested.length, 4);
  assert.ok(
    f.requested.every(
      (url) => url.endsWith("index.json") || url.endsWith("sources.json"),
    ),
  );
  const registry = await materialize(catalog, ["ui/button"], f.fetcher);
  assert.deepEqual(f.requested.slice(4), [button.url]);
  assert.equal(registry.data.skills.length, 0);
  assert.equal(registry.data.assets.length, 1);
});

await test("模板跨来源固定旧版本；新版本独立发布不会改变模板依赖；按实际文件安装精确依赖", async (t) => {
  const f = fixture();
  const old = f.add("ui", "button", "1.0.0");
  f.add("ui", "button", "2.0.0");
  const skill = f.add("skill", "forms", "3.0.0");
  f.add("skill", "unused");
  f.add("template", "app", "4.0.0", [
    { key: "ui/button", version: "1.0.0" },
    { key: "skill/forms", version: "3.0.0" },
  ]);
  const catalog = await f.publish();
  assert.equal(
    latestEntries(catalog).find((e) => e.type === "ui")?.version,
    "2.0.0",
  );
  const registry = await materialize(catalog, ["template/app"], f.fetcher);
  const root = await projectRoot(await mkdtemp(join(tmpdir(), "lt-catalog-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await installAssets(root, registry, "template", ["app"], true, "codex");
  assert.deepEqual(await readdir(root), []);
  await installAssets(root, registry, "template", ["app"], false, "codex");
  assert.deepEqual(await readdir(root), [".agents", "app.txt", "button.txt"]);
  assert.equal(registry.origins?.["skill/forms"]?.sha256, skill.sha256);
  assert.equal(registry.origins?.["ui/button"]?.source, old.url);
  assert.equal(
    await readFile(join(root, "button.txt"), "utf8"),
    "button@1.0.0",
  );
  assert.equal((await doctor(root)).ok, true);
  const again = await installAssets(
    root,
    registry,
    "template",
    ["app"],
    false,
    "codex",
  );
  assert.ok(again.items.every((item) => item.action === "unchanged"));
  assert.ok(
    !f.requested.some(
      (url) => url.includes("unused-") || url.includes("button-2"),
    ),
  );
});

await test("依赖缺失、冲突、循环和重复定义在下载正文之前失败", async () => {
  for (const mode of ["missing", "conflict", "cycle", "duplicate"] as const) {
    const f = fixture();
    f.add("ui", "button");
    if (mode === "duplicate") f.add("ui", "button");
    if (mode === "cycle")
      f.entries[0]!.requires = [{ key: "ui/button", version: "1.0.0" }];
    if (mode === "conflict") {
      f.add("ui", "button", "2.0.0");
      f.add("preset", "quality", "1.0.0", [
        { key: "ui/button", version: "2.0.0" },
      ]);
    }
    f.add("template", "app", "1.0.0", [
      { key: "ui/button", version: mode === "missing" ? "9.0.0" : "1.0.0" },
      ...(mode === "conflict"
        ? [{ key: "preset/quality", version: "1.0.0" }]
        : []),
    ]);
    await assert.rejects(
      async () => materialize(await f.publish(), ["template/app"], f.fetcher),
      /找不到资产|版本冲突|循环依赖|重复资产版本/,
    );
    assert.equal(f.requested.length, 4);
  }
});

await test("正文摘要、身份、版本、路径和传输失败均拒绝", async () => {
  for (const mode of [
    "digest",
    "identity",
    "version",
    "path",
    "http",
  ] as const) {
    const f = fixture();
    const entry = f.add("ui", "button");
    if (mode === "http") f.bodies.delete(entry.url);
    else {
      const payload = JSON.parse(f.bodies.get(entry.url)!) as {
        version: string;
        assets: { name: string; files: { path: string }[] }[];
      };
      if (mode === "identity") payload.assets[0]!.name = "other";
      if (mode === "version") payload.version = "2.0.0";
      if (mode === "path") payload.assets[0]!.files[0]!.path = "../escape";
      const body = JSON.stringify(payload) + "\n";
      f.bodies.set(entry.url, body);
      if (mode !== "digest") entry.sha256 = sha256(body);
    }
    await assert.rejects(
      async () => materialize(await f.publish(), ["ui/button"], f.fetcher),
      /摘要|不匹配|相对路径|HTTP 404/,
    );
  }
});

await test("组合摘要覆盖子索引变化，远程索引不能引用本地路径协议", async () => {
  const f = fixture();
  f.add("ui", "button");
  const before = await f.publish();
  f.add("skill", "forms");
  await f.publish();
  await assert.rejects(
    loadCatalog(`${f.base}sources.json`, before.sha256, f.fetcher),
    /摘要/,
  );
  f.entries[0]!.url = "file:///etc/passwd";
  await assert.rejects(f.publish(), /HTTPS/);
});

await test("真实 execute 从本地分仓索引安装，下载失败不创建目标；doctor 不读取来源", async (t) => {
  const parent = await projectRoot(
    await mkdtemp(join(tmpdir(), "lt-local-index-")),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const f = fixture();
  const entry = f.add("skill", "forms");
  const body = f.bodies.get(entry.url)!;
  entry.url = "forms.json";
  const source = join(parent, "index.json");
  await writeFile(
    source,
    JSON.stringify({ schemaVersion: 2, entries: [entry] }),
  );
  const root = join(parent, "project");
  const options = { source, cwd: root, agent: "codex" };
  await assert.rejects(
    execute("add", "skill", ["forms"], options, undefined),
    /ENOENT/,
  );
  assert.deepEqual(await readdir(parent), ["index.json"]);
  await writeFile(join(parent, "forms.json"), body);
  const result = await execute("add", "skill", ["forms"], options, undefined);
  assert.equal(result.ok, true);
  assert.ok("replay" in result && result.replay.includes("--source-sha256"));
  await rm(source);
  await rm(join(parent, "forms.json"));
  assert.equal(
    (await execute("doctor", undefined, [], { cwd: root }, undefined)).ok,
    true,
  );
});

await test("非交互参数不完整时先返回参数错误，不尝试下载来源", async (t) => {
  const root = await projectRoot(
    await mkdtemp(join(tmpdir(), "lt-arguments-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const names of [[], ["forms"]]) {
    await assert.rejects(
      execute(
        "add",
        "skill",
        names,
        { cwd: root, source: join(root, "missing.json") },
        undefined,
      ),
      /参数不完整/,
    );
  }
  assert.deepEqual(await readdir(root), []);
});
