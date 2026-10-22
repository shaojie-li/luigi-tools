# CLI 编码与提交规范

本规范仅适用于 @luigix/tools。UI、Skills、模板及可分发预设的规范和验证由各内容仓库维护，职责边界见 [架构](architecture.md)。

## 工具与命名

使用 ESLint flat config、typescript-eslint、Prettier、Husky、lint-staged 和 commitlint，具体版本以锁文件为准。Prettier 负责排版；ESLint 负责静态错误、命名和 Promise 使用；TypeScript 负责严格类型检查。`eslint-config-prettier` 放在 ESLint 配置末尾，避免重复约束格式。

手写源码、脚本、测试及普通目录使用 kebab-case；测试以 `.test.ts` 结尾。变量和函数使用 camelCase，类型和类使用 PascalCase。`README.md`、`AGENTS.md`、`SKILL.md` 等工具约定名称保留。文件命名由 ESLint 检查，不自动重命名。

源码位于 `src/`，测试位于 `test/`，工程脚本位于 `scripts/`，本仓库开发工具位于 `tooling/`。保持单包结构，不恢复 workspace 子包或建立无当前用途的共享框架。

## TypeScript、模块与错误处理

- 本仓库保持 TypeScript `strict`，源码、脚本和测试统一使用 ESM。类型专用导入使用 `import type`；Node.js 内置模块使用 `node:` 前缀。
- 对外输入先校验再使用：CLI 参数、来源索引、资产快照、项目 package.json 和 SKILL.md 都是运行时边界。`as SomeType` 不能代替校验；边界使用 `unknown` 并收窄类型，避免用 `any` 绕过检查。
- 不保留未使用的代码。不靠全文件禁用规则、`@ts-ignore` 或宽泛断言掩盖错误。确有上游兼容问题时，使用最小范围的例外，写明原因和移除条件。
- CLI 不导入其他仓库的私有源码。终端交互只收集输入，与完整命令复用相同安装逻辑。当前目录较小时先保持方向清楚，真实跨包边界增加后再精确加规则，不预设复杂分层。
- 每个 Promise 必须被等待、返回给调用方，或有明确的错误处理。事件中的后台任务必须处理 rejection；单写 `void operation()` 不等于处理了错误。
- `catch` 应恢复到明确状态、增加上下文后抛出，或向用户报告失败。不要空捕获、只打印后返回成功，或用假数据掩盖读取失败。文件写入继续遵守架构中的冲突保护与回滚约定。

类型信息 lint 可以发现普通语法检查无法识别的问题，例如遗漏处理的 Promise；它也有分析成本。类型检查与类型信息 lint 都需要覆盖配置中的真实源文件，避免靠忽略文件消除解析错误。[typescript-eslint 类型信息检查](https://typescript-eslint.io/getting-started/typed-linting/)

## 提交前与 CI 质量门槛

本地提交采用两段 Hook：

1. `pre-commit`：通过 lint-staged 格式化暂存文件，然后执行全量 ESLint、全量 Prettier 检查与类型检查。自动修复只限格式化；lint 问题显性失败，开发者修复后再次提交。
2. `commit-msg`：通过 commitlint 检查提交消息。消息校验与源码校验分开，避免把 commitlint 错放到 `pre-commit`。[Husky](https://typicode.github.io/husky/get-started.html)、[commitlint 本地配置](https://commitlint.js.org/guides/local-setup.html)

安装开发依赖后由 `prepare` 设置本仓库 Git Hook；已有 Git 仓库且需要重新设置时运行 `pnpm run prepare`。

统一提供 `lint`、`lint:fix`、`format`、`format:check`、`typecheck` 脚本；Hook 调用 `precommit`，按顺序完成暂存格式化与全量检查。`lint:fix` 留给开发者主动执行，修改后审查差异。`commit-msg` 使用本地依赖执行 `commitlint --edit`，不临时下载远程工具。

保留 lint-staged 对部分暂存文件隐藏和恢复未暂存内容的默认行为，不使用 `--no-hide-partially-staged`，不在 Hook 中运行 `git add .` 或全量 `prettier --write .`。开发者可以主动运行全量格式化，但 Hook 不替开发者扩大本次提交范围。[lint-staged 暂存保护](https://github.com/lint-staged/lint-staged)

全量只读检查针对执行时的项目工作区；与当前提交无关的未暂存内容也可能令它失败。失败不代表应把这些内容全部暂存，应该修复问题或由开发者自行整理工作区。Hook 的保护机制也不意味着能替代备份或保证进程强制中断后的自动恢复。

交付前运行 `pnpm check`，覆盖 lint、只读格式检查、类型、测试和构建。涉及命令入口、分发或安装行为时，再运行 `pnpm smoke`，在仓库外验证打包安装与 npm/pnpm 初始化。默认使用最小夹具；真实内容来源通过 `LT_SOURCE` 显式联调。CI 重新执行检查并校验提交范围，不自动格式化或修改源码。

新增规则时先验证它能拒绝一个真实坏例子，再确认现有有效代码通过。对文件写入、失败处理、命名约束和 Hook 暂存保护优先验证行为；不为了规则数量增加价值不明的限制。

## 提交消息与提交范围

采用 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)：

```text
type(scope)!: 中文具体描述

可选正文：解释修改原因、用户可观察行为或关键权衡。

可选页脚：关联 Issue 或说明不兼容变化。
```

`scope` 和 `!` 可选；type 使用小写英文，标题总长度不超过 100 个字符，描述不能为空且不写空泛的“更新”“修改”。正文默认中文。scope 优先使用可理解的范围，例如 `cli`、`registry`、`install`、`tooling`，不强制枚举每个可能的目录。

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
fix(install): 保留依赖安装失败的具体诊断
perf(registry): 减少重复的索引解析
chore(tooling): 增加文件命名与提交消息检查
feat(cli)!: 非交互写入必须指定目标目录

BREAKING CHANGE: 自动化脚本须补充 --cwd 参数。
```

不兼容变更在标题使用 `!` 或提供 `BREAKING CHANGE:` 页脚，并明确受影响场景与迁移方式。本仓库通过 semantic-release 将提交语义用于自动版本管理：main 的 push 通过检查后按需发布，规则和首次启用步骤见 [发布说明](releasing.md)。提交规范本身不授予 Agent 提交、推送或发布权限；推送 main 前应明确其可能触发公开发布。

一次提交应表达一个可解释的意图，包含必要测试和同步文档；不要把无关重命名、依赖升级或格式化混进功能提交。不强制每次提交都关联 Issue，有实际关联时使用页脚说明。commitlint 只能验证格式，提交范围和描述的真实性仍由开发者与评审负责。
