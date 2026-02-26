# Token Router API 代理平台设计文档

## 项目概述

Token Router 是一个 API 代理平台，支持多上游 Claude 服务商，实现用户注册、Token 额度兑换、API 密钥管理和用量计费功能，让用户通过替换 baseUrl 即可使用 Claude Code CLI。

### 商业模式

1. 卖家（平台运营者）在管理后台生成兑换码（指定 Token 额度）
2. 卖家在闲鱼等平台发布商品，发货时提供 API 地址和兑换码
3. 买家在平台注册账号，使用兑换码兑换 Token 额度
4. 买家创建 API Key，配置 Claude CLI 的 baseUrl 即可使用

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户端                                   │
│  ┌─────────────────┐              ┌─────────────────┐           │
│  │  Claude Code CLI │              │    管理后台      │           │
│  └────────┬────────┘              └────────┬────────┘           │
└───────────┼────────────────────────────────┼────────────────────┘
            │ 替换 baseUrl                    │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Token Router 平台                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  API Gateway │  │  鉴权模块   │  │  计费模块   │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐              │
│  │  代理模块   │  │  兑换码模块  │  │    MySQL    │              │
│  └──────┬──────┘  └─────────────┘  └─────────────┘              │
│         │                                                        │
│  ┌──────┴──────┐                   ┌─────────────┐              │
│  │ 上游适配器  │                   │    Redis    │              │
│  └──────┬──────┘                   └─────────────┘              │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        上游服务商                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Anthropic   │  │ AWS Bedrock │  │ Vertex AI   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 后端框架 | NestJS + TypeScript | 模块化架构，适合复杂业务 |
| 数据库 | MySQL | 事务支持，适合计费场景 |
| 缓存 | Redis | 速率限制、会话缓存 |
| ORM | Prisma | 类型安全，迁移方便 |
| 前端 | React + Vite + TailwindCSS | 轻量管理后台 |
| 部署 | Docker Compose | 初期推荐，易于管理 |

---

## 模块设计

### 1. 用户与认证模块 (auth)

**功能：**
- 用户注册/登录（邮箱+密码）
- JWT Token 签发与验证
- API Key 生成与管理（支持多 Key）
- 修改密码

**API Key 设计：**
- 格式：`sk-tr-{random_32_chars}`
- 存储：仅存储 SHA-256 hash 值，前缀 `sk-tr-` + 前 4 位用于展示
- 支持：创建、列出、删除、启用/禁用
- 创建时完整密钥仅展示一次，之后不可再查看

### 2. 兑换码模块 (redeem)

**功能：**
- 兑换码生成（管理员功能，可批量）
- 兑换码核销（用户功能）
- 兑换码状态追踪（已用/未用/过期）

**兑换码格式：**
- 格式：`TR-{RANDOM_16_CHARS}`
- 示例：`TR-A1B2C3D4E5F6G7H8`

### 3. 计费模块 (billing)

**功能：**
- Token 余额管理
- 按 Token 用量实时扣费
- Input/Output Token 分开计价
- 用量统计与账单记录

**计费策略：**
- 预扣费：请求前根据 `max_tokens` 参数预估扣费（预扣额 = max_tokens × output 单价 + 预估 input 额度）
- 实际结算：响应完成后按实际 `usage.input_tokens` / `usage.output_tokens` 计算，多退少补
- 余额不足：预扣阶段余额不足则拒绝请求，返回 HTTP 402
- 请求失败：上游返回错误时全额退还预扣费用

**并发扣费安全：**
- 余额扣减使用 MySQL `SELECT ... FOR UPDATE` 行锁或乐观锁（`UPDATE balances SET tokens = tokens - ? WHERE user_id = ? AND tokens >= ?`）
- 确保不会出现超额扣费

### 4. 代理模块 (proxy)

**功能：**
- 请求转发至上游
- 多上游负载均衡/故障转移
- **流式响应支持（SSE）** - Claude CLI 必需
- Token 用量统计（从响应中提取 usage）

**请求处理流程：**
1. 验证 API Key
2. 检查余额
3. 预扣费
4. 选择可用上游
5. 转发请求
6. 流式返回响应
7. 统计实际用量
8. 调整扣费（多退少补）

### 5. 上游适配器 (providers)

**支持的上游：**
- **Anthropic 官方 API**：直接转发
- **AWS Bedrock**：需转换请求/响应格式
- **Google Vertex AI**：需转换请求/响应格式

**适配器接口：**
```typescript
interface ProviderAdapter {
  name: string;
  /** 将标准 Claude 请求转为上游格式 */
  transformRequest(req: ClaudeRequest): ProviderRequest;
  /** 将上游响应转为标准 Claude 响应 */
  transformResponse(res: ProviderResponse): ClaudeResponse;
  /** 处理流式响应，返回标准 SSE 事件流 */
  streamResponse(res: ProviderStream): AsyncIterable<ClaudeStreamEvent>;
  /** 检查上游是否可用 */
  healthCheck(): Promise<boolean>;
  /** 支持的模型列表 */
  supportedModels(): string[];
}
```

**上游选择策略：**
- 优先级调度：按配置的优先级顺序选择可用上游
- 故障转移：当前上游不可用时自动切换到下一个
- 健康检查：定期探测上游可用性，标记不可用的上游

---

## 数据模型

### User（用户）
```sql
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,       -- 账号启用/禁用
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### ApiKey（API 密钥）
```sql
CREATE TABLE api_keys (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,      -- 如 'sk-tr-A1B2'，用于展示
  name VARCHAR(100),
  is_active TINYINT(1) DEFAULT 1,
  last_used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

### Balance（余额）
```sql
CREATE TABLE balances (
  user_id CHAR(36) PRIMARY KEY,
  tokens BIGINT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Transaction（交易记录）
```sql
CREATE TABLE transactions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,     -- 'redeem', 'usage', 'refund', 'admin_adjust'
  amount BIGINT NOT NULL,         -- 正数为充入，负数为扣除
  balance_after BIGINT NOT NULL,  -- 交易后余额（便于对账）
  ref_id CHAR(36),                -- 关联 ID（兑换码 / usage_log ID 等）
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
```

### RedeemCode（兑换码）
```sql
CREATE TABLE redeem_codes (
  code VARCHAR(50) PRIMARY KEY,
  token_amount BIGINT NOT NULL,
  created_by CHAR(36),
  redeemed_by CHAR(36),
  redeemed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (redeemed_by) REFERENCES users(id)
);
```

### UsageLog（用量日志）
```sql
CREATE TABLE usage_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  api_key_id CHAR(36),
  model VARCHAR(100) NOT NULL,
  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  total_cost BIGINT NOT NULL DEFAULT 0,    -- 本次请求扣除的额度
  provider VARCHAR(50) NOT NULL,
  upstream_status INT,                      -- 上游响应状态码
  duration_ms INT,                          -- 请求耗时（毫秒）
  error_message TEXT,                       -- 错误信息（失败时记录）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
```

---

## API 端点

### 用户端

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/register | 用户注册 |
| POST | /auth/login | 用户登录 |
| GET | /auth/me | 获取当前用户信息 |
| PUT | /auth/password | 修改密码 |
| POST | /redeem | 兑换码兑换 |
| GET | /balance | 查询余额 |
| POST | /api-keys | 创建 API Key |
| GET | /api-keys | 列出 API Key |
| PATCH | /api-keys/:id | 更新 API Key（启用/禁用/重命名） |
| DELETE | /api-keys/:id | 删除 API Key |
| GET | /usage | 用量统计（支持按日期/模型筛选） |
| GET | /transactions | 交易记录（支持分页） |

### 代理端（Claude CLI 调用）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /v1/messages | Claude Messages API（主要接口） |
| POST | /v1/messages/count_tokens | Token 计数 API |

> Claude Code CLI 主要使用 Messages API（`/v1/messages`）。旧版 Text Completions API（`/v1/complete`）已废弃，暂不支持。

**请求头：**
```
x-api-key: sk-tr-xxxxx
Content-Type: application/json
anthropic-version: 2023-06-01
```

> 注意：Anthropic 官方 SDK/CLI 使用 `x-api-key` 头传递密钥，而非 `Authorization: Bearer`。平台同时兼容两种方式以提高兼容性。

### 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /admin/redeem-codes | 批量生成兑换码 |
| GET | /admin/redeem-codes | 查看所有兑换码（支持分页/筛选） |
| GET | /admin/users | 用户列表（支持分页/搜索） |
| GET | /admin/users/:id | 用户详情（含余额、用量等） |
| PATCH | /admin/users/:id | 更新用户（禁用/启用/设为管理员） |
| PATCH | /admin/users/:id/balance | 调整用户余额 |
| GET | /admin/stats | 平台统计 |
| GET | /admin/usage-logs | 全局用量日志 |

---

## 目录结构

```
token-router/
├── docs/
│   └── design.md              # 本设计文档
├── packages/
│   ├── server/                # NestJS 后端
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   ├── auth/          # 认证模块
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   └── api-key.guard.ts
│   │   │   ├── billing/       # 计费模块
│   │   │   │   ├── billing.module.ts
│   │   │   │   ├── billing.service.ts
│   │   │   │   └── billing.controller.ts
│   │   │   ├── proxy/         # 代理模块
│   │   │   │   ├── proxy.module.ts
│   │   │   │   ├── proxy.controller.ts
│   │   │   │   └── proxy.service.ts
│   │   │   ├── redeem/        # 兑换码模块
│   │   │   │   ├── redeem.module.ts
│   │   │   │   ├── redeem.controller.ts
│   │   │   │   └── redeem.service.ts
│   │   │   ├── providers/     # 上游适配器
│   │   │   │   ├── providers.module.ts
│   │   │   │   ├── anthropic.adapter.ts
│   │   │   │   ├── bedrock.adapter.ts
│   │   │   │   └── vertex.adapter.ts
│   │   │   ├── admin/         # 管理员模块
│   │   │   │   ├── admin.module.ts
│   │   │   │   ├── admin.controller.ts
│   │   │   │   └── admin.service.ts
│   │   │   └── common/        # 公共工具
│   │   │       ├── decorators/
│   │   │       ├── filters/
│   │   │       └── interceptors/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── test/
│   │   └── package.json
│   └── web/                   # React 管理后台
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── Login.tsx
│       │   │   ├── Register.tsx
│       │   │   ├── Dashboard.tsx
│       │   │   ├── ApiKeys.tsx
│       │   │   ├── Redeem.tsx
│       │   │   └── admin/
│       │   │       ├── Users.tsx
│       │   │       ├── RedeemCodes.tsx
│       │   │       └── Stats.tsx
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── services/
│       │   └── styles/
│       ├── index.html
│       └── package.json
├── docker-compose.yml
├── .env.example
├── package.json
└── pnpm-workspace.yaml
```

---

## 部署方案

### Docker Compose（推荐）

```yaml
services:
  server:
    build: ./packages/server
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=mysql://root:password@db:3306/token_router
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_REGION=${AWS_REGION}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  web:
    build: ./packages/web
    ports:
      - "8080:80"
    depends_on:
      - server
    restart: unless-stopped

  db:
    image: mysql:8.0
    volumes:
      - mysql_data:/var/lib/mysql
    environment:
      - MYSQL_DATABASE=token_router
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-password}
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  mysql_data:
  redis_data:
```

### 服务器选择建议

- **国内用户为主**：选择香港/新加坡节点（延迟低）
- **需要稳定访问 Anthropic**：选择美国节点
- **配置要求**：2C4G 云服务器即可起步（约 50-100 元/月）

---

## 环境变量

```env
# 应用配置
PORT=3000
NODE_ENV=production

# 数据库
DATABASE_URL=mysql://root:password@localhost:3306/token_router

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# 管理员初始账号（首次启动时自动创建）
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-on-first-login

# 上游配置（至少配置一个）
ANTHROPIC_API_KEY=sk-ant-xxxxx
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# 计费配置
INPUT_TOKEN_PRICE=1    # 每 1K input tokens 扣除的额度
OUTPUT_TOKEN_PRICE=5   # 每 1K output tokens 扣除的额度

# 限流配置
RATE_LIMIT_PER_MINUTE=60
REDEEM_RATE_LIMIT_PER_MINUTE=5

# 前端地址（CORS 白名单）
WEB_URL=http://localhost:8080
```

---

## 实现步骤

| 序号 | 任务 | 预计时间 |
|------|------|----------|
| 1 | 初始化 monorepo 项目结构，配置 pnpm workspace | 0.5 天 |
| 2 | 设计数据库 Schema，配置 Prisma ORM | 0.5 天 |
| 3 | 实现用户认证模块（注册/登录/JWT/API Key） | 1 天 |
| 4 | 实现兑换码模块（生成/核销/状态管理） | 0.5 天 |
| 5 | 实现计费模块（余额管理/扣费/账单） | 1 天 |
| 6 | 实现代理模块（请求转发/流式响应/Token统计） | 1.5 天 |
| 7 | 实现多上游适配器（Anthropic/Bedrock/Vertex） | 1 天 |
| 8 | 实现 React 管理后台（用户面板+管理面板） | 2 天 |
| 9 | 配置 Docker Compose 部署方案 | 0.5 天 |

**总计：约 8-9 天**

---

## 安全考虑

1. **API Key 安全**：仅存储 SHA-256 hash，不可逆；创建时仅展示一次完整密钥
2. **密码安全**：使用 bcrypt（cost factor ≥ 12）加密存储
3. **请求限流**：Redis 滑动窗口限流，按 API Key 维度限制（如 60 次/分钟）
4. **SQL 注入**：使用 Prisma 参数化查询
5. **HTTPS**：生产环境强制 HTTPS（建议 Nginx/Caddy 反向代理 + Let's Encrypt）
6. **敏感配置**：使用环境变量，不提交到代码库
7. **CORS 策略**：仅允许管理后台域名访问用户 API；代理端点无需 CORS（CLI 调用）
8. **管理员鉴权**：管理端 API 需校验 `is_admin` 权限，使用独立的 AdminGuard
9. **兑换码防爆破**：兑换接口限流（如 5 次/分钟），连续失败后临时锁定
10. **请求体大小限制**：限制代理请求体大小（如 10MB），防止滥用
11. **日志脱敏**：日志中不记录完整 API Key 和请求/响应内容

---

## 错误处理

平台统一使用以下 HTTP 状态码和错误格式：

```json
{
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

| 状态码 | 场景 |
|--------|------|
| 400 | 请求参数校验失败 |
| 401 | API Key 无效或未提供 |
| 402 | 余额不足 |
| 403 | 权限不足（如非管理员访问管理端） |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 502 | 上游服务不可用 |
| 503 | 所有上游均不可用 |

> 代理端点的错误响应格式应与 Anthropic 官方 API 保持一致，确保 Claude CLI 能正确解析。
