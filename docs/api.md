# API 示例文档

本文档提供核心接口的请求/响应示例，详细字段定义仍以 `docs/design.md` 为准。

## 管理员登录

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "change-me-please"
}
```

```json
{
  "access_token": "eyJ..."
}
```

## 用户列表

```http
GET /admin/users?page=1&pageSize=10&q=alice
Authorization: Bearer <admin-jwt>
```

```json
{
  "page": 1,
  "pageSize": 10,
  "total": 1,
  "items": [
    {
      "id": "u1",
      "email": "alice@example.com",
      "isAdmin": false,
      "isActive": true,
      "balance": 1200,
      "usageSummary": {
        "requestCount": 3,
        "inputTokens": 520,
        "outputTokens": 210,
        "totalCost": 9,
        "lastUsedAt": "2026-02-27T12:00:00.000Z"
      }
    }
  ]
}
```

## 调整用户余额

```http
PATCH /admin/users/u1/balance
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "amount": 500,
  "description": "人工补偿"
}
```

```json
{
  "userId": "u1",
  "amount": 500,
  "balance": 1700,
  "transactionId": "tx1",
  "description": "人工补偿"
}
```

## 生成兑换码

```http
POST /admin/redeem-codes
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{
  "tokenAmount": 1000,
  "count": 2
}
```

## 代理调用（Messages）

```http
POST /v1/messages
x-api-key: sk-tr-xxxxx
anthropic-version: 2023-06-01
Content-Type: application/json

{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [{"role":"user","content":"hello"}],
  "max_tokens": 256
}
```

## 统一错误格式（代理端点）

```json
{
  "error": {
    "type": "rate_limit_error",
    "message": "请求过于频繁，请稍后再试"
  }
}
```
