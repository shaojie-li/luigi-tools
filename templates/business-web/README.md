# 业务工作台

通过 Agent Base CLI 初始化的 React + TypeScript 项目。使用 Vite、Tailwind CSS、Base UI、React Hook Form 和 TanStack Table。要求 Node.js 22.13+。

```bash
npm install
npm run tooling:setup
npm run dev
npm run check
```

任务支持新建、编辑、搜索、排序与客户端分页。数据存储在当前浏览器 localStorage，不包含服务端、账号登录或跨设备同步；本地数据损坏或写入失败会显示错误，不返回假成功。

UI 源码安装在 src/components/ui，可按产品需求修改。修改后 lt doctor 会把与初始快照的差异报告为本地修改，这不等于业务代码有错。后续更新必须审查差异。

编码与提交规则见 [编码规范](docs/coding-standards.md)。代码质量预设提供 ESLint 10、Prettier、类型检查、Husky 和 commitlint 配置；依赖与 npm 脚本已包含在模板中。Git Hook 要求项目已初始化 Git，后续建立仓库时再次执行 `npm run tooling:setup`。

组件文件和符号用 PascalCase。按职责拆分的组件放在 lowerCamelCase 同名目录，通过 `index.tsx` 暴露入口；内部子组件不对外直接导入。Hook、工具等 `.ts` 文件使用 kebab-case。小组件可以保持单文件，避免为目录结构引入无意义封装。

提交前只自动格式化暂存文件，再运行全量 lint、格式与类型检查；提交消息遵循 Conventional Commits，描述默认中文。React 性能修改需要验证状态影响范围及真实交互成本，不能把 lint 通过视为没有多余渲染。

GitHub 项目流程见 docs/project-management.md。Issue 表单和 PR 模板已写入 .github，只有推送到相应 GitHub 仓库后才生效；本地初始化不创建远程 Projects、Issue 或标签。
