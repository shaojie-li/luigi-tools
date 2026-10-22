# 仓库拆分与维护

拆仓已完成：CLI 和内容分别由 luigi-tools、luigi-ui、luigi-skills、luigi-starters 四个独立仓库维护。CLI 仓库已扁平化为单包项目，并发布 `@luigix/tools@1.0.0`。本机将关联仓库集中放在 `~/codingSpace/luigi-infra/`，该父目录只是组织目录，不是 pnpm workspace：

```text
luigi-infra/
├── luigi-tools/     CLI，根目录 src 和 package.json
├── luigi-ui/        UI 组件
├── luigi-skills/    Skills 与附属资源
└── luigi-starters/  模板和工程预设
```

目录位置不影响远程安装，各仓库仍可独立克隆。历史迁移对应关系：

| 原位置                                     | 新位置                                      |
| ------------------------------------------ | ------------------------------------------- |
| registry/ui                                | luigi-ui/components                         |
| skills                                     | luigi-skills/skills                         |
| tests/profile-web-interaction              | luigi-skills/tests/profile-web-interaction  |
| registry/presets                           | luigi-starters/presets                      |
| skills/github-projects/assets 中的项目预设 | luigi-starters/presets/github-projects      |
| templates                                  | luigi-starters/templates                    |
| scripts/preset-setup.test.ts               | luigi-starters/scripts/preset-setup.test.ts |

github-projects Skill 将所需说明保留为 references，并通过 CLI 引用独立预设，不依赖另一个仓库的相对路径。code-quality 预设携带完整编码规范；CLI 本身只保留适用于 Node.js CLI 的本地工程工具和规范。

## 内容仓库工作流

1. 修改源码和 catalog.json 中对应资产的版本。模板的 requires 声明完整资产 key 和精确版本。
2. 运行 `pnpm build`，生成 registry/index.json 和 registry/items 下的摘要命名快照。历史版本保留，不改写已存在的版本。
3. 运行 `pnpm check`。检查模式只读，确认源码与分发文件一致。
4. 跨仓变化使用本地组合来源运行 CLI 的 `pnpm smoke`，验证模板依赖的版本存在且能实际构建。
5. 经授权后提交、推送源码、锁文件和分发文件。源代码移动不会自动发布 npm 包；CLI 协议改变需单独发布 CLI。

三个仓库各自带有小型构建脚本，直接生成相同 JSON 协议，不依赖 CLI 私有模块，也不新增共享发布包。协议规则见 [CLI 文档](cli.md)。

## 本地组合来源

```json
{
  "schemaVersion": 2,
  "sources": [
    { "url": "../luigi-skills/registry/index.json" },
    { "url": "../luigi-ui/registry/index.json" },
    { "url": "../luigi-starters/registry/index.json" }
  ]
}
```

路径相对配置文件解析。保存为被 Git 忽略的 sources.local.json，然后执行：

```bash
LT_SOURCE="$PWD/sources.local.json" pnpm dev -- list
LT_SOURCE="$PWD/sources.local.json" pnpm smoke
```

所有仓库可单独安装依赖和检查。CLI 默认来源指向各仓库的 main/registry/index.json，公开索引和快照已推送并通过真实安装验证。尚未推送的新资产使用本地来源联调；完成本地验证后仍需验证公开端点。

## 发布后的版本选择

普通 add 安装最高稳定版本；模板继续使用自己声明的旧版本，直至显式升级模板。源码安装后归业务项目维护，版本变化仍触发冲突，不自动覆盖定制。

长期复现可将组合来源中的 URL 固定到 Git commit，并配合每个子索引的 sha256。复用命令中的 `--source-sha256` 能检测主分支变化，但不会自动找回已经变化的旧索引。
