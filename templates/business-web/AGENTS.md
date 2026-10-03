# 开发约定

- 代码使用 TypeScript，优先复用 src/components/ui，尊重已有设计和交互约定。
- 编码与提交约定见 docs/coding-standards.md。组件文件/符号用 PascalCase，拆分组件使用 lowerCamelCase 同名目录和 index.tsx 公开入口；工具与 Hook 的 .ts 文件用 kebab-case，main.tsx 为启动入口例外。
- 组件按职责拆分，高频状态放在最近的使用组件。先用 Profiler 定位性能问题，再决定状态调整或 memo；不按固定行数机械拆分。
- 表单采用 React Hook Form，表格采用 TanStack Table；按安装版本使用 API。
- 当前任务数据存于 localStorage。接入 API 时明确服务端分页、错误处理和请求竞态，不把本地成功当成服务器成功。
- 验证命令：npm run check；UI 改动需验证浏览器中的表单、焦点、空状态和失败状态。建立 Git 仓库后用 npm run tooling:setup 准备本地 Hook。
- 提交采用 Conventional Commits，默认中文说明。保留部分暂存边界，不用 git add . 或全量格式化命令扩大本次提交范围；未经授权不提交或推送。
- 任务管理遵循 docs/project-management.md；本地模板不代表已创建 GitHub Project。
