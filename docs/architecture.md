# Agent Base 架构与实施路线

状态：实施基线。更新日期：2026-10-03。

Agent Base 是通用工程基建，服务于开发者和编码 Agent；通过公共 npm 包 @luigix/tools 分发，不依赖维护者本机配置或私有工作区。目标是把经过验证的组件、工作流程和项目约定复用到独立产品中，减少重复搭建和返工。本仓库采用轻量 Monorepo，优先用 TypeScript 实现 JavaScript 生态内的代码；MVP 交付统一 CLI、Skills、UI 组件、GitHub 管理预设和业务项目模板。所有项目初始化与资产安装都通过该 CLI 进入。

## 目标与边界

- 新项目可以按需安装资产，已有项目也可以逐步接入。
- 人通过交互选择操作，Agent 和 CI 通过完整命令操作，二者调用同一套业务逻辑。
- 安装可追溯、重复执行结果一致；已有文件和本地修改不会被静默覆盖。
- 资产从真实项目提炼，基础库优先复用成熟上游。
- 产品仓库独立于基建仓库，不要求加入此 Monorepo。

本项目当前不建设 Agent 运行平台、模型网关、插件市场、通用后端框架或自研 MCP 服务。鉴权、支付、存储等能力由实际产品验证后再决定是否抽取。

## 技术决策

| 领域     | 决策                                   | 原因与权衡                                                                         |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| 仓库     | pnpm workspace                         | CLI、Skills、后续组件和示例可同步修改；暂不需要额外任务编排系统                    |
| 语言     | TypeScript strict、ESM                 | CLI、脚本、测试及未来 Web/RN 代码统一类型约束；JSON/YAML/Markdown 保持各自用途     |
| CLI      | Node.js 22.13+、Commander、Clack       | 成熟参数解析与终端选择交互；编译成 JavaScript 分发，消费者不需要 TypeScript 运行器 |
| 数据边界 | Zod                                    | 校验远程目录与本地安装记录，不能依靠 TypeScript 验证外部输入                       |
| 测试     | Node.js test runner + tsx              | 测试以用户可观察行为、文件安全和失败路径为主                                       |
| Web      | React、Tailwind CSS、Base UI           | 复用交互原语，维护自己的主题、约定和少量高频组合                                   |
| 表单     | React Hook Form，按需配 Zod            | 状态和校验归表单层，展示归 UI 层，不另造表单状态引擎                               |
| 表格     | TanStack Table                         | 提供可组合的展示和示例，不封装几十个配置项的万能表格                               |
| UI 分发  | CLI 统一入口，未来适配 shadcn Registry | 源码安装后归产品项目维护；升级需审查差异                                           |
| 代码质量 | ESLint 10、Prettier、Husky、commitlint | 静态规则、格式化、暂存保护与提交约定分别负责，通过 CLI 分发到业务项目              |
| 移动端   | React Native + Expo                    | 衔接 React/TypeScript；首个真实 App 出现后再建设组件                               |

业务代码和脚本默认使用 TypeScript。只有工具确实不支持 TypeScript 时才使用手写 JavaScript，并在附近说明原因。编译产物不属于此限制，也不提交生成文件。具体命名、React 组件边界和提交约定以 [编码规范](coding-standards.md) 为准：组件文件与符号用 PascalCase，拆分组件放在 lowerCamelCase 同名目录，以 index.tsx 提供公开入口；工具和 Hook 的 .ts 文件用 kebab-case。

## 仓库组织

MVP 的实际目录：

```text
agent-base/
├── packages/cli/       # CLI 参数、交互、安装、检查与测试
├── skills/             # Skills 源码与目录描述
├── registry/           # 定制 UI 源码、资产元数据和组合依赖
├── templates/          # 可由 CLI 初始化的业务项目模板
├── scripts/            # TypeScript 构建与校验脚本
├── docs/               # 架构、CLI 协议与验证记录
└── AGENTS.md           # 简短、长期有效的开发约束
```

当前业务模板也是 UI 集成验证载体。独立 playground 和稳定共享包在有需求时增加，不为未来模块建立空包。组件的类型、实现和运行示例作为事实来源，Skill 说明如何查找和使用这些资产，不复制完整 API 文档。

## Web 资产边界

1. Base UI、React Hook Form、TanStack Table 使用上游依赖。
2. 上游已满足需求的 shadcn 组件按需安装，不预先复制一整套到这里维护。
3. 本仓库维护主题 token、必要的定制组件和表单、列表等高频组合。
4. 产品特有页面、领域逻辑和接口留在产品仓库。

先用源码分发满足独立产品的定制需要。稳定且需要统一修复的逻辑，后续可单独发布 npm 包；同一资产起步时只维护一种分发方式。复制到产品的源码不会自动同步上游，更新必须展示差异。

MVP 内置 Button、FormField、DataTable，通过 lt add ui 安装到业务项目。内部目录使用轻量 JSON 文本快照，尚未接入 shadcn Registry，也不声称兼容其协议；接入时在 CLI 内部适配，不增加额外用户入口。

AI 友好依靠可发现的目录、精确类型、可运行示例和验证命令。MCP 是可选入口，优先接入 shadcn 已有 MCP；只有出现明确能力缺口才自研。

## Skills 组织与安装目标

每个 Skill 用独立目录维护，入口是包含 name 和 description 的 SKILL.md。需要时附带 references、scripts 和 assets，按需加载；不把全部流程堆进项目常驻规则。

首批 Skills：web-ui、forms、tables、github-projects。它们指导 Agent 尊重现有组件、状态归属和关键失败路径，不假定尚未实现的自有组件已经存在，也不授权额外部署或生产写入。

MVP 仅支持项目级安装：

| 目标        | 路径                 |
| ----------- | -------------------- |
| Codex       | .agents/skills/名称/ |
| Claude Code | .claude/skills/名称/ |

当前工作目录就是默认目标，使用 --cwd 显式指定其他目录；init 可创建父目录已存在的新目录；不向上猜测项目根目录。若恰好检测到一个支持的 Agent 目录则采用它，否则交互选择；非交互环境在无法唯一检测时要求显式 --agent。不覆盖已有 AGENTS.md、CLAUDE.md 或全局用户配置；业务模板可在空目标中创建自己的 AGENTS.md。

## CLI 交互和应用层

入口逐级补齐缺失信息：

| 输入                               | 行为                           |
| ---------------------------------- | ------------------------------ |
| lt                                 | 选择初始化、安装、查看或检查   |
| lt add                             | 选择 Skills、UI 组件或项目预设 |
| lt add skill                       | 搜索、多选 Skills              |
| lt init business-web --agent codex | 初始化业务项目                 |
| lt add skill web-ui --agent codex  | 直接安装                       |

只有 stdin 和 stdout 都为 TTY，且没有 --non-interactive、--json、CI 标记时才允许菜单。完整参数不弹确认菜单；普通新增安装直接执行；MVP 遇到冲突拒绝写入，不提供 --force。

交互只收集参数，不直接改文件。执行顺序为：解析输入、补齐选择、加载和校验目录、生成计划、检查冲突、执行、返回结果。取消菜单不会写文件。输出实际安装版本、目标路径和可复用的完整命令。

JSON 模式只输出机器可读的结果或错误，不混入日志、菜单和 ANSI 控制字符。参数缺失返回可执行示例。退出码：0 成功，1 操作或检查失败，2 参数或输入数据不合法，130 用户取消。

## 业务模板与 GitHub 管理

lt init business-web 安装 React + Vite + Tailwind 项目、复用 UI、GitHub 与 code-quality 预设和全部内置 Skills。业务示例为任务工作台，包含新建、编辑、校验、搜索、排序、客户端分页与 localStorage 持久化；加载/空/失败状态真实处理。当前没有后端、登录或跨设备同步，不伪装生产级 SaaS。生成后由使用者运行 npm install、npm run tooling:setup 和 npm run dev；模板自带质量工具依赖和脚本，CLI 不自动执行它们。

GitHub Projects 用于组织 Issue、PR 和草稿事项。默认可执行工作使用 Issue，小步骤用 checklist，独立子工作用 sub-issue。Status 建议 Backlog/Ready/In progress/In review/Done，Priority 建议 P0–P3，尊重已有项目约定。github-projects Skill 提供执行指导，preset 安装 Issue 表单、PR 模板和管理标准；Issue 表单内容不自动变成 Project 字段。安装不触发远程创建、授权或自动化。

## 目录来源与版本

MVP 默认读取随 CLI 包一同分发的目录快照，安装时可离线使用。另支持 --source 指定本地 JSON 文件或 HTTPS JSON URL，满足自有静态目录下载，无需后端服务或 Git 客户端。

目录协议为 schemaVersion、version、skills 和 assets。项目资产有 type、name、description、files、requires 和 dependencies。每个 Skill 有 name、description 和 files；每个文本文件有相对 path、content 和 SHA-256。先完成整个目录下载与校验再进行写入。MVP 仅支持 UTF-8 文本文件，不执行下载的脚本，也不自动安装依赖。

默认快照通过固定 CLI 版本复现；远程目录推荐用包含 tag 或 commit 的不可变 URL，并可用 --source-sha256 固定目录原始字节摘要。只靠目录内的文件摘要不能证明发布者身份。来源必须由使用者信任；CLI 不自带账号、凭据或私有源认证系统。

MVP 目录资产随目录版本统一发布；独立版本需求出现后再扩展。安装记录同时保存来源、目录摘要、版本和文件摘要，避免仅记录容易漂移的版本字符串。

## 安装状态与文件保护

项目的 .agent-base/manifest.json 记录 CLI 管理的资产，建议随项目提交。CLI 管理安装的 Skill 目录和项目资产文件，不接管现有同名内容。安装来源和所有权分别记录在 installations 与 assets。

- --dry-run 生成并检查计划，零写入。
- 第一次安装先检查全部目标；任何一个冲突，整批拒绝。
- 相同来源内容、相同版本且本地文件未变化时，重复安装为 no-op。
- 版本变化、本地修改、额外文件或未知同名目录均视为冲突，不把 add 偷偷变成 update。
- 拒绝路径穿越、绝对路径、符号链接及目录/文件碰撞。
- 所有内容先加载到内存并校验；写入过程中使用项目级锁，安装记录暂存后原子替换。失败时回滚本次新建文件，并保留既有记录。
- 这不是数据库事务：强制结束进程、机器断电或外部程序同时改文件仍可能留下中间状态。doctor 应能暴露不一致；锁残留需确认无进程运行后人工清理，不自动抢锁。

## 检查与质量基线

代码质量采用 ESLint flat config、typescript-eslint 和 React Hooks recommended 规则，Prettier 独立格式化，eslint-config-prettier 最后加载以关闭冲突规则。不将格式化嵌入 ESLint，不因为新工具的性能宣传同时引入重叠检查器。ESLint 使用受支持的 10 系列；未验证兼容的插件不强制安装。当前不启用与其不兼容的 jsx-a11y 插件，语义元素、表单标签和键盘焦点仍属于评审与运行验证要求。

`code-quality` 是可独立安装的预设，提供质量工具配置、Hook、设置脚本与规范文档。`lt add preset code-quality` 只写资产；既有项目显式执行 `npx tsx tooling/setup-project.ts` 补齐缺失脚本和开发依赖声明，发生冲突时停止并报告，再由使用者安装依赖、运行 `npm run tooling:setup`。业务模板预先声明这些内容。Hook 只在已经初始化 Git 的项目启用，不替使用者创建仓库或提交。

Husky 的 pre-commit 先用 lint-staged 格式化暂存文件，再执行全量 ESLint、Prettier 检查与类型检查；不自动暂存未暂存的业务内容。commit-msg 用 commitlint 检查 Conventional Commits，允许中文描述。CI 独立执行质量检查与 PR 提交范围校验，本地 Hook 不能替代远程门槛。

React 按职责和状态归属拆分组件，避免高频状态提升到无关子树的共同祖先；不强制所有组件都建目录或使用 memo。Hooks 规则检查已知反模式，实际渲染成本与交互延迟通过 Profiler 验证，不能声称 ESLint 能消除所有不必要渲染。详细约定集中维护在 [编码规范](coding-standards.md)，不在各资产重复一套不同规则。

doctor 离线检查本地安装记录和受管理文件，报告缺失、内容变化及非法路径；Skill 目录额外文件也报告，产品项目的无关新增文件不报告。不把“文件完整”表述成“Skill 行为一定正确”，也不声称能检查尚未安装的 UI 依赖。未初始化项目明确显示尚无安装记录。

测试覆盖完整命令、参数缺失、JSON、首次安装、多资产安装、重复安装、dry-run、冲突、下载和摘要失败、路径逃逸以及 doctor 检测变化。构建后打包到仓库外的干净目录验证 CLI 和内置资产不依赖 workspace 路径。交互流程另做真实终端验证。

锁文件纳入版本控制。CI 安装使用 frozen lockfile，运行格式检查、ESLint、类型检查、测试和构建。业务模板通过独立安装 smoke 验证，不借用仓库工具或内部路径。不依靠禁用断言或吞异常通过检查。

## 实施阶段与完成标准

| 阶段     | 范围                                                                                                           | 完成标准                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| MVP      | TypeScript、架构、4 个 Skills、3 个 UI、GitHub preset、业务模板、init/list/add/doctor、交互/完整命令、目录分发 | 仓库外可安装、重复执行无变化、冲突不覆盖、失败可见、检查能识别篡改 |
| Web 闭环 | 在已跑通模板上按真实项目扩展主题、业务组合，按需接入 shadcn Registry                                           | 空项目安装后可完成带校验表单与分页列表，包含加载、空和错误状态     |
| 可控更新 | diff，再逐步实现 update                                                                                        | 展示基线、本地与上游差异；不覆盖本地修改；有迁移说明               |
| 移动端   | 首个 Expo 产品、按需提取组件                                                                                   | 验证真实设备上的输入、导航、手势和可访问性                         |

init 已组合现有安装能力，并与独立安装共享文件事务。插件系统、完整卸载、自研 MCP、自动合并及自动部署不在 MVP 范围。新发现的非阻塞改进记录为后续项，不无限扩大当前实现。

## 公共 npm 分发

包名 @luigix/tools，bin 名为 lt。发布后用户无需克隆仓库，可直接 npx @luigix/tools 或 npm install -g @luigix/tools。包中只包含编译后的 CLI、内置目录与使用说明，消费者不需要 pnpm 或 tsx。仓库使用 pnpm 不限制消费者的 npm/yarn/pnpm 选择。

发布前必须通过仓库外 npm 打包安装验证。公开包的版本与内置目录版本保持一致，发布不与构建混在一起执行。当前不自动发布；需明确授权及 @luigix scope 的发布权限。

## 官方资料与决策依据

以下资料在设计时核对；具体依赖版本以仓库锁文件为准。

- [pnpm workspace](https://pnpm.io/workspaces)：轻量工作区。
- [Base UI](https://base-ui.com/react/overview/about) 和 [表单集成](https://base-ui.com/react/handbook/forms)：无样式原语与外部表单状态。
- [shadcn Base UI](https://ui.shadcn.com/docs/changelog/2026-01-base-ui)、[Registry](https://ui.shadcn.com/docs/registry)、[MCP](https://ui.shadcn.com/docs/mcp)：复用组件实现与分发能力。
- [TanStack Table](https://tanstack.com/table/latest/docs/overview)：表格逻辑与展示分离。
- [React Native 框架建议](https://reactnative.dev/blog/2024/06/25/use-a-framework-to-build-react-native-apps)：Expo 方向。
- [OpenAI Skills 文档](https://learn.chatgpt.com/docs/build-skills) 和 [Claude Code Skills](https://code.claude.com/docs/en/skills)：目录结构与发现路径。
- [Commander](https://github.com/tj/commander.js)、[Clack](https://bomb.sh/docs/clack/packages/prompts/)：参数解析、选择与搜索交互。
- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)、[Issue 表单](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)：项目管理关系与模板结构。
