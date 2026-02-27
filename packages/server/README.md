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

## 首批已实现接口

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /api-keys`
- `GET /api-keys`
- `GET /balance`

## 已创建但暂未实现（返回 501）

- `POST /v1/messages`
- `POST /redeem`
- `GET /admin/users`

## 说明

- API Key 明文仅在创建时返回一次，数据库仅存储哈希。
- 代理、多上游调度、兑换码核销、完整计费在下一里程碑实现。
