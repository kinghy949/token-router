# 仓库指南

## 项目结构与模块组织
当前仓库以设计文档为主。规范架构文档位于 [`docs/design.md`](docs/design.md)。

新增实现代码时，建议按以下结构组织：
- `docs/`：架构说明、API 约定与设计决策。
- `packages/server/`：NestJS 后端（模块、Provider、鉴权、计费）。
- `packages/web/`：React 管理后台。
- 根目录保留全局配置（如 `docker-compose.yml`、工作区 `package.json`）。

模块边界应与设计文档保持一致（例如：`auth`、`proxy`、`billing`、`providers`）。

## 构建、测试与开发命令
当前快照暂无可直接运行的应用；贡献流程可先使用以下命令：
- `rg --files`：快速查看仓库文件清单。
- `Get-Content docs/design.md -Raw`：查看完整架构说明。
- `npx markdownlint-cli2 "**/*.md"`（可选）：提交 PR 前检查 Markdown 规范。

后续补充应用脚手架时，请在根 `package.json` 明确工作区命令，并保持 `packages/server` 与 `packages/web` 命令风格一致。

## 代码风格与命名规范
- Markdown：章节简洁，使用 ATX 标题（`##`），段落简短，列表表达明确。
- 文件命名：文档与配置类文件使用 `kebab-case`。
- TypeScript（规划中）：2 空格缩进；变量/函数使用 `camelCase`；类使用 `PascalCase`；目录按功能模块优先组织。

优先保持文件职责单一，避免将多种职责混在同一模块中。

## 测试指南
当前仓库尚未建立测试套件。现阶段请：
- 确认文档变更与 `docs/design.md` 保持一致。
- 更新 API 行为说明时附上请求/响应示例。

引入代码后，请在模块旁添加单元测试（例如 `*.spec.ts`），并在各 package 的测试目录补充集成测试。

## 提交与合并请求规范
当前工作区不可见 Git 历史，默认采用 Conventional Commits：
- `feat: add anthropic adapter interface`
- `docs: refine billing flow in design`

PR 应包含：
- 变更范围与受影响路径的清晰说明。
- 关联的 issue / task ID。
- UI 变更截图（如适用）。
- 破坏性变更、迁移步骤或新增环境变量说明。

## 安全与配置建议
禁止提交真实 API Key 或 Token。涉及配置时请使用占位符，并在引入配置文件时提供 `.env.example` 模板。

## Agent 专用说明
- 默认使用中文（`zh-CN`）回复；仅在用户明确要求时切换为其他语言。
- 代码注释、异常提示、日志提示、占位文案默认使用中文；如发现已有英文提示，开发时可顺带改为中文。
- Git 提交信息使用中文（可保留 Conventional Commits 前缀，如 `feat: 增加兑换码校验`）。
