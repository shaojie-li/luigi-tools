import {
  autocompleteMultiselect,
  cancel,
  isCancel,
  select,
} from "@clack/prompts";
import { AppError } from "./errors.js";
import type { Agent, Asset, Skill } from "./schema.js";

function answer<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel("已取消，未写入文件。");
    throw new AppError("CANCELLED", "用户取消", 130);
  }
  return value as Exclude<T, symbol>;
}

export interface Prompts {
  action(): Promise<"init" | "add" | "list" | "doctor">;
  kind(): Promise<"skill" | "ui" | "preset">;
  assets(assets: Asset[], single: boolean): Promise<string[]>;
  skills(skills: Skill[], installed: string[]): Promise<string[]>;
  agent(): Promise<Agent>;
}

export const prompts: Prompts = {
  async action() {
    return answer(
      await select({
        message: "选择操作",
        options: [
          {
            value: "init" as const,
            label: "初始化业务项目",
            hint: "安装模板、组件与 Skills",
          },
          { value: "add" as const, label: "添加 Skills、UI 或项目预设" },
          { value: "list" as const, label: "查看可用资产" },
          { value: "doctor" as const, label: "检查项目安装状态" },
        ],
      }),
    );
  },
  async kind() {
    return answer(
      await select({
        message: "安装什么？",
        options: [
          { value: "skill" as const, label: "Skills" },
          { value: "ui" as const, label: "UI 组件" },
          { value: "preset" as const, label: "项目预设" },
        ],
      }),
    );
  },
  async assets(assets, single) {
    const options = assets.map((asset) => ({
      value: asset.name,
      label: asset.name,
      hint: asset.description,
    }));
    if (single)
      return [answer(await select({ message: "选择项目模板", options }))];
    return answer(
      await autocompleteMultiselect({
        message: "选择资产（输入搜索，↑↓定位，空格选择）",
        required: true,
        options,
      }),
    );
  },
  async skills(skills, installed) {
    return answer(
      await autocompleteMultiselect({
        message: "选择 Skills（输入搜索，↑↓定位，空格选择，Enter 确定）",
        required: true,
        options: skills.map((skill) => ({
          value: skill.name,
          label: skill.name,
          hint: `${installed.includes(skill.name) ? "已有安装记录 · " : ""}${skill.description}`,
        })),
      }),
    );
  },
  async agent() {
    return answer(
      await select({
        message: "安装到哪个 Agent？",
        options: [
          { value: "codex" as const, label: "Codex", hint: ".agents/skills" },
          {
            value: "claude" as const,
            label: "Claude Code",
            hint: ".claude/skills",
          },
        ],
      }),
    );
  },
};
