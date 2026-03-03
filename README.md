# Token Router

Token Router 是面向 Claude API 代理与额度运营的后台系统，包含：
- `packages/server`：NestJS 后端（鉴权、代理、计费、管理接口）
- `packages/web`：React 管理后台（MVP）

## 快速开始（Docker Compose）

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 填写 `.env` 中至少一个可用上游（推荐 `ANTHROPIC_API_KEY`）。

3. 启动：

```bash
docker compose up --build -d
```

4. 访问：
- 管理后台：`http://localhost:8080`
- 后端健康检查：`http://localhost:3000/health`

## 本地开发

```bash
pnpm install
pnpm dev:server
pnpm dev:web
```

## 构建与测试

```bash
pnpm build
pnpm test
pnpm test:e2e:server
```

## 管理后台 MVP 功能

- 登录
- 用户管理（列表、详情、启停、权限调整、余额调整）
- 兑换码管理（生成、分页、已用/未用筛选）
- 用量日志查看
- 平台统计

## 部署与发布文档

- 部署指南：`docs/deployment.md`
- 上线检查清单：`docs/release-checklist.md`
