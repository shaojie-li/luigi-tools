# CLI 命令与目录协议

公共包名为 @luigix/tools，bin 命令为 lt。拆仓后的 CLI 已随 1.0.0 发布，可直接 npx @luigix/tools@latest 使用；本地开发可用 node dist/index.js 替代 lt。

## 命令

| 命令                                            | 行为                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| lt                                              | 选择初始化、添加、查看或检查                   |
| lt init business-web --agent codex --cwd ./app  | 安装完整业务模板、组件、管理预设和 Skills      |
| lt add skill web-ui forms --agent codex --cwd . | 安装指定 Skills                                |
| lt add ui button form-field --cwd .             | 安装组件源码，先检查 package.json 中的依赖声明 |
| lt add preset github-projects --cwd .           | 安装 Issue/PR 模板与管理规范                   |
| lt add preset code-quality --cwd .              | 安装代码质量配置、Git Hook 与规范文档          |
| lt list                                         | 列出所有资产和实际 Skill 安装状态              |
| lt doctor                                       | 离线检查 Skill 元数据和安装锁                  |

省略 type、资产名称或无法唯一检测的 Agent 时，终端进入选择菜单。列表型资产支持搜索和多选；模板单选。交互式 add 未指定 --cwd 时直接使用当前目录，不询问目录；init 未指定 --cwd 时选择“新建文件夹”或“在当前文件夹执行”，显示当前目录的完整路径，新建时输入单个文件夹名称。指定 --cwd 后跳过目录选择；init 还可通过 --package-manager 指定依赖安装方式，其他参数齐全时直接执行。

init/add 共用目标目录解析和写入事务；--cwd . 明确使用当前目录，也可指定其他已有目录或父目录已存在的新目录。init 交互中的“新建文件夹”仅接受当前目录下尚不存在的名称，不接受路径；要使用其他位置，通过 --cwd 指定。list/doctor 默认当前目录，且要求目标目录存在。不自动寻找 Git 根目录。模板可写入没有文件冲突的目录，任何冲突整批拒绝；推荐空目录或新目录。

init 的“新建文件夹”用于创建模板项目；add skill 只安装 Skill，不附带项目模板，需要其他安装位置时可显式指定 --cwd。选择和计划校验阶段不创建目录；菜单取消零写入，资产写入失败时回滚本次创建的文件及空目录，清理失败显性报告。依赖安装在资产提交后执行，失败处理见下文。

--dry-run 适用于 init/add，检查完整计划但不创建文件或目录。--non-interactive 和 --json 禁止菜单；非 TTY 或 CI 环境也禁止菜单。这些场景中的 init/add（包括 --dry-run）必须显式提供 --cwd，否则退出码为 2，并给出命令示例。原先依赖默认当前目录的脚本需补充 --cwd .。doctor 不接受 --agent 或来源参数，检查本地 Skill 元数据与临时安装锁。

--json 对执行成功和执行错误均输出一个 JSON 对象到 stdout，诊断不会混入 stdout；--help 和 --version 保持标准文本输出。退出码 0 表示成功，1 表示操作失败或 doctor 发现元数据或锁异常，2 表示参数或数据错误，130 表示用户取消。

## 初始化后的依赖安装

init 在交互模式下提供 pnpm、npm、暂不安装三个选项。选择在文件写入前完成；显式传入 --package-manager npm|pnpm|none 跳过这一步。此参数仅适用于 init，add/list/doctor 使用时退出码为 2。

```bash
lt init business-web --cwd ./my-app --agent codex --package-manager pnpm
lt init business-web --cwd ./my-app --agent codex --package-manager npm --non-interactive
lt init business-web --cwd ./my-app --agent codex --package-manager none
```

- 非交互模式未传 --package-manager 时只生成文件，保持原有行为；要安装依赖需显式指定 npm 或 pnpm。
- 选择 npm/pnpm 后，资产事务成功提交，再在目标目录执行对应的 install 命令，遵循包管理器自身的安装与生命周期脚本行为。CLI 不自动安装包管理器。
- --dry-run 仅展示计划，不启动包管理器、不创建目录。选择“暂不安装”则输出后续手动安装命令。
- 安装日志输出到 stderr；stdout 的 JSON 结果包含 dependencies.packageManager 和 status（installed、skipped 或 planned）。复用命令和后续命令保留所选包管理器。
- 安装失败或包管理器不可用时退出码为 1，错误码为 DEPENDENCY_INSTALL_FAILED。已生成的项目文件及包管理器产生的中间文件保留，错误消息附上包管理器最近的输出（最多 16384 个字符，移除终端控制序列），并给出目录和重试命令；不会只报告退出码，也不会把依赖安装失败伪装成成功或删除整个项目。
- 重复 init 的资产文件仍遵守幂等保护；显式选择 npm/pnpm 会再次执行依赖安装。add 只安装资产，不调用包管理器。

business-web 随模板提供 pnpm-workspace.yaml，显式声明 packages: ["."] 以兼容要求该字段的 pnpm（包括 8.11），并仅显式允许 esbuild 构建脚本。pnpm 10.26+ 使用 [allowBuilds 配置](https://pnpm.io/settings/build#allowbuilds)。包管理器按自身规则生成锁文件或更新配置；CLI 不保存模板安装基线，doctor 不校验这些配置相对模板的变化。

## 安装状态与文件保护

Codex Skills 安装到目标目录的 `.agents/skills/<name>/SKILL.md`（`.agents` 为复数），Claude Code 使用 `.claude/skills`。在项目根目录运行交互式 add 即安装到该项目根目录，不需要填写 Skill 路径。UI、模板和预设按声明的相对路径安装；模板及其依赖共用写入事务。

CLI 不创建或读取 `.agent-base`，也不在其他位置保存替代的 manifest、资产版本或文件基线。旧项目遗留的 `.agent-base` 已不再使用，可删除；CLI 不自动清理用户项目中的旧文件。

`lt list` 和 Skill 菜单通过实际 `SKILL.md` 的 YAML name 识别安装状态，目录名不同也能识别。JSON 中 `skills[].installed` 只包含 `agent`、`path`，不推测本地版本。再次添加同名 Skill 时跳过，保留本地内容；目标目录存在但没有有效 Skill 时显性失败。无效元数据或符号链接显性报错。列表只下载索引，无法判断 UI、预设是否安装，其 `installed` 为 null。

UI、模板和预设的目标文件全部存在且内容与当前来源一致时跳过；部分存在或内容不同时整批拒绝，不覆盖、不自动接管或补齐。写入使用临时 `.lt-install.lock` 防止并发安装，正常完成或失败回滚后清理；不生成永久管理目录。崩溃可能留下锁或部分文件，需人工检查，不能直接当作安装成功。

doctor 离线检查本地 Skill 元数据、现存 Skill 目录缺少 SKILL.md 和残留安装锁。不保存历史基线，因此不判断历史版本、整个 Skill 已删除、正文是否修改或附属文件是否缺失，也不检查 UI/模板/预设相对安装时的差异。

安装到两个 Agent 时分别复制 Skills，彼此独立。不创建符号链接、不修改全局配置。资产复制阶段不执行脚本；init 经选择或显式参数启用依赖安装时，由包管理器执行正常安装流程。

## 代码质量预设

`business-web` 模板组合 `code-quality` 预设，并自带相应开发依赖和 npm 脚本。初始化后进入项目执行（已自动安装依赖时跳过 npm install；选择 pnpm 时使用对应的 pnpm 命令）：

```bash
npm install
npm run tooling:setup
npm run check
```

既有项目按需独立接入：

```bash
lt add preset code-quality --cwd .
npx tsx tooling/setup-project.ts
npm install
npm run tooling:setup
```

独立预设适用于 TypeScript ESM 项目。已有 tsconfig 需要覆盖源码、根目录的 `*.config.ts` 和 `tooling/**/*.ts`，项目采用多个 tsconfig 时按其实际边界调整 ESLint 的 typedFiles；预设不会猜测并改写已有 TypeScript 项目结构。

独立安装只写入预设文件。`setup-project.ts` 由使用者显式执行，用于安全补齐 package.json 的缺失脚本和开发依赖声明；已有不兼容配置应报告冲突，不自动改写。安装依赖后通过 `tooling:setup` 准备本项目 Git Hook。Hook 需要 Git 仓库；如果初始化项目时还没有 Git，在之后建立仓库时重新执行设置命令。CLI 不代替使用者初始化 Git、提交或发布。

预设使用 ESLint 10、typescript-eslint、React Hooks、Prettier、Husky、lint-staged 和 commitlint。文件、React 状态与性能、提交规范见安装后的 `docs/coding-standards.md`。预设写入文件后，使用者可以审查并定制；doctor 不保存或检查预设的历史快照。

## 来源协议

来源优先级：`--source`、环境变量 `LT_SOURCE`、包内 `sources.json`。默认配置指向 luigi-skills、luigi-ui、luigi-starters 的公开索引；npm 包不内置资产正文。首次安装需要网络，doctor 不读取来源。

默认安装 Skill 时，每次读取 `luigi-skills` 远程 main 分支的索引，并下载所选 Skill 的最新已构建版本；用户无需指定来源路径、版本或 commit，也无需等待 CLI 发布。内容仓库须将源码与对应分发产物一起提交并通过一致性检查，因此这里的“最新”是 main 中可安装的分发内容。资产版本和摘要只用于下载与安装计划校验，不保存在用户项目中。再次安装同名 Skill 时跳过，不自动覆盖用户修改。显式指定 --source 或 LT_SOURCE 时使用指定来源。

`--source` 接受本地文件路径或 HTTPS URL。远程请求超时 15 秒，不跟随重定向，单个响应最大 2 MB；单个文本文件最大 256000 个字符。单次安装最多 100 个资产，文件正文总量最大 20 MB。仅支持 UTF-8 文本。

Node 请求不自动沿用 macOS 系统代理；需要代理时，在支持环境代理的 Node 版本（如 24.18）下显式执行 `HTTPS_PROXY=http://127.0.0.1:1082 NODE_USE_ENV_PROXY=1 lt`，其中地址替换为实际代理。该命令仅影响本次运行。

### v2 多来源配置

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

每个 source 可附加该索引原始字节的 `sha256`。相对地址按配置文件所在目录解析。最多组合 10 个索引，不支持递归来源配置。远程来源只允许引用 HTTPS，不能转向本地文件。

### v2 单仓索引

```json
{
  "schemaVersion": 2,
  "entries": [
    {
      "type": "template",
      "name": "business-web",
      "description": "业务项目模板",
      "version": "0.1.0",
      "url": "items/实际摘要.json",
      "sha256": "正文实际 SHA-256",
      "requires": [
        { "key": "ui/button", "version": "0.1.0" },
        { "key": "skill/forms", "version": "0.1.0" }
      ]
    }
  ]
}
```

以上摘要仅为示意，不能直接安装。真实索引由各内容仓库的 `pnpm build` 生成。type 支持 skill、ui、preset、template。版本使用三段数字；同一个 type/name 可保留多个历史版本，但同名同版本不能重复。

`list` 与菜单只读取索引，展示每项最高版本。安装按索引下载所选资产和精确版本依赖。模板可以组合 UI、预设和 Skills；Skill 自包含，UI/预设仅能依赖 UI/预设，不允许模板嵌套。版本冲突、缺失或循环依赖显性失败。

正文使用 v1 快照结构，但只含一个资产，`version` 必须与索引一致。Skill 快照包含一个 skills 项；其他快照允许 skills 为空，包含一个 assets 项。正文 `requires` 必须为空，依赖以索引为准；npm 依赖声明仍保存在资产正文 `dependencies` 中。文件包含 path、content、sha256；路径安全和摘要均验证后才写入。

索引保留历史版本，正文以摘要命名，内容变化必须提升资产版本。模板依赖旧版 UI 时，新版 UI 发布不会改变初始化结果。安装时按每个资产核对正文版本、来源和摘要，不持久记录到用户项目。

### 摘要与兼容

`--source-sha256` 对单索引或 v1 快照校验原始字节 SHA-256。对多来源配置，计算配置原始摘要与按声明顺序排列的子索引摘要，以换行连接后再次 SHA-256；任何子索引变化都会使复用命令失败。结果中 sourceSha256 为该摘要；正文摘要在下载时校验，不写入用户项目的安装记录。

摘要用于完整性校验，不证明发布者身份。需要长期复现时使用固定 commit 的索引地址或锁定子索引摘要。默认 main 索引可变化；复用命令检测漂移，不自动恢复旧索引。只安装信任的来源。

继续兼容 `schemaVersion: 1`、version、skills、assets 的完整快照。v1 requires 引用同一快照中的 UI/预设；v1 init 保留安装所有 Skills 的旧行为。旧的本地安装记录不再读取；实际 Skill 通过 name 识别，无需迁移。

## 发布

包名保持 `@luigix/tools`，命令为 `lt`，许可证为 MIT。npm 包直接包含根目录 LICENSE，不再向每个 Skill、UI、预设和模板附加独立许可副本，因此安装不生成 `licenses/luigi-tools/` 或 Skill 下的 LICENSE。此规则只移除构建脚本自动附加的副本；资产来源自带的文件仍按原样分发。

CLI 使用 semantic-release，根据 Conventional Commits 自动计算版本。原仓库 main 的 push 在 `pnpm check`、`pnpm smoke` 通过后触发发布判断；有可发布变更时发布 npm 包并创建 GitHub Release。PR、其他分支和 fork 不执行发布任务。

发布通过 npm Trusted Publishing（OIDC）认证，不保存长期 npm token。本仓库已完成绑定并通过 1.0.0 实际发布验证；配置、版本规则和失败处理见 [发布说明](releasing.md)。
