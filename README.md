# Luigi Tools

统一 CLI：按需安装 Skills、UI、工程预设，或组合它们初始化项目。npm 包为 `@luigix/tools`，命令为 `lt`，要求 Node.js 22.13+。

本仓库只维护 CLI。内容源码分别位于：

| 仓库                                                           | 职责                                   |
| -------------------------------------------------------------- | -------------------------------------- |
| [luigi-ui](https://github.com/shaojie-li/luigi-ui)             | UI 组件及类型验证                      |
| [luigi-skills](https://github.com/shaojie-li/luigi-skills)     | Skills、附属资源、脚本及测试           |
| [luigi-starters](https://github.com/shaojie-li/luigi-starters) | 项目模板、工程预设及固定版本的组合依赖 |

```bash
npx @luigix/tools
npx @luigix/tools list
npx @luigix/tools add skill profile-web-interaction --agent codex --cwd .
npx @luigix/tools add ui button --cwd .
npx @luigix/tools add preset code-quality --cwd .
npx @luigix/tools init business-web --agent codex --cwd ./my-app --package-manager pnpm
npx @luigix/tools doctor --cwd .
```

三个内容仓库及公开索引已推送。以上命令描述本次改造后的 CLI 行为，仍需发布新版 npm 包后供公共用户使用；Git 推送不会自动改变已发布 npm 版本。

CLI 先读取轻量索引，再下载选中资产及其依赖。每个资产独立版本，模板固定依赖版本；修改 Skill 不需要重新发布 CLI。第一次安装需要网络，也可使用本地来源。`doctor` 只检查本地安装记录，离线可用。

支持 `--dry-run`、`--json`、`--non-interactive`、`--source` 和 `--source-sha256`。Skills 安装到项目的 `.agents/skills` 或 `.claude/skills`；项目资产安装到声明的相对路径。不覆盖已有文件，版本或本地内容有差异时停止；安装前校验完整计划，写入失败回滚。复制的源码由项目维护，升级不自动覆盖。

交互终端可补齐目录、Agent、资产与依赖安装选项；非交互写入必须指定 `--cwd`，不会猜测目录或等待输入。`init` 可以选择 npm、pnpm 或暂不安装依赖；失败保留生成项目并报告重试方法。独立 `add` 不执行包管理器。

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm smoke
pnpm dev -- list --source /path/to/registry/index.json
```

`--source` 支持 v1 完整快照、v2 单仓索引或 v2 多来源配置。本地联调可设置 `LT_SOURCE`，显式 `--source` 优先。`sources.local.json` 是本机联调文件，不提交、不打包。

```bash
LT_SOURCE="$PWD/sources.local.json" pnpm dev -- list
LT_SOURCE="$PWD/sources.local.json" pnpm smoke
```

单独检出 CLI 就能执行检查，测试不依赖同级内容仓库。`packages/cli/test/fixtures/registry-v1.json` 是冻结的旧协议回归输入，不是资产源码，也不会进入 npm 包。默认 smoke 使用该历史快照；指定 `LT_SOURCE` 后验证真实内容仓库的组合安装、npm/pnpm 依赖安装和模板完整检查。

文档：[架构](docs/architecture.md) · [CLI 与来源协议](docs/cli.md) · [拆仓说明](docs/repository-split.md) · [编码规范](docs/coding-standards.md)。

MIT License。CLI 包保留许可证，不额外往项目或 Skill 注入许可文件；来源自带的许可文件按原样分发。
