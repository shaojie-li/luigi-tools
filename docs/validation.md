# 验证记录

## 2026-10-23 拆仓遗留清理

- CLI 开发工具移除 React 插件、组件命名规则和浏览器全局变量；规范收敛到 Node.js CLI。
- 旧协议夹具仅保留安装所需文件，默认 smoke 生成 v2 来源并使用本地文件依赖验证 npm/pnpm，不再复制历史 React 模板。
- 保留 v1 兼容、路径与摘要校验、整批冲突、锁、回滚和发布回归。
- 使用锁定的 pnpm 10.34.6 完成 `pnpm check`：77 项测试及 lint、格式、类型和构建全部通过；测试数量减少来自移除 React 专用验证。
- `pnpm smoke` 通过：仓库外安装本地打包产物、生成的 v2 来源、文件一致性、dry-run 零写入、重复安装、doctor，以及 npm/pnpm 的真实依赖安装和 check。本机 smoke 调用的 pnpm 为 8.11.0；模板依赖为本地文件包，不下载业务模板依赖。
- 显式设置 `LT_SOURCE` 为最小 v1 夹具后，npm/pnpm 的同一套 smoke 通过，保留旧协议来源联调能力。
- 真实本地组合来源联调失败：luigi-starters 的 business-web@0.1.0 仍依赖 ui/form-field@0.1.0 和 ui/data-table@0.1.0，但本地 luigi-ui 索引仅有 button@0.1.0。依赖解析在安装前报错；未修改其他仓库或跳过依赖检查。
- 本轮验证不代表公开来源已重新验证或新版 npm 包已发布。

历史迁移、浏览器、性能及发布验证见 [历史记录](history/validation.md)。历史记录描述当时状态，不作为当前 CLI 或内容仓库的验证结论。
