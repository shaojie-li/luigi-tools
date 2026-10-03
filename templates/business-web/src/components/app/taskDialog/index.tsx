import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useForm } from "react-hook-form";
import { Button } from "../../ui/Button";
import { FormField } from "../../ui/FormField";
import { statuses } from "../../../lib/tasks";
import type { Task } from "../../../lib/tasks";

type Values = Pick<Task, "title" | "owner" | "status">;

interface TaskDialogProps {
  task: Task | null;
  onSave: (task: Task) => void;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function TaskDialog({ task, onSave, onClose }: TaskDialogProps) {
  const [saveError, setSaveError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: task
      ? { title: task.title, owner: task.owner, status: task.status }
      : { title: "", owner: "", status: "待处理" },
  });

  function showSaveError(error: unknown) {
    setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
  }

  const submit = handleSubmit((values) => {
    setSaveError("");
    try {
      onSave({
        ...values,
        title: values.title.trim(),
        owner: values.owner.trim(),
        id: task?.id ?? crypto.randomUUID(),
      });
      onClose();
    } catch (error) {
      showSaveError(error);
    }
  });

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-slate-950/30" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-7 shadow-xl">
          <Dialog.Title className="text-xl font-semibold">
            {task ? "编辑任务" : "新建任务"}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-500">
            明确任务名称和负责人，方便后续跟踪。
          </Dialog.Description>
          <form
            className="mt-6 grid gap-5"
            onSubmit={(event) => {
              void submit(event).catch(showSaveError);
            }}
            noValidate
          >
            <FormField
              id="title"
              label="任务名称"
              error={errors.title?.message}
            >
              <input
                id="title"
                autoComplete="off"
                className={inputClass}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "title-error" : undefined}
                {...register("title", {
                  validate: (value) =>
                    value.trim().length > 0 || "请输入任务名称",
                  maxLength: {
                    value: 100,
                    message: "任务名称最多 100 个字符",
                  },
                })}
              />
            </FormField>
            <FormField id="owner" label="负责人" error={errors.owner?.message}>
              <input
                id="owner"
                className={inputClass}
                aria-invalid={Boolean(errors.owner)}
                aria-describedby={errors.owner ? "owner-error" : undefined}
                {...register("owner", {
                  maxLength: { value: 50, message: "负责人最多 50 个字符" },
                })}
              />
            </FormField>
            <FormField id="status" label="状态">
              <select
                id="status"
                className={inputClass}
                {...register("status")}
              >
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </FormField>
            {saveError && (
              <p role="alert" className="text-sm text-red-700">
                保存失败：{saveError}。输入已保留，请重试。
              </p>
            )}
            <div className="mt-2 flex justify-end gap-3">
              <Dialog.Close
                className="rounded-lg px-4 py-2 text-sm text-slate-600"
                disabled={isSubmitting}
              >
                取消
              </Dialog.Close>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "保存中…" : "保存任务"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
