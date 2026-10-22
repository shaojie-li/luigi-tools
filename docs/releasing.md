# CLI 自动发布

使用 GitHub Actions + semantic-release 发布到 npmjs，包名为 `@luigix/tools`。适合个人直接 push main，不要求发布 PR、人工修改版本或手动打 tag。UI、Skills、Starters 的资产版本仍由各内容仓库独立管理。

## 触发与验证

`.github/workflows/ci.yml` 对 push 和 PR 执行提交消息检查、`pnpm check`、`pnpm smoke`。只有 `shaojie-li/luigi-tools` 的 main 分支 push 在这些检查成功后，才运行 release job：

1. 检出同一次触发的提交和完整 Git 历史，安装锁定依赖、构建 CLI。
2. 从最近的 `v*` 发布标签开始分析提交，决定是否需要发布及下一个版本。
3. npm 插件更新 `package.json` 的版本，随后 git 插件只提交该文件并推送 main，再创建指向该版本提交的 tag。版本提交使用 `chore(release): 同步版本 <version> [skip ci]`，避免重复触发检查。
4. 运行包的 prepack 校验，发布公开 npm 包，然后创建带自动发布说明的 GitHub Release。

发布任务串行运行，不中途取消正在执行的发布；快速连续 push 可能合并尚未开始的发布任务，后续运行会分析上次发布以来的全部提交。检查与发布绑定同一次触发的提交，不能拿其他提交的检查结果放行。发布 job 使用 Node.js 24，普通检查使用 Node.js 22。

PR 和 fork 不运行 release job。普通检查仅有 `contents: read`；发布任务单独获得 `contents: write` 和 `id-token: write`。不使用 `pull_request_target`，不自动评论 Issue/PR，通过现有发布权限向 main 回写版本提交，不增加长期 token。

## 使用 release-with-codex

明确要求提交并发布时，默认纳入目标仓库全部未忽略改动，包括已暂存、未暂存、部分暂存、未跟踪、删除文件，以及文档和测试。已有暂存边界不作为再次确认的理由；用户明确限定范围时遵循限定。

独立意图可拆成本地提交，分别由 GPT-6 Luna 审查，但所有改动提交完成、Git 工作区干净后才统一普通 push 一次。现有 CI 根据整批提交的最高影响决定一个版本，文档和测试即使不触发版本也必须一起推送，不单独补推。Hook 产生的新内容须审查并提交，不能使用 stash、忽略规则或删除文件掩盖剩余改动。

## 自动版本规则

`.releaserc.json` 为提交分析和发布说明统一使用 `conventionalcommits` preset。当前固定使用与发布说明插件兼容的 9.3.1；升级时必须验证发布说明渲染，不能只验证版本计算。版本规则：

| 提交                                            | 版本变化       |
| ----------------------------------------------- | -------------- |
| `fix: 修复问题`、`perf: 性能优化`               | patch          |
| `feat: 新增能力`                                | minor          |
| 标题带 `!`，或正文有 `BREAKING CHANGE:` 页脚    | major          |
| 普通 `docs:`、`test:`、`chore:`、`refactor:` 等 | 不单独触发发布 |

多个提交采用最高升级级别。不要把实际面向用户的修复写成 `chore:`，否则可能不会发布。`0.x` 同样遵循这些规则，不兼容变更会提升到 `1.0.0`。

2026-10-22 已从 `0.1.0` 自动发布 [1.0.0](https://github.com/shaojie-li/luigi-tools/releases/tag/v1.0.0)，升级原因是拆仓提交声明了不兼容变更。以 `1.0.0` 为基线，后续只有 `fix:` 时发布 `1.0.1`，有 `feat:` 时发布 `1.1.0`，有不兼容变更时发布 `2.0.0`；仅文档等无发布变更的提交不会新增版本。

版本以 npm 和 Git tag 为准，不根据源码版本猜测升级级别。源码 `package.json` 已对齐已发布的 `2.0.0`，后续由 CI 自动回写，开发者不手动计算或提升版本；不生成 CHANGELOG。git 插件位于 npm 插件之后，只提交 `package.json`，不收集其他文件。pnpm 锁文件不记录根包版本，因此无需为版本回写修改锁文件。安装后的 `lt --version` 读取发布包版本。

发布成功后，远程 main 会比触发检查的提交多一个仅更新版本的提交；本地使用 `git pull --ff-only` 同步。版本 tag 指向该版本提交，其父提交是本次检查通过的代码。分支保护或并发 push 阻止回写时显性失败，不强制推送或绕过保护。

## 首次启用

本仓库已完成 npm Trusted Publisher 绑定，并通过 `1.0.0` 的 OIDC 发布验证，日常 push 无需重新绑定或本机 npm 登录。以下配置供核对或重建绑定时使用：在 npm 登录拥有 `@luigix/tools` 管理权限的账号，进入包 Settings → Trusted Publisher，选择 GitHub Actions，填写：

| 字段                 | 值                                         |
| -------------------- | ------------------------------------------ |
| Organization or user | `shaojie-li`                               |
| Repository           | `luigi-tools`                              |
| Workflow filename    | `ci.yml`                                   |
| Environment name     | 留空，当前 job 没有使用 GitHub Environment |

在 Allowed actions 中允许直接 `npm publish`；仅允许 `npm stage publish` 无法满足本工作流的自动发布。此绑定使用完整工作流文件名，不填写路径或 job 名 `release`。当前 npm 文档要求新增绑定后在 2 天内完成首次成功发布，因此应在准备推送配置时设置。不要添加 `NPM_TOKEN`、`NODE_AUTH_TOKEN` 或手写包含 token 的 `.npmrc`；发布使用 GitHub 提供的短期 OIDC 身份，公开仓库自动生成 npm provenance。发布 job 不使用依赖缓存。

完成绑定并经维护者授权推送 main 后，查看 Actions 的 Checks → release，以及 npm 版本和 GitHub Releases。只提交本地配置不会启用远程发布；未绑定 OIDC 时，发布任务会显性失败，不会自动改用本机凭据。

开发环境使用 Node.js `^22.22.2 || >=24.15.0`，推荐 24 LTS；CLI 用户仍只需满足包内 Node.js 22.13+ 的运行要求。semantic-release 的 npm 插件携带支持 OIDC 的 npm CLI，无需修改用户全局 npm 安装。

## 验证与失败处理

提交前运行 `pnpm check`、`pnpm smoke`。版本回归测试在临时 Git 仓库中使用真实 semantic-release dry-run，覆盖 patch、minor、两种 major 写法、无发布变更，以及发布说明生成和不兼容变更提示；另以临时本地远程仓库执行真实 npm/git 插件，验证版本回写、仅提交 package.json、tag 与远程 main 一致，以及文档提交不重复发布；这些测试不会访问 npm 或 GitHub。smoke 校验已安装命令的版本与打包元数据一致，不再硬编码版本号。

检查失败时先修复检查；认证失败时核对 npm 绑定的 owner、仓库、workflow 文件名和直接发布权限，并检查 [npm 服务状态](https://status.npmjs.org/)。OIDC token 交换成功不等于包已发布成功，必须继续确认 npm 上传结果。

版本回写、npm、Git tag 和 GitHub Release 不是一个原子事务。回写成功而后续发布失败时保留版本提交，不能凭源码版本认定 npm 已发布。下表的原工作流重试仅适用于 main 尚未被版本提交推进的情况；已回写时，旧 SHA 可能因落后远程而跳过发布，须基于远程版本提交恢复并重新验证，不回退 main。恢复前核对目标版本、标签对应的提交、Release 和运行中的任务，再按实际状态处理：

| 状态                                                | 恢复方式                                                                                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 尚未创建目标 tag，npm 也没有目标版本                | 修复原因后重跑原工作流的失败任务，无需手动增加版本号。                                                                                                                                                |
| 目标 tag 已创建，npm 没有该版本，且没有对应 Release | 不能直接重跑：semantic-release 可能把该 tag 作为已完成发布。确认该标签仅由本次失败运行生成、没有运行中的发布或后续版本依赖它后，记录原 SHA，以预期 SHA 保护删除远程失败标签，再重跑原提交的失败任务。 |
| npm 已有目标版本，GitHub Release 缺失               | 保留 npm 版本和 tag，核对发布内容及原提交后补齐 GitHub Release，不再次 npm publish。                                                                                                                  |
| npm 和 GitHub Release 均已存在                      | 验证安装结果；已公开的代码问题通过新的 `fix:` 提交发布修复。                                                                                                                                          |

不要删除已成功发布的标签或尝试覆盖 npm 版本。若后续提交或版本已依赖失败标签，不套用撤销标签的步骤，应保留历史并单独制定补发方案。

发布命令成功后，核对 npm 的目标版本及 `latest`、GitHub Release，并在仓库外执行 CLI。例如验证 `1.0.0`：

```bash
npm view @luigix/tools version dist-tags --registry=https://registry.npmjs.org
gh release view v1.0.0 --repo shaojie-li/luigi-tools
npm exec --yes --package=@luigix/tools@1.0.0 -- lt --version
```

公开查询可能短暂返回旧数据；此时等待并重新查询，不重复上传或删除标签。`1.0.0` 已完成上述验证，记录见 [验证记录](history/validation.md#2026-10-22单包结构与自动发布验证)。

参考：[@semantic-release/git](https://github.com/semantic-release/git)、[semantic-release GitHub Actions](https://semantic-release.org/recipes/ci-configurations/github-actions/)、[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)。
