import { useMemo, useState } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../../ui/DataTable";
import type { Task } from "../../../lib/tasks";

interface TaskTableProps {
  tasks: Task[];
  notice: string;
  onEdit: (task: Task) => void;
}

function createColumns(onEdit: TaskTableProps["onEdit"]): ColumnDef<Task>[] {
  return [
    {
      accessorKey: "title",
      header: "任务名称",
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "owner",
      header: "负责人",
      cell: ({ getValue }) => getValue<string>() || "未分配",
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ getValue }) => (
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${getValue() === "已完成" ? "bg-teal-50 text-teal-800" : getValue() === "进行中" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}
        >
          {getValue<string>()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      enableSorting: false,
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium text-teal-700 hover:underline"
          aria-label={`编辑 ${row.original.title}`}
          onClick={() => onEdit(row.original)}
        >
          编辑
        </button>
      ),
    },
  ];
}

export function TaskTable({ tasks, notice, onEdit }: TaskTableProps) {
  const [search, setSearch] = useState("");
  const columns = useMemo(() => createColumns(onEdit), [onEdit]);
  // TanStack Table v8 返回可变 table 实例；不对它或 DataTable 加 memo，也不启用 React Compiler。
  // eslint-disable-next-line react-hooks/incompatible-library -- 保留 v8 的响应式读取，升级后复核兼容性。
  const table = useReactTable({
    data: tasks,
    columns,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getRowId: (task) => task.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 5 } },
  });

  return (
    <section
      aria-label="任务列表"
      className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold">所有任务</h2>
        <label>
          <span className="sr-only">搜索任务</span>
          <input
            type="search"
            placeholder="搜索任务、负责人或状态…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-72"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              table.setPageIndex(0);
            }}
          />
        </label>
      </div>
      <p role="status" className="mb-3 text-sm text-teal-800">
        {notice}
      </p>
      <DataTable
        table={table}
        emptyMessage={
          search
            ? "没有匹配的任务，试试其他关键词。"
            : "还没有任务，点击“新建任务”开始。"
        }
      />
    </section>
  );
}
