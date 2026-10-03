# Agent Base

面向开发者和编码 Agent 的可复用工程基建。对外通过 @luigi/tools 提供唯一资产入口，既支持终端交互选择，也支持完整命令和 JSON 输出。

架构基线见 [架构文档](docs/architecture.md)，协议和命令见 [CLI 文档](docs/cli.md)，代码与提交约定见 [编码规范](docs/coding-standards.md)。资产包含 TypeScript CLI、4 个 Skills、3 个 UI 组件、GitHub Projects 和代码质量预设，以及一个 React 业务模板。

## 本地开发

要求 Node.js 22.13+，仓库固定 pnpm 版本。已配置 pnpm 时直接使用 pnpm；安装了 Corepack 时也可使用 corepack pnpm。

```bash
corepack pnpm install
corepack pnpm build
node packages/cli/dist/index.js
```

完整命令示例：

```bash
node packages/cli/dist/index.js list
node packages/cli/dist/index.js init business-web --cwd ../my-app --agent codex
node packages/cli/dist/index.js add skill github-projects --agent codex --cwd ../my-app
node packages/cli/dist/index.js add ui button --cwd ../my-app
node packages/cli/dist/index.js add preset github-projects --cwd ../my-app
node packages/cli/dist/index.js add preset code-quality --cwd ../my-app
node packages/cli/dist/index.js doctor --cwd ../my-app
```

init 的新目录父目录必须存在。生成项目后，在该项目内执行 npm install、npm run tooling:setup、npm run dev；模板自带质量工具依赖和脚本，CLI 安装资产时不会执行它们。Git Hook 需要项目已经初始化 Git；稍后初始化 Git 时再次运行 npm run tooling:setup。模板没有服务端或登录，任务数据保存在当前浏览器，供后续接入业务 API。

## 发布后的使用方式

```bash
npx @luigi/tools
npx @luigi/tools init business-web --cwd ./my-app --agent codex
npm install -g @luigi/tools
lt list
```

以上示例需要先完成 npm 发布。当前可打包后在任意空目录 npm install 本地 tgz，验证和未来公共安装相同的包结构；不需要访问源仓库。

## 检查和分发

```bash
corepack pnpm check
corepack pnpm smoke
```

smoke 会构建、打包、在临时目录通过 npm 安装 CLI，再初始化模板并安装依赖、测试和构建。它需要联网下载 npm 依赖，不执行发布。

编码基线使用 ESLint 10 flat config、typescript-eslint、React Hooks 规则和 Prettier；eslint-config-prettier 关闭格式冲突。组件文件为 PascalCase，职责拆分后的组件放在 lowerCamelCase 同名目录，通过 index.tsx 暴露入口；工具与 Hook 的 .ts 文件为 kebab-case。完整规则和例外见 [编码规范](docs/coding-standards.md)。

Husky 在提交前格式化暂存文件，再执行全量 lint、格式检查和类型检查；commit-msg 使用 commitlint 校验 Conventional Commits，允许中文描述。CI 独立检查，不能只依赖本地 Hook。React 性能问题通过状态边界审查和 Profiler 验证，不用普遍增加 memo 代替分析。

CLI 运行时依赖仅用于参数、交互与数据验证；源码分发目录由 TypeScript 构建脚本生成，不手工编辑 packages/cli/registry。

## 扩展资产

- 新 Skill：在 skills/名称/SKILL.md 编写流程，按需添加资源，再登记 skills/catalog.json。
- 新 UI 或预设：增加源文件并登记 registry/catalog.json；目标路径、依赖和资产组合需明确。
- 新模板：在 templates 下增加完整项目骨架，通过 requires 引用已有 UI 和预设，避免复制维护。
- 运行构建、必要测试，并在仓库外通过 CLI 验证。各资产的 npm 依赖保留真实包名；不发明运行时服务或占位凭据。

已有项目可用 `lt add preset code-quality` 安装规范文件，再执行 `npx tsx tooling/setup-project.ts` 安全补齐缺失脚本和开发依赖声明，安装依赖后执行 `npm run tooling:setup`。配置冲突显性报告，不覆盖已有约定；操作步骤见 [CLI 文档](docs/cli.md)。

当前不包含 diff/update、全局 Skills 安装、二进制资产分发、私有源认证或远程 GitHub 操作。这些边界与未来 Web Registry/MCP、移动端方向均记录在架构文档。
