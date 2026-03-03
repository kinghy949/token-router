# 部署指南

## 1. 前置条件

- Docker 24+
- Docker Compose v2
- 可访问至少一个上游（Anthropic/Bedrock/Vertex）

## 2. 环境变量

在仓库根目录：

```bash
cp .env.example .env
```

关键变量：

- `ANTHROPIC_API_KEY`：建议至少填写一个有效上游 key
- `JWT_SECRET`：生产环境必须更换
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：首次启动时创建管理员账号
- `WEB_URL`：CORS 白名单（默认 `http://localhost:8080`）

## 3. 启动

```bash
docker compose up --build -d
```

服务说明：

- `db`：MySQL，带健康检查
- `redis`：限流缓存
- `server`：启动时自动执行 `prisma migrate deploy` 与 `prisma seed`
- `web`：管理后台（Nginx，`/api` 反向代理到 `server`）

## 4. 验证

```bash
curl http://localhost:3000/health
```

预期返回：

```json
{"ok":true}
```

打开 `http://localhost:8080`，使用 `.env` 中管理员账号登录。

## 5. 数据库迁移

镜像启动命令已包含：

```bash
pnpm -C packages/server prisma:migrate
```

如果需要手动执行：

```bash
docker compose exec server pnpm -C packages/server prisma:migrate
```

## 6. 回滚建议

1. 回滚应用镜像到上一版本。
2. 如涉及破坏性迁移，先恢复数据库备份，再回滚应用。
3. 回滚后执行健康检查与关键业务链路检查（注册->兑换->调用）。
