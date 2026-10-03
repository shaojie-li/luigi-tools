import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTasks, saveTasks, storageKey } from "./tasks.ts";

await test("空项目没有假数据，保存后可恢复", () => {
  assert.deepEqual(decodeTasks(null), []);
  let saved = "";
  saveTasks(
    {
      setItem(key, value) {
        assert.equal(key, storageKey);
        saved = value;
      },
    },
    [{ id: "1", title: "验收模板", owner: "", status: "待处理" }],
  );
  assert.equal(decodeTasks(saved)[0]?.title, "验收模板");
});

await test("损坏数据和重复 ID 不被静默替换为空列表", () => {
  assert.throws(() => decodeTasks("invalid"));
  assert.throws(() => decodeTasks('[{"id":"1"}]'));
  const task = { id: "1", title: "任务", owner: "", status: "待处理" };
  assert.throws(() => decodeTasks(JSON.stringify([task, task])), /重复/);
});

await test("存储失败显性抛出，由界面保留表单输入并显示错误", () => {
  assert.throws(
    () =>
      saveTasks(
        {
          setItem() {
            throw new Error("容量不足");
          },
        },
        [],
      ),
    /容量不足/,
  );
});
