export const statuses = ["待处理", "进行中", "已完成"] as const;
export type Status = (typeof statuses)[number];
export interface Task {
  id: string;
  title: string;
  owner: string;
  status: Status;
}
export const storageKey = "business-web.tasks.v1";

export function decodeTasks(raw: string | null): Task[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    !data.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const task = item as Partial<Task>;
      return (
        typeof task.id === "string" &&
        task.id.length > 0 &&
        typeof task.title === "string" &&
        task.title.trim().length > 0 &&
        typeof task.owner === "string" &&
        typeof task.status === "string" &&
        statuses.includes(task.status)
      );
    })
  )
    throw new Error("本地任务数据格式不正确，请检查存储后重试。");
  const tasks = data as Task[];
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
    throw new Error("本地任务 ID 重复。");
  return tasks;
}

export function saveTasks(
  storage: Pick<Storage, "setItem">,
  tasks: Task[],
): void {
  storage.setItem(storageKey, JSON.stringify(tasks));
}
