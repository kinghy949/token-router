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
```

## 环境变量

- `PORT`：服务端口
- `DATABASE_URL`：MySQL 连接串
- `JWT_SECRET`：JWT 签名密钥
- `JWT_EXPIRES_IN`：JWT 过期时间（示例：`7d`）
- `ANTHROPIC_API_KEY`：上游 Anthropic API Key
- `ANTHROPIC_BASE_URL`：上游基地址（默认 `https://api.anthropic.com`）
- `INPUT_TOKEN_PRICE`：input token 每 1K 的扣费额度
- `OUTPUT_TOKEN_PRICE`：output token 每 1K 的扣费额度

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

## 已创建但暂未实现（返回 501）

- `GET /admin/users`

## 说明

- API Key 明文仅在创建时返回一次，数据库仅存储哈希。
- 兑换码格式为 `TR-<16位大写字母数字>`，同一兑换码仅可使用一次。
- 兑换成功后会增加余额，并写入 `transactions` 账本记录（`type=redeem`）。
- `/v1/messages` 当前会在转发前做预扣费（余额不足返回 `402`），完整实结与退款在下一里程碑实现。
- 代理当前仅接入 Anthropic 直通，Bedrock/Vertex 与完整计费联动在下一里程碑实现。
