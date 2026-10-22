# CLI 仓库约定

- 默认中文沟通、文档和提交说明。编码或评审前阅读 [编码规范](docs/coding-standards.md) 中适用于 CLI 的 TypeScript、命名、错误处理、质量检查和提交规则；架构边界以 [架构文档](docs/architecture.md) 为准。
- 本仓库只维护 `@luigix/tools`，命令为 `lt`。这是单包 TypeScript strict / ESM 项目，源码在根目录 `src/`，测试在 `test/`，工程脚本在 `scripts/`；不恢复 `packages/cli` 或引入 workspace 子包。
- UI、Skills、模板和可分发预设分别归 `luigi-ui`、`luigi-skills`、`luigi-starters` 维护。可分发资产源码不搬回 CLI；`.agents/skills` 可保存供本项目开发使用的已安装 Skill 快照，源文件仍在 luigi-skills 维护，不作为 CLI 分发资产。不通过同级目录导入其他仓库的私有源码；`test/fixtures/registry-v1.json` 只用于旧协议回归。
- CLI 交互层只收集输入，交互与完整命令调用同一套安装、检查逻辑。非交互写入必须显式提供 `--cwd`；参数不完整时显性失败，不弹菜单或猜测目标目录。
- 来源协议和参数行为以 [CLI 文档](docs/cli.md) 为准。按需下载选中资产及其精确版本依赖，校验身份、摘要和路径后再写入；失败不能返回伪造成功结果。
- 保持已有文件保护、整批冲突检查、项目锁和失败回滚，不增加隐式覆盖或强制升级。不创建或读取持久安装记录；Skill 按实际 SKILL.md 的 name 识别，同名已存在就跳过。UI/预设按实际文件内容比较；仅使用安装期间的临时锁。保留 v1 来源兼容能力。
- 使用锁定的 pnpm，锁文件纳入版本控制。交付前运行 `pnpm check`；涉及分发内容、命令入口、安装或模板初始化时，再运行 `pnpm smoke`。对文件写入、回滚和 CLI 可观察行为补充必要回归测试。
- 新增或改变用户可观察行为时同步相关文档。验证记录区分本地测试、公开来源安装和实际 npm 发布，不将构建或打包成功表述为发布成功。
- main 的 push 可能触发 semantic-release 自动发布，规则见 [发布说明](docs/releasing.md)。源码 package.json 对齐已发布版本，后续由 CI 自动回写，不手动计算或提升版本，也不为了重试随意新增版本或删除标签；发布失败先核对 npm、Git tag 和 GitHub Release 的实际状态。
- 后续提交并发布通过 `release-with-codex` Skill 执行，由 Codex CLI 的 `gpt-6-luna` 审查 diff 与提交语义，再复用现有 CI 发布。未安装时先定位 luigi-skills 中该 Skill 或通过 CLI 安装，不静默跳过审查；只要求检查时不提交或推送。
- 日常提交尊重用户指定的暂存边界；明确调用 release-with-codex 发布时，默认审查、暂存并提交当前仓库的全部未忽略改动，文档和测试一并纳入，允许拆分本地提交，但工作区干净后才统一 push 一次。提交 Hook 只格式化暂存文件，全量 lint、格式和类型检查保持只读。提交消息遵循 Conventional Commits，默认中文说明。不擅自提交、推送、发布、部署或修改全局 Agent 配置；已有明确授权按其范围执行。
