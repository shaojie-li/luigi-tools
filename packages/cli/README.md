# Luigi CLI

通过统一入口初始化业务项目、安装 Skills、UI 组件与项目预设。要求 Node.js 22.13 或更高版本。

包名为 @luigi/tools，命令名为 lt。安装与使用：

```bash
npx @luigi/tools
npx @luigi/tools init business-web --cwd ./my-app --agent codex
npx @luigi/tools add skill github-projects --agent codex
npx @luigi/tools add ui button
npx @luigi/tools add preset github-projects
npx @luigi/tools add preset code-quality
npx @luigi/tools list
npx @luigi/tools doctor
```

也可以 npm install -g @luigi/tools 后执行 lt。无需克隆基建仓库；默认资产随 npm 包分发。

未填完整参数时在交互终端中使用选择菜单。支持 --cwd、--agent codex|claude、--dry-run、--non-interactive 和 --json。JSON 与非交互模式不会等待输入。技能使用 .agents/skills 或 .claude/skills 项目级路径。

init 安装模板、依赖的 UI、GitHub 管理和代码质量预设及内置 Skills。模板包含 React、Tailwind CSS、Base UI、React Hook Form 与 TanStack Table，运行 npm install、npm run tooling:setup 和 npm run dev 启动。独立安装 UI 要求已有 React/Tailwind 项目及声明的 npm 依赖；缺失时 CLI 给出安装命令，不静默修改 package.json。

代码质量预设包含 ESLint、Prettier、Git Hook 和提交规范。已有项目独立安装预设后，显式执行 npx tsx tooling/setup-project.ts 补齐缺失脚本和开发依赖声明，再安装依赖并运行 npm run tooling:setup。配置有冲突时需要审查；CLI 不执行这些脚本，也不初始化 Git。

CLI 不覆盖已有文件，不执行远程脚本、不自动发布或创建 GitHub 事项。重复安装同一版本是 no-op，本地修改或版本差异需要审查。doctor 的内容差异表示偏离初始快照，不代表产品修改不正确。

--source 可读取本地 JSON 或无重定向的 HTTPS 目录；--source-sha256 可锁定整个目录摘要。只安装信任的来源。
