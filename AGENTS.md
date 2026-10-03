# 项目约定

- 默认中文沟通、文档和提交说明。整体方向以 docs/architecture.md 为准。
- JavaScript 生态代码优先 TypeScript strict，使用 ESM；脚本与测试也使用 TypeScript。
- 编码、React 与提交规范见 docs/coding-standards.md。组件文件/符号用 PascalCase；拆分后的组件用 lowerCamelCase 同名目录和 index.tsx 公开入口；非组件 .ts 文件用 kebab-case，main.tsx 为启动入口例外。
- React 组件按职责和状态归属拆分，高频状态尽量下沉；性能修改先定位和测量，不机械添加 memo 或按行数拆分。
- 本仓库管理可复用基建，产品业务留在各自仓库。仅创建当前实际需要的模块。
- CLI 交互层只收集输入，完整命令和交互调用同一套安装、检查逻辑。
- 安装必须保护已有文件，参数不完整的非交互调用应显性失败，不弹菜单或静默猜测。
- 新增能力同步更新相关文档；对文件写入、失败回滚和 CLI 可观察行为运行必要测试。
- 使用 pnpm，锁文件纳入版本控制。交付前运行 pnpm check。
- 保留暂存边界；提交 Hook 只格式化暂存文件，全量 lint/格式/类型检查保持只读。提交消息遵循 Conventional Commits，默认中文说明。
- 不擅自提交、推送、发布、部署或修改全局 Agent 配置。
