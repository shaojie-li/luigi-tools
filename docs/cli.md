# CLI 命令与目录协议

公共包名为 @luigi/tools，bin 命令为 lt。npm 发布后可直接 npx @luigi/tools 使用；本地开发可用 node packages/cli/dist/index.js 替代 lt。

## 命令

| 命令                                           | 行为                                           |
| ---------------------------------------------- | ---------------------------------------------- |
| lt                                             | 选择初始化、添加、查看或检查                   |
| lt init business-web --agent codex --cwd ./app | 安装完整业务模板、组件、管理预设和 Skills      |
| lt add skill web-ui forms --agent codex        | 安装指定 Skills                                |
| lt add ui button form-field                    | 安装组件源码，先检查 package.json 中的依赖声明 |
| lt add preset github-projects                  | 安装 Issue/PR 模板与管理规范                   |
| lt add preset code-quality                     | 安装代码质量配置、Git Hook 与规范文档          |
| lt list                                        | 列出所有资产和已有安装记录                     |
| lt doctor                                      | 离线检查文件和安装记录                         |

省略 type、资产名称或无法唯一检测的 Agent 时，终端进入选择菜单。列表型资产支持搜索和多选；模板单选。完整命令不重复确认。

--cwd 默认当前工作目录。init 可以创建一个新目录，父目录必须存在；其他命令要求目录存在。不自动寻找 Git 根目录。模板可写入没有文件冲突的目录，任何冲突整批拒绝；推荐空目录或新目录。

--dry-run 适用于 init/add，检查完整计划但不创建文件或目录。--non-interactive 和 --json 禁止菜单；非 TTY 或 CI 环境也禁止菜单。doctor 不接受 --agent 或来源参数，检查全部本地记录。

--json 对执行成功和执行错误均输出一个 JSON 对象到 stdout，诊断不会混入 stdout；--help 和 --version 保持标准文本输出。退出码 0 表示成功，1 表示操作失败或 doctor 发现差异，2 表示参数或数据错误，130 表示用户取消。

## 内容与所有权

Skills 安装到 Agent 专属目录；UI、模板和预设安装到项目相对路径。模板依赖 UI/预设资产，通过同一个事务提交，同时安装内置 Skills。所有权记录在 .agent-base/manifest.json；不同资产不得覆盖现有文件。

doctor 对 Skill 检查缺失、修改和额外文件，对项目资产只检查受管理文件；不会把业务项目后续新增文件都判成异常。本地修改是可预期的定制，doctor 返回差异供审查，不自动修复。

安装到两个不同 Agent 时会分别复制 Skills，彼此独立。不创建符号链接、不修改全局配置、不执行资产里的脚本。npm 依赖安装由使用者用选定的包管理器执行。

## 代码质量预设

`business-web` 模板组合 `code-quality` 预设，并自带相应开发依赖和 npm 脚本。初始化后进入项目执行：

```bash
npm install
npm run tooling:setup
npm run check
```

既有项目按需独立接入：

```bash
lt add preset code-quality
npx tsx tooling/setup-project.ts
npm install
npm run tooling:setup
```

独立预设适用于 TypeScript ESM 项目。已有 tsconfig 需要覆盖源码、根目录的 `*.config.ts` 和 `tooling/**/*.ts`，项目采用多个 tsconfig 时按其实际边界调整 ESLint 的 typedFiles；预设不会猜测并改写已有 TypeScript 项目结构。

独立安装只写入预设文件。`setup-project.ts` 由使用者显式执行，用于安全补齐 package.json 的缺失脚本和开发依赖声明；已有不兼容配置应报告冲突，不自动改写。安装依赖后通过 `tooling:setup` 准备本项目 Git Hook。Hook 需要 Git 仓库；如果初始化项目时还没有 Git，在之后建立仓库时重新执行设置命令。CLI 不代替使用者初始化 Git、提交或发布。

预设使用 ESLint 10、typescript-eslint、React Hooks、Prettier、Husky、lint-staged 和 commitlint。文件、React 状态与性能、提交规范见安装后的 `docs/coding-standards.md`。预设写入受管理文件后，使用者可以审查并定制；doctor 会报告偏离安装快照的内容，不代表定制本身有错。

## 来源协议

--source 接受本地文件路径或 HTTPS URL。远程请求超时 15 秒，不跟随重定向，目录最大 2 MB；单个文本文件最大 256000 个字符。--source-sha256 指定目录原始字节的 SHA-256；摘要仅用于完整性与版本固定，不代表可信发布者认证。

```json
{
  "schemaVersion": 1,
  "version": "0.1.0",
  "skills": [
    {
      "name": "example",
      "description": "明确的触发场景",
      "files": [
        {
          "path": "SKILL.md",
          "content": "文本内容",
          "sha256": "实际内容的 64 位 SHA-256"
        }
      ]
    }
  ],
  "assets": [
    {
      "type": "ui",
      "name": "button",
      "description": "按钮组件",
      "requires": [],
      "dependencies": { "react": "^19.0.0" },
      "files": [
        {
          "path": "src/components/ui/Button.tsx",
          "content": "源码",
          "sha256": "实际内容的 64 位 SHA-256"
        }
      ]
    }
  ]
}
```

上面是结构示意，摘要占位字符串不能用于安装。真实目录由 pnpm registry:build 生成。资产 type 支持 ui、preset、template，requires 引用 ui/名称 或 preset/名称。循环、缺失依赖、路径冲突、摘要不匹配和保留路径均拒绝。

MVP 的内部 JSON 目录是轻量文本分发格式，不声称兼容 shadcn schema。未来接入 shadcn Registry 时保留同一个 CLI 入口，用内部适配器复用上游安装工具，不再增加一个用户必须学习的安装入口。

## 发布

维护者先运行 pnpm check 与 pnpm smoke。发布前核对 CLI/目录版本、包内文件、npm 身份和 @luigi scope 权限。公共分发配置已准备，命名空间存在不代表当前账号有发布权。只有获得发布授权后才执行 npm publish。

不要把 npm token 写进仓库。未来 CI 发布优先配置 npm trusted publishing；未配置时保留本地人工发布，不生成无凭据的自动发布工作流。
