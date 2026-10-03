import { useCallback, useState } from "react";
import { Button } from "../ui/Button";
import { TaskDialog } from "./taskDialog";
import { TaskTable } from "./taskTable";
import { Sidebar } from "./Sidebar";
import { TaskStatistics } from "./TaskStatistics";
import { decodeTasks, saveTasks, storageKey } from "../../lib/tasks";
import type { Task } from "../../lib/tasks";

function readTasks(): { tasks: Task[]; loadError: string } {
  try {
    return {
      tasks: decodeTasks(localStorage.getItem(storageKey)),
      loadError: "",
    };
  } catch (error) {
    return {
      tasks: [],
      loadError: error instanceof Error ? error.message : "读取任务失败",
    };
  }
}

export function App() {
  // localStorage 同步读取，初始化即可完成；失败状态保留给用户重试。
  const [{ tasks, loadError }, setTaskState] = useState(readTasks);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);

  function load() {
    setTaskState(readTasks());
  }

  // 列定义依赖编辑入口；稳定引用避免无关更新重建 TanStack 的列配置。
  const edit = useCallback((task?: Task) => {
    setEditor({ task: task ?? null });
  }, []);

  function save(task: Task) {
    const next = editor?.task
      ? tasks.map((item) => (item.id === task.id ? task : item))
      : [task, ...tasks];
    saveTasks(localStorage, next);
    setTaskState({ tasks: next, loadError: "" });
    setNotice(editor?.task ? "任务已更新" : "任务已创建");
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <Sidebar />
      <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-10 md:py-10">
        <div className="text-xs text-slate-500">工作空间 / 任务</div>
        <header className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              任务工作台
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              把计划变成可追踪的进展。
            </p>
          </div>
          <Button disabled={Boolean(loadError)} onClick={() => edit()}>
            ＋ 新建任务
          </Button>
        </header>
        <TaskStatistics tasks={tasks} />
        {loadError ? (
          <section
            aria-label="任务列表"
            className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6"
          >
            <div role="alert" className="rounded-xl bg-red-50 p-6 text-red-800">
              <p>{loadError}</p>
              <button type="button" className="mt-3 underline" onClick={load}>
                重新读取
              </button>
            </div>
          </section>
        ) : (
          <TaskTable tasks={tasks} notice={notice} onEdit={edit} />
        )}
        <footer className="mt-6 text-xs text-slate-400">
          本地工作台 · 不跨设备同步
        </footer>
      </main>
      {editor && (
        <TaskDialog
          task={editor.task}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
