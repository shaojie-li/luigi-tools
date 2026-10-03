# 编码与提交规范

本规范面向基建仓库，以及通过 `lt init business-web` 创建的业务项目。目标是让人和 Agent 使用相同的质量门槛，及早发现确定性错误，同时保留产品代码需要的自由度。业务模板通过 `code-quality` 预设携带配置和 Hook，既有项目可以使用 `lt add preset code-quality` 按 CLI 的冲突保护规则接入。具体启用的规则以项目配置为准；运行和性能验证不能用静态检查代替。

## 工具职责与选择

使用 **ESLint 10 flat config + typescript-eslint + React Hooks 规则 + Prettier**。配置与脚本优先 TypeScript，要求 Node.js 22.13+，具体工具版本以锁文件为准。插件先验证当前版本兼容性，不为引入某个插件长期停留在已停止维护的 ESLint 主版本。

| 工具        | 负责                                       | 不负责                         |
| ----------- | ------------------------------------------ | ------------------------------ |
| Prettier    | 缩进、引号、换行及支持格式的统一排版       | 判断业务正确性或 React 性能    |
| ESLint      | 可静态判断的代码问题、文件命名、Hooks 约束 | 重复执行格式化或证明性能无问题 |
| TypeScript  | 严格类型检查、模块和调用契约               | 校验运行时外部输入             |
| Husky       | 在 Git 提交时调用检查                      | 代替 CI 或授予提交权限         |
| lint-staged | 格式化本次暂存内容，保护部分暂存边界       | 自动加入未暂存的业务修改       |
| commitlint  | 提交消息的机器可检查结构                   | 判断提交是否原子、描述是否准确 |

`eslint-config-prettier` 放在 ESLint 配置末尾，关闭与 Prettier 冲突的规则。不使用 `eslint-plugin-prettier`，避免把排版检查嵌套进 ESLint；格式化与代码检查各运行一次。这符合 [Prettier 官方集成建议](https://prettier.io/docs/integrating-with-linters)。

Biome 和 Oxlint 都值得评估，但当前不同时引入多套重叠工具：

- **Biome** 提供格式化、lint 和迁移工具；迁移后的规则行为与 ESLint 不保证完全相同。若未来要统一工具链，先验证当前规则、文件格式和模板输出的覆盖情况，再切换。[Biome 迁移说明](https://biomejs.dev/guides/migrate-eslint-prettier/)
- **Oxlint** 面向 lint 性能，也支持类型信息与多文件分析；不能简单认为它只支持语法检查。是否替换应依据本仓库实际耗时、插件兼容性和检查结果，而不是上游基准数字。当前没有证据说明 lint 耗时构成瓶颈，因此优先保持一套容易验证的规则体系。[Oxlint 官方说明](https://oxc.rs/docs/guide/usage/linter.html)

## 文件与符号命名

React 组件符号与组件文件使用 **PascalCase**；非组件的 `.ts` 文件使用 **kebab-case**。点号可以表达明确的文件角色。确需保留的 JavaScript 文件遵循对应规则。

| 内容              | 文件名                                      | 导出符号示例         |
| ----------------- | ------------------------------------------- | -------------------- |
| 单文件 React 组件 | `TaskForm.tsx`                              | `TaskForm`           |
| 拆分后的组件入口  | `taskDialog/index.tsx`                      | `TaskDialog`         |
| 组件内部子组件    | `taskDialog/TaskDialogHeader.tsx`           | `TaskDialogHeader`   |
| 自定义 Hook       | `use-task-storage.ts`                       | `useTaskStorage`     |
| 普通函数          | `build-registry.ts`                         | `buildRegistry`      |
| 类型或校验        | `task-schema.ts`                            | `Task`、`taskSchema` |
| 测试              | `TaskForm.test.tsx`、`task-storage.test.ts` | 以行为描述测试       |
| 配置或声明        | `eslint.config.ts`、`vite-env.d.ts`         | 遵循对应工具契约     |

文件名由 ESLint 检查，不能只靠文档或评审。`index.tsx` 是组件目录入口例外；应用启动文件 `main.tsx` 是 bootstrap 例外，不用于命名普通组件。测试等中间扩展不改变基名规则。命名错误不自动重命名，以免遗漏导入路径和大小写敏感系统的问题。变量、函数用 camelCase；真正的自定义 Hook 使用 `use` 前缀并遵循 Hooks 规则。

一般目录默认 kebab-case；组件拆分目录使用与组件同名的 **lowerCamelCase**，例如 `TaskDialog` 对应 `taskDialog`。`README.md`、`AGENTS.md`、`SKILL.md` 等工具约定文件保留原名。生成产物、第三方源码不套用手写源码命名规则；未来框架确实要求特殊文件名时，在配置中增加精确例外并说明原因，不整体关闭规则。

## React 组件组织与拆分

小型组件保留单文件，例如 `Button.tsx`；不要求每个按钮都建立目录。组件承担多种独立职责、拥有不同状态生命周期，或内部部分需要独立验证时，按职责拆分。文件行数可以提示评审，但不使用固定行数阈值机械拆分。

例如，包含表单、操作区及状态处理的 `TaskDialog` 可以组织为：

```text
components/
├── Button.tsx
└── taskDialog/
    ├── index.tsx
    ├── TaskDialogHeader.tsx
    ├── TaskDialogActions.tsx
    ├── use-task-dialog.ts
    └── task-dialog-schema.ts
```

`index.tsx` 是这个组件的公开入口，可以直接承载 `TaskDialog` 的组合实现；外部通过目录入口使用它，不导入内部子组件。内部文件彼此按直接路径导入，不反向依赖自己的 `index.tsx`，避免循环依赖。不为每个叶子文件建立只有转导出用途的目录，也不使用 `export *` 把全部内部实现变成公开 API。

目录入口约定用于支持目录解析的 Web 项目；Node.js ESM 模块仍须遵循运行时的显式导入路径要求。组件内只有本地意义的 Hook、类型和工具保留在组件目录，出现真实跨组件复用后再提升，不提前建立巨大的共享 `utils` 或全量导出入口。

## TypeScript、模块与错误处理

- 保持 TypeScript `strict`，源码、脚本和测试统一使用 ESM。类型专用导入使用 `import type`；Node.js 内置模块使用 `node:` 前缀。
- 对外输入先校验再使用：CLI 参数、目录 JSON、本地安装记录、API 响应和 localStorage 都是运行时边界。`as SomeType` 不能代替校验；边界使用 `unknown` 并收窄类型，避免用 `any` 绕过检查。
- 不保留未使用的代码。不靠全文件禁用规则、`@ts-ignore` 或宽泛断言掩盖错误。确有上游兼容问题时，使用最小范围的例外，写明原因和移除条件。
- 跨包调用走公开入口，不导入另一个包的私有实现。通用 UI 不依赖业务页面或业务领域；浏览器模块不导入 Node.js 内置能力；共享逻辑不依赖 CLI 终端交互。当前目录较小时先保持方向清楚，真实跨包边界增加后再精确加规则，不预设复杂分层。
- 每个 Promise 必须被等待、返回给调用方，或有明确的错误处理。事件中的后台任务必须处理 rejection；单写 `void operation()` 不等于处理了错误。
- `catch` 应恢复到明确状态、增加上下文后抛出，或向用户报告失败。不要空捕获、只打印后返回成功，或用假数据掩盖读取失败。文件写入继续遵守架构中的冲突保护与回滚约定。

类型信息 lint 可以发现普通语法检查无法识别的问题，例如遗漏处理的 Promise；它也有分析成本。类型检查与类型信息 lint 都需要覆盖配置中的真实源文件，避免靠忽略文件消除解析错误。[typescript-eslint 类型信息检查](https://typescript-eslint.io/getting-started/typed-linting/)

## React 正确性与可访问性

- 使用函数组件；组件和 Hook 保持渲染纯净，不在 render 中写存储、发请求或修改输入对象。
- 启用 `eslint-plugin-react-hooks` 的 recommended 配置，检查 Hooks 调用位置、依赖与可分析的 React 约束。不要为了消除重复执行而忽略依赖；先修正数据流。规则包含部分 React Compiler 诊断，但启用这些规则不等于项目已经启用 Compiler。[React Hooks lint 说明](https://react.dev/reference/eslint-plugin-react-hooks)
- 派生值在渲染中计算，交互引起的操作放进事件处理器。Effect 用于同步 React 之外的系统，例如订阅、浏览器接口；清理订阅并处理请求取消或过期结果，避免用 Effect 串联一组派生 state。[React Effect 指南](https://react.dev/learn/you-might-not-need-an-effect)
- 列表使用稳定业务 ID 作为 key。允许排序、插入或删除的列表不用数组下标，也不在渲染时随机生成 key。组件定义放在稳定的模块作用域，避免每次渲染重新定义组件类型导致状态重置。
- 表单状态由 React Hook Form 管理，按字段订阅需要的数据。表单和异步操作应有提交中、成功、失败与重试行为；不要重复维护一份等价状态。
- 优先使用语义 HTML 与已有 Base UI 组件。输入有 label，错误有可关联的说明，交互支持键盘；对话框检查焦点进入、退出和恢复。静态无障碍规则无法替代实际键盘验证。

当前未启用与 ESLint 10 不兼容的 jsx-a11y 插件。无障碍要求仍由组件实现、评审和运行验证覆盖，不能把普通 lint 通过表述为已完成无障碍检查；插件接入需要单独验证兼容性。

## React 渲染与性能

**父组件重新执行不等于浏览器 DOM 一定变化。** React 的渲染计算与提交 DOM 是不同阶段；优化目标是交互延迟、计算成本和用户可感知的卡顿，而不是追求所有组件永不重新渲染。[React 渲染与提交](https://react.dev/learn/render-and-commit)

处理高频更新时按以下顺序判断：

1. **先收窄状态归属。** 输入草稿、hover、弹窗开关等状态留在最近的使用组件；只有多个组件确实共享时才提升。页面输入不应因为状态放在根部而反复驱动无关的大列表。
2. **再调整组合边界。** 让独立表单、搜索输入和列表各自承担状态，必要时通过 `children` 组合。不要为了小组件减少一次 render 引入新的全局状态系统。
3. **限制 Context 更新范围。** 按关注点与更新频率拆分 Provider；不要把高频输入与稳定配置装进一个大对象广播。消费者会响应其 Context 变化，`memo` 不能阻止这种更新。
4. **确认昂贵计算或引用契约。** 表格的 `data`、`columns` 等需要遵循所用库对引用稳定性的要求；不要在渲染期间无条件重建大数据集。先保证逻辑正确，再对反复且昂贵的计算使用 `useMemo`。
5. **对经过验证的边界使用缓存。** `memo` 用于 props 常常不变且渲染确实昂贵的子树；`useCallback` 用于需要稳定函数引用的接口或已缓存子组件。不要把每个组件、对象、事件都机械包一层缓存，也不要靠缓存维持正确性。[React memo](https://react.dev/reference/react/memo)、[useMemo](https://react.dev/reference/react/useMemo)

以“在表单连续输入时，是否导致与草稿无关的表格执行昂贵计算”为例，用 React DevTools Profiler 定位更新来源，再比较调整前后的交互耗时和相关子树成本。测量时固定数据量、设备与交互步骤；开发环境 Strict Mode 的额外执行不能直接当作生产性能结论。记录优化证据，不只记录 render 次数。[React Profiler](https://react.dev/reference/react/Profiler)

React Compiler 可自动处理一部分缓存，但不代替合理状态归属或性能测量。接入前先核对构建工具和第三方库兼容性，以单独的变更验证；本规范不要求现在为此扩大工具链。[React Compiler 介绍](https://react.dev/learn/react-compiler/introduction)

ESLint 无法静态证明“没有多余渲染”。自动规则负责消除已知反模式，评审负责判断状态边界，Profiler 负责验证具体性能问题。不设置“必须使用 memo”“禁止所有 JSX 内联函数”这类无法对应实际收益的统一规则。

## 提交前与 CI 质量门槛

本地提交采用两段 Hook：

1. `pre-commit`：通过 lint-staged 格式化暂存文件，然后执行全量 ESLint、全量 Prettier 检查与类型检查。自动修复只限格式化；lint 问题显性失败，开发者修复后再次提交。
2. `commit-msg`：通过 commitlint 检查提交消息。消息校验与源码校验分开，避免把 commitlint 错放到 `pre-commit`。[Husky](https://typicode.github.io/husky/get-started.html)、[commitlint 本地配置](https://commitlint.js.org/guides/local-setup.html)

完整业务模板已声明所需开发依赖和脚本，安装依赖后运行 `npm run tooling:setup`。既有项目独立安装 `code-quality` 预设时，先显式运行 `npx tsx tooling/setup-project.ts` 安全补齐缺失声明，再安装依赖并运行设置命令；已有配置冲突必须审查。Git Hook 需要项目已经初始化 Git，之后才建立仓库的项目应重新运行设置命令。

统一提供 `lint`、`lint:fix`、`format`、`format:check`、`typecheck` 脚本；Hook 调用 `precommit`，按顺序完成暂存格式化与全量检查。`lint:fix` 留给开发者主动执行，修改后审查差异。`commit-msg` 使用本地依赖执行 `commitlint --edit`，不临时下载远程工具。

保留 lint-staged 对部分暂存文件隐藏和恢复未暂存内容的默认行为，不使用 `--no-hide-partially-staged`，不在 Hook 中运行 `git add .` 或全量 `prettier --write .`。开发者可以主动运行全量格式化，但 Hook 不替开发者扩大本次提交范围。[lint-staged 暂存保护](https://github.com/lint-staged/lint-staged)

全量只读检查针对执行时的项目工作区；与当前提交无关的未暂存内容也可能令它失败。失败不代表应把这些内容全部暂存，应该修复问题或由开发者自行整理工作区。Hook 的保护机制也不意味着能替代备份或保证进程强制中断后的自动恢复。

交付前运行仓库约定的 `pnpm check`；业务模板保留等价的 `npm run check`。基建仓库 CI 重新执行格式、lint、类型、测试与构建，并校验提交范围。业务项目应将 `npm run check` 接入自己的 CI，并校验 PR 完整提交范围；当前预设提供本地配置与 Hook，不替已有业务项目创建或覆盖 CI。基建仓库还运行仓库外打包安装 smoke 验证，确认模板不依赖本仓库的路径和配置。CI 不自动格式化或修改提交。Hook 可被本地跳过，因此远程检查是独立门槛；是否设为分支保护的必需检查属于仓库管理配置。

新增规则时先验证它能拒绝一个真实坏例子，再确认现有有效代码通过。对文件写入、失败处理、命名约束和 Hook 暂存保护优先验证行为；不为了规则数量增加价值不明的限制。

## 提交消息与提交范围

采用 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)：

```text
type(scope)!: 中文具体描述

可选正文：解释修改原因、用户可观察行为或关键权衡。

可选页脚：关联 Issue 或说明不兼容变化。
```

`scope` 和 `!` 可选；type 使用小写英文，标题总长度不超过 100 个字符，描述不能为空且不写空泛的“更新”“修改”。正文默认中文。scope 优先使用可理解的范围，例如 `cli`、`ui`、`template`、`skills`、`tooling`，不强制枚举每个可能的目录。

| type       | 用途                           |
| ---------- | ------------------------------ |
| `feat`     | 新增对使用者可见的能力         |
| `fix`      | 修复已有行为错误               |
| `docs`     | 文档或使用说明                 |
| `refactor` | 不改变对外行为的代码结构调整   |
| `perf`     | 有依据的性能改进               |
| `test`     | 测试与测试辅助修改             |
| `build`    | 构建、打包及影响构建的依赖配置 |
| `ci`       | 持续集成配置                   |
| `style`    | 不改变行为的纯格式或排版调整   |
| `chore`    | 不属于其他类型的维护工作       |
| `revert`   | 撤销已有变更                   |

示例：

```text
feat(cli): 支持通过交互菜单选择多个 Skills
fix(template): 修复任务保存失败后仍显示成功的问题
perf(ui): 避免表单输入触发无关表格计算
chore(tooling): 增加文件命名与提交消息检查
feat(cli)!: 调整安装记录的数据结构

BREAKING CHANGE: 安装记录需要按迁移文档转换后才能继续使用。
```

不兼容变更在标题使用 `!` 或提供 `BREAKING CHANGE:` 页脚，并明确受影响场景与迁移方式。`feat`、`fix` 和不兼容变更为未来版本策略提供语义，但遵循提交格式不代表自动发布，也不授权提交、推送或发布。

一次提交应表达一个可解释的意图，包含必要测试和同步文档；不要把无关重命名、依赖升级或格式化混进功能提交。不强制每次提交都关联 Issue，有实际关联时使用页脚说明。commitlint 只能验证格式，提交范围和描述的真实性仍由开发者与评审负责。
