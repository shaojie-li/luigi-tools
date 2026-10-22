# Luigi CLI

统一入口安装独立仓库中的 Skills、UI、工程预设和项目模板。包名 `@luigix/tools`，命令 `lt`，Node.js 22.13+。

```bash
npx @luigix/tools list
npx @luigix/tools add skill profile-web-interaction --agent codex --cwd .
npx @luigix/tools add ui button --cwd .
npx @luigix/tools add preset code-quality --cwd .
npx @luigix/tools init business-web --agent codex --cwd ./my-app --package-manager pnpm
npx @luigix/tools doctor --cwd .
```

默认读取 luigi-skills、luigi-ui、luigi-starters 的公开索引，正文按所选资产及依赖下载。CLI 不内置资产正文，首次安装需要联网。资产独立版本，模板固定依赖版本；doctor 离线检查本地文件。

支持 `--source` 读取本地或 HTTPS 的 v1 完整快照、v2 单仓索引、多来源配置；`LT_SOURCE` 可设置本地开发默认来源，命令参数优先。`--source-sha256` 锁定来源摘要，多来源配置同时覆盖子索引。

`--dry-run` 不写入；`--json` 输出机器可读结果；非交互写入必须显式指定 `--cwd`。交互终端可选择新建文件夹或当前目录，以及 npm、pnpm 或暂不安装依赖。Skills 写入 `.agents/skills` 或 `.claude/skills`，不修改全局配置。

遇到已有文件、本地修改或版本变化时拒绝覆盖。所有正文验证通过后统一写入，安装记录保存在 `.agent-base/manifest.json`。资产复制不执行脚本；init 明确启用后才执行依赖安装，失败保留项目并报告重试命令。独立 add 不自动安装 npm 依赖。

MIT License。包中保留 LICENSE，CLI 不向项目注入额外许可证副本；来源附带文件仍原样分发。

源码与完整文档：[luigi-tools](https://github.com/shaojie-li/luigi-tools)。
