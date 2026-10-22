# 验证记录

本文按实施阶段保留历史证据，旧章节中的目录、打包方式和测试数量描述当时状态；当前发布结果见 [单包结构与自动发布验证](#2026-10-22单包结构与自动发布验证)。

日期：2026-10-03。验证环境为 macOS ARM64、Node.js 24.18.0、pnpm 10.34.6。首次提交 e9fbe93 已推送，GitHub CI 的完整检查与 npm 打包安装验证通过。

## 2026-10-23 发布版本回写

- 源码 package.json 从历史开发版本 0.1.0 对齐已发布的 2.0.0；没有创建新版本或修改既有发布标签。后续通过 npm 插件更新版本，再由 git 插件仅提交 package.json，使用带 `[skip ci]` 的版本提交回写 main。
- 临时本地 Git 远程仓库执行真实 semantic-release npm/git 插件，验证从 2.0.0 修复升级到 2.0.1、远程版本文件与 tag 一致、版本提交只包含 package.json、未跟踪文件未被收集，以及后续文档提交不发布。npm 发布和 GitHub 插件未启用，不访问真实发布服务。
- 锁定 pnpm 10.34.6 执行 `pnpm check` 通过：111 项测试、lint、格式、类型检查和构建。构建后的 `lt --version` 输出 2.0.0。
- `pnpm smoke` 通过：仓库外打包安装、npm/pnpm 模板依赖安装、doctor 和模板完整检查。当前版本回写改动尚未推送，GitHub Actions 自动回写仍需下一次真实发布验证。

## 2026-10-22 整批提交与统一推送

- release-with-codex 默认覆盖目标仓库的全部未忽略改动，包含暂存、未暂存、部分暂存、未跟踪、删除、文档和测试；只有用户明确限定范围时才缩小。
- 允许按意图拆分本地提交并逐批审查，但整批内容全部提交、Git 工作区干净后才统一 push 一次，由现有 CI 根据所有提交的最高影响决定统一版本；不为文档和测试额外补推或伪造 fix。
- 对仅因混合提交范围而产生的审查阻塞，自动拆分后复审；真实无法解决的问题仍停止提交和推送，不绕过审查。
- 安装副本与 luigi-skills 源文件同步，源资产升级为 0.1.1 并重新生成分发快照；结构校验和源仓库完整检查通过。当前 CLI 完整检查包含 110 项测试，仓库外 npm/pnpm 安装 smoke 通过。

## 2026-10-22 HTTPS 下载自动重试

- 索引和正文共用下载层，连接重置、超时、临时 DNS 故障与 HTTP 408/429/500/502/503/504 总共最多尝试 5 次（含首次），按 250、500、1000、2000 毫秒退避。每次请求使用独立的 15 秒超时，中途断开从头下载。
- 回归覆盖前 4 次失败第 5 次成功、连续 5 次失败且没有第 6 次请求、失败响应释放、正文中途断开不混入旧数据、读取正文超时后的 AbortError、确定性错误不重试，以及最终错误保留 URL/原因/错误码/尝试次数。
- 锁定 pnpm 10.34.6 执行 `pnpm check` 通过：110 项测试、lint、格式、类型检查和构建。
- `pnpm smoke` 通过：仓库外安装公共包、npm/pnpm 模板初始化、doctor 与模板完整检查；smoke 使用冻结本地快照。
- 使用默认公开 main 索引执行 `lt add skill web-ui --agent codex --cwd /tmp/lt-network-retry-verification --dry-run --non-interactive --json` 成功，验证真实远程索引、正文下载及校验，没有写入项目；单次成功不代表网络已持续恢复。未发布 npm。

## 2026-10-22 移除持久安装记录

- 已移除 `.agent-base` 的读写、manifest schema、资产文件基线和事务暂存目录，没有在其他位置保存替代安装记录。旧项目遗留目录不再使用，不自动删除用户文件。
- Skill 以实际 SKILL.md 的 name 判重；同名跳过且保留本地内容，支持不同目录名。UI/模板/预设按当前来源文件内容判断：全部一致时跳过，部分存在或不同则整批拒绝。
- 项目锁为仅安装期间存在的 `.lt-install.lock`；保留排他写入、整批冲突检查、失败回滚及清理失败的显性报告。doctor 改为离线检查实际 Skill 元数据、现存目录缺少入口及残留锁，不声称支持历史完整性检查。
- 锁定 pnpm 10.34.6 执行 `pnpm check` 通过：103 项测试、lint、格式、类型检查和构建；测试覆盖无状态重复安装、版本变化跳过、定制保护、部分文件冲突、并发锁、失败回滚和清理失败。
- `pnpm smoke` 通过，包含仓库外 npm 包安装、npm/pnpm 模板初始化与完整质量检查；新增断言确认初始化不留下 `.agent-base` 和临时安装锁。测试采用本地冻结来源，未执行 npm 发布。
- 以下章节为历史验证，涉及旧安装记录及 doctor 基线检查的描述均以本节为准。

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

### 统一写入目录选择（历史行为，add 已按下节调整）

- `pnpm check` 通过：ESLint、格式、类型检查、81 项测试和构建。
- 回归覆盖 init/add 共用目录选择、显式 --cwd 跳过询问、非交互缺失目录报错、只读命令保持原行为、新目录 dry-run 零写入、取消零写入、路径校验、失败回滚新建目录，以及只安装 Skill 不附带模板。
- 真实 PTY 验证新文件夹安装 Skill、当前目录预览及文件夹名称输入时 Ctrl+C 取消；核对实际文件，取消退出码为 130，预览和取消均无新增写入。
- 当时（扁平化前）本机 lt 解析到本仓库的 CLI 子包构建产物，实际命令显示新目录菜单；未修改全局映射。当前入口为根目录 dist/index.js。

### 添加资产直接使用当前目录

- 交互式 add 默认当前目录，Skill、UI 和预设均不询问新建文件夹；init 保留目录选择，显式 --cwd 及非交互必须指定 --cwd 的约定保持不变。
- `pnpm check` 通过：98 项测试及 lint、格式、类型检查和构建。新增或调整回归覆盖主菜单添加 Skill 的固定目标路径、实际安装、dry-run、取消，以及 init 目录选择。
- 真实 PTY 验证主菜单选择添加后直接进入类型、Agent、Skill 列表，未出现目录输入；Skill 列表中 Ctrl+C 返回 130。完整安装行为由回归测试验证。
- 保留 `.agent-base` 安装记录、项目锁和事务暂存能力；同名未管理目录、本地文件修改、整批冲突和回滚保护沿用原有回归测试。
- `pnpm smoke` 通过：仓库外 npm 包安装、命令入口、npm/pnpm 模板初始化、doctor 和模板完整检查。默认使用冻结的本地 v1 快照，本轮不据此宣称公开网络来源已恢复或 npm 已发布。

### 按 Skill name 识别实际安装（后续已移除持久记录）

- `lt list` 和 Skill 菜单读取实际 SKILL.md 的 YAML name；无 manifest、不同目录名以及 Codex/Claude 独立安装均可识别，没有记录时不伪造版本。
- 回归覆盖 CRLF、带引号与注释的 YAML、Agent 筛选、菜单已有安装提示、已删除文件不误报、有记录时展示版本、无效元数据和符号链接显性失败，扫描及预览不写入文件。
- 使用锁定的 pnpm 10.34.6，`pnpm check` 通过：102 项测试、lint、格式、类型检查与构建；`pnpm smoke` 通过仓库外分发包安装与模板完整检查。YAML 解析复用已有 yaml 库，移为运行时依赖且未升级版本；锁文件一致性检查通过。
- `.agent-base` 继续保存受管理资产的基线，不再作为 Skill 是否实际存在的唯一依据。测试使用本地冻结来源，不代表公开网络恢复或已发布 npm。

### 初始化时选择包管理器

- `pnpm check` 通过：87 项测试及全量静态检查、构建。新增回归覆盖 npm/pnpm 子进程的工作目录、执行时机、JSON 日志隔离、跳过安装、dry-run、参数校验、冲突保护、菜单取消、非零退出和命令缺失。
- 仓库外打包 smoke 已改为通过 `lt init --package-manager npm --json` 安装真实模板依赖，随后通过 doctor 和模板完整质量检查、测试与生产构建。
- 真实 PTY 验证 pnpm/npm/暂不安装菜单；选择 pnpm 后成功调用本机 pnpm 11.22.0，输出对应的复用及启动命令。
- 真实 pnpm 11.22.0 完整模板安装暴露 esbuild 未批准构建问题；模板加入 `allowBuilds.esbuild: true` 后安装成功。pnpm 自动写入配置的单引号风格另通过精确的 Prettier 文件覆盖规则兼容，生成项目完整 `pnpm run check` 通过。
- pnpm 可能自动更新 pnpm-workspace.yaml（本轮写入了发布时间策略例外），doctor 会按原有规则报告该受管理文件的变化；未隐藏配置差异或更改全局包管理器设置。Windows 子进程启动尚未实机验证。

### pnpm 8 工作区配置兼容修复

- 使用本机 Homebrew pnpm 8.11.0 对旧模板复现 `ERR_PNPM_INVALID_WORKSPACE_CONFIGURATION: packages field missing or empty`；pnpm 11 的验证未覆盖这一旧版要求。
- 模板补充 `packages: ["."]`，CLI 初始化回归测试断言生成配置包含该字段。保留 esbuild 的构建配置，不修改全局包管理器或要求用户升级。
- 用户项目 ccccc 已补齐配置，使用 pnpm 8.11.0 安装后通过完整质量检查、测试和生产构建；独立新项目分别通过 pnpm 8.11.0、10.34.6、11.22.0 安装。
- 依赖安装失败时在错误消息中保留 stdout/stderr 的最近输出，移除 ANSI 控制序列；JSON 回归验证具体诊断不会丢失，完整日志仍流向 stderr。
- 仓库外 smoke 扩展为真实 npm、pnpm 两条安装和完整模板检查路径，并记录实际 pnpm 版本。
- 修复后 `pnpm check` 的 87 项测试及构建通过；新版仓库外 smoke 使用 npm 和 pnpm 8.11.0 均通过真实安装、完整模板检查与生产构建。

## 范围与限制

许可副本精简：构建停止向每个 Skill 和项目资产附加 LICENSE/许可声明副本，npm 包级 LICENSE 保留。`pnpm check` 的 87 项测试通过；仓库外新项目确认无 licenses 目录及 Skill 许可副本、doctor 通过，npm pack 预览确认保留包级 LICENSE。来源自带 LICENSE 的安装回归通过。已清理 ccccc 中 10 个未修改的自动生成副本并同步 manifest，对比清理前后 doctor 结果一致；未改写其他文件的安装摘要。

远程目录通过注入 HTTP 响应测试成功、错误状态、体积限制和摘要不匹配，尚未部署真实目录站点。npm 打包安装已验证，发布 scope 为 @luigix，已确认发布账号 lishaojie 为组织 owner。仓库与分发资产采用 MIT；实际发布版本以 npm registry 和 GitHub Release 记录为准。

GitHub 模板和 Skill 为本地资产，没有创建远程 Project、Issue、标签或自动化；需要在使用者明确授权和具备权限后操作。Windows、真实断电、恶意外部进程同时修改文件及真实设备移动端不在本轮验证范围。

业务模板使用 localStorage，尚无服务端和身份认证；UI 组件面向 React + Tailwind 项目，安装时检查依赖声明，不自动接管 package.json。doctor 的摘要差异表示相对安装快照发生了修改，不等于业务代码错误。

## Python 交互性能 Skill

新增 `profile-web-interaction`，通过现有 registry 随 CLI 分发；脚本使用纯 Python，不要求目标项目安装 Playwright 或修改 Node.js 依赖。`setup.py` 将 Python 包和 Chromium 放在独立虚拟环境中，录制器按该环境的浏览器路径运行。

- 在全新虚拟环境验证缺少 Playwright：非零退出、明确安装提示、不创建录制目录。
- 安装 Python 包后保持独立浏览器目录为空，验证缺少 Chromium：非零退出、保留失败记录、明确 setup 命令。之后按 Skill 指引首次安装浏览器并成功录制。
- 本地计算器执行清空、7、加、8、等于和结果断言；10 秒窗口完成，结果为 15。该次 trace 约 2.1 MB，提炼的 JSON 约 23 KB、Markdown 约 2.7 KB；记录了 React Components 轨道，CPU 帧映射到 Calculator.tsx、Button.tsx 和 calculator.ts。此单次开发模式样本不作为生产性能结论。
- 故意定位不存在的按钮并设置 1 秒窗口，验证超时返回非零状态；原始 trace、CPU profile 和失败步骤保留，提炼失败录制仍返回非零状态。
- 通过构建后的 CLI 将 Skill 安装到仓库外，再从已安装目录录制和提炼；doctor 无变化，执行没有在 Skill 内产生虚拟环境或 Python 缓存。
- 14 项 Python 标准库测试覆盖 source map、未映射回退、CPU 父子耗时、乱序时间、非法采样、任务去重与线程隔离、场景输入及首次使用缺失依赖。已纳入 pnpm check，CI 明确准备 Python。
- skill-creator 校验通过；pnpm check、完整 npm/pnpm 仓库外打包安装 smoke 通过。实际浏览器验证环境为 macOS、Python 3.14 和 Playwright 1.63；Linux/Windows 浏览器运行未在本机验证。

后续用相同计算器进行连续交互验证：基线 5 次点击、高频 180 次点击，各录制 10 秒并重复 3 次，全部结果断言通过。高频操作区间约 6.1 秒、约 30 次点击/秒；记录到 2799–3043 个 React span，没有至少 50 ms 的主线程任务，已记录 span 最大耗时为 1.299–2.6 ms。span 数不是 commit 数，单次 span 也不是完整交互延迟；该样本不支持为简单按键逐个添加缓存，不代表生产或低端设备性能已验证。

高频原始 trace 约 55 MB，初版 JSON 因逐步明细膨胀至约 89 KB。默认摘要改成有界统计与证据索引后为约 6.1–6.3 KB：保留环境、操作总数、关键耗时、少量热点和缺失信息；不重复完整步骤、generated 帧和每次渲染属性。明细保留在原始文件。测试覆盖 200 步场景的摘要大小与计数，避免摘要随逐步数据线性膨胀。

## 2026-10-22：CLI 与内容仓库拆分

- CLI 的 `pnpm check` 通过，包含 90 项测试。新增按需下载、纯 UI 来源、跨来源固定版本、来源摘要漂移、缺失/循环/冲突依赖、快照身份与版本校验、下载失败零写入以及参数错误先于网络访问的验证。
- luigi-ui、luigi-skills、luigi-starters 分别执行自己的 `pnpm check` 通过；UI 和预设保留 ESLint 检查，Skills 保留 14 项 Python 回归，三个仓库均有分发版本不可覆盖和历史保留测试。
- `LT_SOURCE="$PWD/sources.local.json" pnpm smoke` 使用三个真实内容仓库的分发文件，在仓库外安装 npm 包；确认 npm 包不包含 registry 正文，npm/pnpm 初始化后的模板均通过 lint、格式、类型、测试和生产构建。
- 本地拆分验收时，工作区改动已先备份再迁移，原 Git 暂存区未更改；当时尚未提交、推送或 npm 发布，公开仓库为空，仅通过本地组合来源完成验证。后续推送结果见下节。
- 本次未新增浏览器交互或性能验证；历史验证记录描述当时的架构，不代表资产现在仍随 CLI 打包。

## 2026-10-22：公开来源推送验证

- 经明确授权，luigi-ui、luigi-skills、luigi-starters 的源码和分发索引已提交并推送至 main，三个仓库的 GitHub Actions 均通过。
- 清除 LT_SOURCE，使用编译后的 CLI 默认公开来源，实际列出 5 个 Skills 与 6 个项目资产；在临时目录下载完整 business-web 模板及跨仓依赖，doctor 通过，逐资产安装记录均指向公开 HTTPS 快照。
- 首次联网检查出现一次 fetch failed，随后相同默认来源重试通过；未修改网络设置或跳过摘要校验。
- 此次操作仅提交与推送 Git 仓库，当时尚未发布新版 npm 包；后续 `1.0.0` 发布结果见下节。

## 2026-10-22：单包结构与自动发布验证

- CLI 已从 packages/cli 移至根目录 src、test、dist，仓库只保留一份 package.json；pnpm-workspace.yaml 仅配置 esbuild 构建权限，不声明子包。分发包不包含资产正文、源码、测试或工程工具目录。
- 本地 `pnpm check` 通过，包含 95 项测试和构建；新增发布回归覆盖 patch、minor、两种 major 提交及无发布提交，同时验证实际发布说明渲染，避免仅验证版本计算遗漏依赖兼容问题。
- [GitHub Actions](https://github.com/shaojie-li/luigi-tools/actions/runs/39740136331) 的检查、npm/pnpm 模板安装 smoke 和发布任务均通过。npm Trusted Publisher 已绑定到 shaojie-li/luigi-tools 的 ci.yml，使用 OIDC 完成发布，无需长期 npm token。
- 首次上传阶段曾返回 401，npm 当时也报告发布服务降级。核对 npm 无 1.0.0、无对应 Release 且无运行中的发布后，仅撤销该失败运行生成的 v1.0.0 标签，使用预期 SHA 保护删除，再重跑同一提交；未修改源码版本或新增提交来绕过失败。
- `@luigix/tools@1.0.0` 已发布，npm latest 为 1.0.0，[GitHub Release v1.0.0](https://github.com/shaojie-li/luigi-tools/releases/tag/v1.0.0) 对应提交 d6085099e1ec0ed578c45383292e06aa82356556，并生成 npm provenance。
- 发布成功后公开元数据曾短暂仍返回 0.1.0；重新查询确认 latest 和版本列表更新后，在仓库外通过 `npm exec --yes --package=@luigix/tools@1.0.0 -- lt --version` 实际下载安装，输出 1.0.0。源码 package.json 保持开发版本 0.1.0，符合不回写版本提交的发布策略。
