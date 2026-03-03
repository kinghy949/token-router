# Token Router Web

## 本地开发

```bash
pnpm -C packages/web dev
```

默认读取：

- `VITE_API_BASE_URL`（未设置时默认 `/api`）

如果后端本地运行在 `3000` 端口，可设置：

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## 构建

```bash
pnpm -C packages/web build
```
