# CLI 自动发布

使用 GitHub Actions + semantic-release 发布到 npmjs，包名为 `@luigix/tools`。适合个人直接 push main，不要求发布 PR、人工修改版本或手动打 tag。UI、Skills、Starters 的资产版本仍由各内容仓库独立管理。

## 触发与验证

`.github/workflows/ci.yml` 对 push 和 PR 执行提交消息检查、`pnpm check`、`pnpm smoke`。只有 `shaojie-li/luigi-tools` 的 main 分支 push 在这些检查成功后，才运行 release job：

1. 检出同一次触发的提交和完整 Git 历史，安装锁定依赖、构建 CLI。
2. 从最近的 `v*` 发布标签开始分析提交，决定是否需要发布及下一个版本。
3. 在 CI 中更新 `package.json` 的版本，创建版本 tag。
4. 运行包的 prepack 校验，发布公开 npm 包，然后创建带自动发布说明的 GitHub Release。

发布任务串行运行，不中途取消正在执行的发布；快速连续 push 可能合并尚未开始的发布任务，后续运行会分析上次发布以来的全部提交。检查与发布绑定同一次触发的提交，不能拿其他提交的检查结果放行。发布 job 使用 Node.js 24，普通检查使用 Node.js 22。

PR 和 fork 不运行 release job。普通检查仅有 `contents: read`；发布任务单独获得 `contents: write` 和 `id-token: write`。不使用 `pull_request_target`，不自动评论 Issue/PR，不向 main 推送版本更新提交。

## 自动版本规则

`.releaserc.json` 为提交分析和发布说明统一使用 `conventionalcommits` preset：

| 提交                                            | 版本变化       |
| ----------------------------------------------- | -------------- |
| `fix: 修复问题`、`perf: 性能优化`               | patch          |
| `feat: 新增能力`                                | minor          |
| 标题带 `!`，或正文有 `BREAKING CHANGE:` 页脚    | major          |
| 普通 `docs:`、`test:`、`chore:`、`refactor:` 等 | 不单独触发发布 |

多个提交采用最高升级级别。不要把实际面向用户的修复写成 `chore:`，否则可能不会发布。`0.x` 同样遵循这些规则，不兼容变更会提升到 `1.0.0`。

接入时 npm 最新版本和已有 Git tag 分别为 `0.1.0`、`v0.1.0`。该 tag 之后已有 `feat(cli)!: 拆分资产仓库并支持按需远程安装`，所以下一次发布预期为 `1.0.0`，无需重打初始 tag。

版本以 npm 和 Git tag 为准。semantic-release 只更新 CI 工作区内待发布包的版本，不回写源码仓库的 `package.json`，不生成需要回提交的 CHANGELOG。源代码中的开发版本可能保持 `0.1.0`；安装后的 `lt --version` 读取发布包的真实版本。仓库只有根目录这一个 package，开发与发布共用同一份元信息。

## 首次启用

npm 上已有该包，不需要重新进行首包发布。在 npm 登录拥有 `@luigix/tools` 管理权限的账号，进入包 Settings → Trusted Publisher，选择 GitHub Actions，填写：

| 字段                 | 值                                         |
| -------------------- | ------------------------------------------ |
| Organization or user | `shaojie-li`                               |
| Repository           | `luigi-tools`                              |
| Workflow filename    | `ci.yml`                                   |
| Environment name     | 留空，当前 job 没有使用 GitHub Environment |

在 Allowed actions 中允许直接 `npm publish`；仅允许 `npm stage publish` 无法满足本工作流的自动发布。此绑定使用完整工作流文件名，不填写路径或 job 名 `release`。当前 npm 文档要求新增绑定后在 2 天内完成首次成功发布，因此应在准备推送配置时设置。不要添加 `NPM_TOKEN`、`NODE_AUTH_TOKEN` 或手写包含 token 的 `.npmrc`；发布使用 GitHub 提供的短期 OIDC 身份，公开仓库自动生成 npm provenance。发布 job 不使用依赖缓存。

完成绑定并经维护者授权推送 main 后，查看 Actions 的 Checks → release，以及 npm 版本和 GitHub Releases。只提交本地配置不会启用远程发布；未绑定 OIDC 时，发布任务会显性失败，不会自动改用本机凭据。

开发环境使用 Node.js `^22.14.0 || >=24.10.0`，推荐 24 LTS；CLI 用户仍只需满足包内 Node.js 22.13+ 的运行要求。semantic-release 的 npm 插件携带支持 OIDC 的 npm CLI，无需修改用户全局 npm 安装。

## 验证与失败处理

提交前运行 `pnpm check`、`pnpm smoke`。版本回归测试在临时 Git 仓库中使用真实 semantic-release dry-run，覆盖 patch、minor、两种 major 写法、无发布变更；不会访问 npm 或 GitHub，也不会创建发布 tag。smoke 校验已安装命令的版本与打包元数据一致，不再硬编码版本号。

检查失败时先修复检查；认证失败时核对 npm 绑定的 owner、仓库、workflow 文件名。修复外部配置后可在 GitHub Actions 重跑失败任务，不需要为重试手动增加版本号。

npm、Git tag 和 GitHub Release 不是一个原子事务。若发布中途失败，先核对三者状态，再决定重试或补齐 Release；不要删除已有发布 tag 或强行覆盖 npm 版本。已公开的版本出现代码问题时，用新的 `fix:` 提交发布修复。

参考：[semantic-release GitHub Actions](https://semantic-release.org/recipes/ci-configurations/github-actions/)、[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)。
