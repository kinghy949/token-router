# Token Router 后端骨架设计文档

**日期：** 2026-02-26  
**状态：** 已确认（用户确认 4/4 节）

## 1. 首批交付范围与架构

- 目标：交付 `packages/server` 的“可运行 + 基础业务可用”后端，不包含前端。
- 技术：NestJS + Prisma + MySQL（Redis 首批仅保留配置，不作为强依赖）。
- 模块边界：按设计文档创建 `auth`、`billing`、`redeem`、`proxy`、`providers`、`admin`、`common`，首批重点实现 `auth` 与 `billing` 基础能力，其余提供可编译骨架。
- 首批可用 API：
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
  - `POST /api-keys`
  - `GET /api-keys`
  - `GET /balance`
  - `GET /health`
- 安全底线：
  - 密码使用 `bcrypt` 哈希
  - API Key 明文仅创建时返回一次，数据库仅存 `sha256`
  - 用户鉴权使用 JWT
  - API 调用鉴权支持 `x-api-key`，并兼容 `Authorization: Bearer`

## 2. 数据模型与事务边界（首批）

- 首批落地表：
  - `users`
  - `api_keys`
  - `balances`
  - `transactions`
- 下一阶段再落地：
  - `redeem_codes`
  - `usage_logs`
- 关键约束：
  - `users.email` 唯一
  - `api_keys.key_hash` 唯一并建立索引
  - `balances.user_id` 为主键（一用户一余额账户）
  - `transactions` 记录 `balance_after` 便于对账
- 事务边界：
  - 注册流程：`users` + `balances` 同事务创建
  - 余额变更统一通过 `billing` 服务事务入口，确保未来兑换/扣费扩展不改接口层
- API Key 存储策略：
  - 生成格式：`sk-tr-${random}`
  - 存储：`key_hash`、`key_prefix`、`name`、`is_active`、`last_used_at`
  - 返回：仅创建接口返回一次完整密钥

## 3. 接口与鉴权流程（首批）

- 用户鉴权：
  - `POST /auth/register`：创建用户并初始化余额
  - `POST /auth/login`：返回 `access_token`
  - `GET /auth/me`：JWT 校验
- API Key 管理（JWT 保护）：
  - `POST /api-keys`：创建 key，返回一次明文
  - `GET /api-keys`：返回脱敏列表
- 余额查询（JWT 保护）：
  - `GET /balance`：返回 token 余额
- API Key Guard（为代理端点准备）：
  - 读取 `x-api-key`，兼容 `Authorization: Bearer sk-tr-...`
  - 对明文 key 做 `sha256` 后匹配 `api_keys.key_hash`
  - 校验 key 状态与用户状态
  - 将 `userId/apiKeyId` 注入请求上下文
- 错误响应：
  - 与设计文档一致：`{"error":{"type":"authentication_error","message":"Invalid API key"}}`

## 4. 目录与文件清单 + 测试策略

- 首批生成目录：
  - `packages/server/src/app.module.ts`
  - `packages/server/src/main.ts`
  - `packages/server/src/health/*`
  - `packages/server/src/auth/*`
  - `packages/server/src/billing/*`
  - `packages/server/src/proxy/*`（骨架）
  - `packages/server/src/redeem/*`（骨架）
  - `packages/server/src/providers/*`（骨架 + adapter interface）
  - `packages/server/src/admin/*`（骨架）
  - `packages/server/src/common/*`（guards/decorators/filters 基础件）
  - `packages/server/prisma/schema.prisma`
  - `packages/server/.env.example`
  - 根目录：`package.json`、`pnpm-workspace.yaml`（若不存在则创建）
- 测试策略：
  - 单元测试：`auth.service`、API Key 生成/hash 匹配
  - e2e：注册 -> 登录 -> `/auth/me`；创建 Key -> 列表；`/balance` 鉴权访问
- 验证标准：
  - `pnpm -C packages/server test`
  - `pnpm -C packages/server test:e2e`
  - `pnpm -C packages/server prisma validate`
  - `pnpm -C packages/server start:dev` 可启动，`GET /health` 返回 200

## 设计结论

采用“标准 Nest + Prisma 模块化骨架”路径，优先确保架构边界正确与后续可扩展性，首批交付聚焦在认证、API Key 与余额查询最小闭环。
