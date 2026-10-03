# 验证记录

日期：2026-10-03。验证环境为 macOS ARM64、Node.js 24.18.0、pnpm 10.34.6。首次提交 e9fbe93 已推送，GitHub CI 的完整检查与 npm 打包安装验证通过。

## 质量规范增量验证

本次基线为 Node.js 22.13+、ESLint 10、Prettier、Husky 与 commitlint。具体规范见 [编码规范](coding-standards.md)。

- 仓库 `pnpm check` 通过：全量 ESLint、格式、TypeScript strict、测试和构建。
- React 命名规则 28 个正反例及完整 ESLint 配置 12 个正反例通过，覆盖 PascalCase 文件、目录小写开头、目录入口匹配、工具 kebab-case、包括 .ts 自定义 Hook 的 Hooks 规则、列表 key 和嵌套组件。
- Conventional Commits 验证中文标题、不兼容变更、非法 type、空描述和超长标题。
- 在临时 Git 仓库实际运行 Husky 提交：未暂存代码的 ESLint 错误阻止提交；Prettier 格式化暂存内容且保留未暂存修改；非法提交消息阻止提交。
- CI 提交检查脚本验证 PR/push 范围、首次 push 完整历史和非法 SHA 参数拒绝。
- code-quality 预设独立安装通过；设置脚本验证保留业务配置、冲突不写、重复执行幂等、非 ESM 和符号链接拒绝。package.json 使用临时文件加 rename 写入。
- 安装失败及清理失败同时发生时保留全部错误，仍继续清理其余文件和锁；3 项实际文件系统回归通过。
- `pnpm smoke` 通过：npm pack、仓库外安装 CLI、生成业务模板、doctor、独立 npm install，以及模板完整 `npm run check`（包括 3 项数据测试和生产构建）。
- 更新后的 web-ui Skill 通过 skill-creator quick_validate。
- 最新拆分模板经过 Chrome 实际交互验证：创建、编辑、刷新持久化、分页与搜索、Escape 关闭和恢复焦点、390 px 窄屏、保存失败保留输入、损坏数据修复后重试，未出现 pageerror。
- 临时计数探针验证：表单输入与校验时 TaskTable 为 4 → 4 次，列表搜索时 App 为 36 → 36 次，保存失败时 TaskTable 为 72 → 72 次。数字是开发模式下对应步骤前后的累计执行次数，证明这些交互没有带动指定组件重新执行，不代表生产性能基准。探针已移除。

静态检查不证明没有不必要的 React 渲染。尚未启用 jsx-a11y lint，不将一般 ESLint 通过视为无障碍验证完成。以上记录覆盖开发验证；首次提交与 push 已完成。

## 此前 MVP 自动检查

- pnpm check：格式、TypeScript strict、CLI 测试与构建。
- 21 项 CLI 与核心行为测试：参数、JSON、交互参数收集、Skills 安装、重复安装、dry-run、修改保护、整批冲突、符号链接、非法记录、失败回滚、安装锁、目录摘要与下载失败、模板初始化、UI 与 GitHub preset 独立安装。
- pnpm smoke：npm pack，在仓库外通过 npm 安装分发包，执行 CLI、初始化业务模板、doctor、安装业务依赖、运行模板测试和生产构建。不会 npm publish。
- 模板包含 3 项数据测试，覆盖存储恢复、损坏或重复数据与保存失败。
- 4 个 Skills 通过 skill-creator quick_validate 校验。项目构建脚本另校验 frontmatter、目录结构与分发摘要。

## 浏览器验证

使用 CLI 在临时目录生成 business-web 并启动 Vite，通过本机 Chrome 和 Playwright 验证：

- 初始空状态；空标题显示字段校验错误。
- 新建任务、编辑状态、刷新后恢复保存内容。
- 多页数据、翻页、筛选后页码重置及无结果提示。
- Escape 关闭弹窗；390 px 窄屏没有页面横向溢出。
- 模拟存储写入失败，界面显示错误并保留输入。
- 模拟损坏的本地数据，界面显示读取失败和重试，禁止覆盖性新增。
- 浏览器未出现 pageerror。

## 终端交互

在真实 PTY 中验证了主菜单、类型选择、Agent 选择、Skills 多选安装和 Ctrl+C 取消。取消返回 130 且未写入；成功安装输出 lt 完整复用命令。搜索后用方向键定位，再用空格选择、Enter 确定。

## 范围与限制

远程目录通过注入 HTTP 响应测试成功、错误状态、体积限制和摘要不匹配，尚未部署真实目录站点。npm 打包安装已验证，发布 scope 为 @luigix，已确认发布账号 lishaojie 为组织 owner。仓库与分发资产采用 MIT；实际发布版本以 npm registry 和 GitHub Release 记录为准。

GitHub 模板和 Skill 为本地资产，没有创建远程 Project、Issue、标签或自动化；需要在使用者明确授权和具备权限后操作。Windows、真实断电、恶意外部进程同时修改文件及真实设备移动端不在本轮验证范围。

业务模板使用 localStorage，尚无服务端和身份认证；UI 组件面向 React + Tailwind 项目，安装时检查依赖声明，不自动接管 package.json。doctor 的摘要差异表示相对安装快照发生了修改，不等于业务代码错误。
