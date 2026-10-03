export function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-white px-6 py-7 md:min-h-screen md:border-r">
      <div className="flex items-center gap-3 font-semibold tracking-tight">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-800 text-white">
          W
        </span>
        工作空间
      </div>
      <p className="mt-10 text-xs tracking-widest text-slate-400">工作管理</p>
      <div
        aria-current="page"
        className="mt-3 rounded-lg bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900"
      >
        任务工作台
      </div>
      <p className="mt-8 text-xs leading-6 text-slate-400">
        轻量记录，清晰推进。
        <br />
        数据保存在当前浏览器。
      </p>
    </aside>
  );
}
