# Token Router Server

## 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 复制环境变量

```bash
cp .env.example .env
```

> 运行 `pnpm start:dev` / `pnpm start:prod` / `pnpm prisma:seed` 时会自动加载当前目录（`packages/server`）下的 `.env`。

3. 生成 Prisma Client

```bash
pnpm prisma:generate
```

4. 启动开发服务

```bash
pnpm start:dev
```

默认端口：`3000`

## 常用命令

```bash
pnpm build
pnpm test
pnpm test:e2e
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

## 环境变量

- `PORT`：服务端口
- `DATABASE_URL`：MySQL 连接串
- `JWT_SECRET`：JWT 签名密钥
- `JWT_EXPIRES_IN`：JWT 过期时间（示例：`7d`）
- `REDIS_URL`：Redis 连接串（用于限流，异常时自动回退内存）
- `ANTHROPIC_API_KEY`：上游 Anthropic API Key
- `ANTHROPIC_BASE_URL`：上游基地址（默认 `https://api.anthropic.com`）
- `INPUT_TOKEN_PRICE`：input token 每 1K 的扣费额度
- `OUTPUT_TOKEN_PRICE`：output token 每 1K 的扣费额度
- `RATE_LIMIT_PER_MINUTE`：代理接口每 API Key 默认限流（默认 `60`）
- `REDEEM_RATE_LIMIT_PER_MINUTE`：兑换接口每用户默认限流（默认 `5`）
- `REQUEST_BODY_LIMIT`：请求体上限（默认 `10mb`）
- `WEB_URL`：管理台 CORS 白名单（支持逗号分隔多个域名）
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：可选初始管理员种子账号
- `PROVIDER_PRIORITY`：上游优先级（如 `anthropic,bedrock,vertex`）
- `PROXY_MAX_FAILOVER`：单次请求最大故障转移次数

## 首批已实现接口

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /api-keys`
- `GET /api-keys`
- `GET /balance`
- `POST /admin/redeem-codes`（需管理员 JWT）
- `POST /redeem`（用户兑换）
- `POST /v1/messages`（API Key 鉴权，Anthropic 直通，支持 SSE）
- `POST /v1/messages/count_tokens`（API Key 鉴权，Anthropic 直通）
- `GET /admin/users`
- `GET /admin/users/:id`
- `PATCH /admin/users/:id`
- `PATCH /admin/users/:id/balance`
- `GET /admin/stats`
- `GET /admin/redeem-codes`
- `GET /admin/usage-logs`

## 说明

- API Key 明文仅在创建时返回一次，数据库仅存储哈希。
- 兑换码格式为 `TR-<16位大写字母数字>`，同一兑换码仅可使用一次。
- 兑换成功后会增加余额，并写入 `transactions` 账本记录（`type=redeem`）。
- `/v1/messages` 会在转发前做预扣费，并在完成后按实际 usage 结算。
- 代理支持按 `PROVIDER_PRIORITY` 的上游故障转移（当前 Bedrock/Vertex 为非流式适配）。
- 代理端点错误统一输出 Anthropic 风格：`{"error":{"type":"...","message":"..."}}`。
- 管理员关键操作（改权限/改余额）会写入审计日志。
