import type { Task } from "../../lib/tasks";

export function TaskStatistics({ tasks }: { tasks: Task[] }) {
  return (
    <div className="my-8 grid grid-cols-3 gap-3 md:gap-5">
      {[
        { label: "全部任务", value: tasks.length },
        {
          label: "进行中",
          value: tasks.filter((task) => task.status === "进行中").length,
        },
        {
          label: "已完成",
          value: tasks.filter((task) => task.status === "已完成").length,
        },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white p-5"
        >
          <p className="text-xs text-slate-500">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
