# Token Router Backend Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a runnable NestJS backend scaffold with Prisma, JWT auth, API key management, and balance query based on `docs/design.md`.

**Architecture:** Use a pnpm workspace monorepo with a NestJS app in `packages/server`. Organize modules by bounded context (`auth`, `billing`, `proxy`, `redeem`, `providers`, `admin`) while implementing only the first business slice (`auth` + `billing`) and keeping other modules as compile-safe stubs. Persist core entities via Prisma and expose JWT-protected REST APIs.

**Tech Stack:** TypeScript, NestJS, Prisma, MySQL, Jest, Supertest, bcrypt, jsonwebtoken

---

### Task 1: Initialize Workspace and Server Package

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/tsconfig.build.json`
- Create: `packages/server/nest-cli.json`
- Create: `packages/server/.env.example`

**Step 1: Write the failing test (workspace script check)**

```bash
pnpm -C packages/server test
```

Expected: FAIL because package and scripts do not exist yet.

**Step 2: Create minimal workspace manifests**

```json
// package.json
{
  "name": "token-router",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - packages/*
```

```json
// packages/server/package.json (核心脚本)
{
  "name": "@token-router/server",
  "private": true,
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config test/jest-e2e.json",
    "prisma:generate": "prisma generate",
    "prisma:validate": "prisma validate"
  }
}
```

**Step 3: Install dependencies**

Run:

```bash
pnpm -C packages/server add @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt prisma @prisma/client class-validator class-transformer
pnpm -C packages/server add -D @nestjs/cli @nestjs/testing @types/bcrypt @types/express @types/jest jest ts-jest supertest @types/supertest typescript ts-node tsconfig-paths
```

Expected: PASS with lockfile updated.

**Step 4: Run script sanity check**

Run: `pnpm -C packages/server run build`
Expected: FAIL (source files not yet created), confirming scripts are wired.

**Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore packages/server/package.json packages/server/tsconfig.json packages/server/tsconfig.build.json packages/server/nest-cli.json packages/server/.env.example
git commit -m "chore: initialize workspace and nest server package"
```

### Task 2: Create Nest App Bootstrap and Module Skeletons

**Files:**
- Create: `packages/server/src/main.ts`
- Create: `packages/server/src/app.module.ts`
- Create: `packages/server/src/health/health.module.ts`
- Create: `packages/server/src/health/health.controller.ts`
- Create: `packages/server/src/auth/auth.module.ts`
- Create: `packages/server/src/billing/billing.module.ts`
- Create: `packages/server/src/proxy/proxy.module.ts`
- Create: `packages/server/src/redeem/redeem.module.ts`
- Create: `packages/server/src/providers/providers.module.ts`
- Create: `packages/server/src/admin/admin.module.ts`

**Step 1: Write failing e2e health test**

```typescript
// packages/server/test/health.e2e-spec.ts
it('/health (GET)', async () => {
  await request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test:e2e -- health`
Expected: FAIL with module/controller not found.

**Step 3: Write minimal implementation**

```typescript
// health.controller.ts
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { ok: true };
  }
}
```

Include all modules in `AppModule.imports`.

**Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test:e2e -- health`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/src/main.ts packages/server/src/app.module.ts packages/server/src/**/ *.ts packages/server/test/health.e2e-spec.ts
git commit -m "feat: bootstrap nest app and module skeletons"
```

### Task 3: Add Prisma Schema and Database Service

**Files:**
- Create: `packages/server/prisma/schema.prisma`
- Create: `packages/server/src/prisma/prisma.module.ts`
- Create: `packages/server/src/prisma/prisma.service.ts`
- Modify: `packages/server/src/app.module.ts`

**Step 1: Write failing validation step**

Run: `pnpm -C packages/server prisma:validate`
Expected: FAIL because prisma schema does not exist.

**Step 2: Add schema models (users/api_keys/balances/transactions)**

```prisma
model User {
  id           String   @id @default(uuid()) @db.Char(36)
  email        String   @unique @db.VarChar(255)
  passwordHash String   @map("password_hash") @db.VarChar(255)
  isAdmin      Boolean  @default(false) @map("is_admin")
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  apiKeys      ApiKey[]
  balance      Balance?
  transactions Transaction[]

  @@map("users")
}
```

Add remaining models with indexes matching design.

**Step 3: Add PrismaService and wire module**

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

**Step 4: Run prisma checks**

Run:
- `pnpm -C packages/server prisma:validate`
- `pnpm -C packages/server prisma:generate`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/prisma/schema.prisma packages/server/src/prisma/*.ts packages/server/src/app.module.ts
git commit -m "feat: add prisma schema and service"
```

### Task 4: Build Auth Domain DTOs and Password/JWT Utilities

**Files:**
- Create: `packages/server/src/auth/dto/register.dto.ts`
- Create: `packages/server/src/auth/dto/login.dto.ts`
- Create: `packages/server/src/auth/dto/update-password.dto.ts`
- Create: `packages/server/src/auth/jwt.strategy.ts`
- Create: `packages/server/src/common/guards/jwt-auth.guard.ts`
- Create: `packages/server/src/auth/auth.service.spec.ts`

**Step 1: Write failing unit tests for auth service**

```typescript
it('hashes password and validates login credentials', async () => {
  const user = await service.register({ email: 'a@b.com', password: 'secret123' });
  expect(user.email).toBe('a@b.com');
  await expect(service.validateUser('a@b.com', 'secret123')).resolves.toBeTruthy();
});
```

**Step 2: Run unit test to fail**

Run: `pnpm -C packages/server test -- auth.service.spec.ts`
Expected: FAIL due missing service logic.

**Step 3: Implement DTO and utility scaffolding**

- DTO with `class-validator`.
- `JwtStrategy` extracts user id/email from token payload.
- `JwtAuthGuard` extends passport guard.

**Step 4: Re-run unit test**

Run: `pnpm -C packages/server test -- auth.service.spec.ts`
Expected: still FAIL if register/login service not yet finished (expected for next task), but DTO compile passes.

**Step 5: Commit**

```bash
git add packages/server/src/auth/dto/*.ts packages/server/src/auth/jwt.strategy.ts packages/server/src/common/guards/jwt-auth.guard.ts packages/server/src/auth/auth.service.spec.ts
git commit -m "test: add auth service tests and jwt scaffolding"
```

### Task 5: Implement Register/Login/Me Endpoints

**Files:**
- Create: `packages/server/src/auth/auth.controller.ts`
- Create: `packages/server/src/auth/auth.service.ts`
- Modify: `packages/server/src/auth/auth.module.ts`
- Modify: `packages/server/src/app.module.ts`
- Create: `packages/server/test/auth.e2e-spec.ts`

**Step 1: Write failing e2e flow test**

```typescript
it('register -> login -> me', async () => {
  const register = await request(app.getHttpServer()).post('/auth/register').send({ email: 'u@test.com', password: 'secret123' }).expect(201);
  expect(register.body.email).toBe('u@test.com');

  const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'u@test.com', password: 'secret123' }).expect(201);
  const token = login.body.access_token;

  await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
});
```

**Step 2: Run test to verify failure**

Run: `pnpm -C packages/server test:e2e -- auth`
Expected: FAIL with missing routes/service.

**Step 3: Implement minimal auth behavior**

- `register`: transaction create user + balance(tokens=0)
- `login`: verify bcrypt password then sign JWT
- `me`: return current user profile

**Step 4: Run tests to pass**

Run:
- `pnpm -C packages/server test -- auth.service.spec.ts`
- `pnpm -C packages/server test:e2e -- auth`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/src/auth/*.ts packages/server/test/auth.e2e-spec.ts packages/server/src/app.module.ts
git commit -m "feat: implement auth register login me endpoints"
```

### Task 6: Implement API Key Management (Create/List)

**Files:**
- Create: `packages/server/src/auth/dto/create-api-key.dto.ts`
- Create: `packages/server/src/auth/api-key.service.ts`
- Modify: `packages/server/src/auth/auth.controller.ts`
- Modify: `packages/server/src/auth/auth.module.ts`
- Create: `packages/server/test/api-keys.e2e-spec.ts`

**Step 1: Write failing e2e tests**

```typescript
it('create api key once and list masked keys', async () => {
  const token = await getJwtToken(app);
  const created = await request(app.getHttpServer()).post('/api-keys').set('Authorization', `Bearer ${token}`).send({ name: 'default' }).expect(201);
  expect(created.body.apiKey.startsWith('sk-tr-')).toBe(true);

  const list = await request(app.getHttpServer()).get('/api-keys').set('Authorization', `Bearer ${token}`).expect(200);
  expect(list.body.items[0].keyPrefix.startsWith('sk-tr-')).toBe(true);
  expect(list.body.items[0].apiKey).toBeUndefined();
});
```

**Step 2: Run e2e to fail**

Run: `pnpm -C packages/server test:e2e -- api-keys`
Expected: FAIL due missing routes/services.

**Step 3: Implement minimal API key service**

```typescript
const raw = `sk-tr-${randomBytes(24).toString('base64url')}`;
const hash = createHash('sha256').update(raw).digest('hex');
const prefix = raw.slice(0, 10);
```

Persist hash/prefix/name and return raw only on create.

**Step 4: Run e2e to pass**

Run: `pnpm -C packages/server test:e2e -- api-keys`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/src/auth/*.ts packages/server/src/auth/dto/create-api-key.dto.ts packages/server/test/api-keys.e2e-spec.ts
git commit -m "feat: add api key create and list endpoints"
```

### Task 7: Implement Billing Query and Balance Endpoint

**Files:**
- Create: `packages/server/src/billing/billing.service.ts`
- Create: `packages/server/src/billing/billing.controller.ts`
- Modify: `packages/server/src/billing/billing.module.ts`
- Create: `packages/server/test/balance.e2e-spec.ts`

**Step 1: Write failing e2e test**

```typescript
it('returns current balance for authenticated user', async () => {
  const token = await getJwtToken(app);
  const res = await request(app.getHttpServer()).get('/balance').set('Authorization', `Bearer ${token}`).expect(200);
  expect(typeof res.body.tokens).toBe('number');
});
```

**Step 2: Run test to fail**

Run: `pnpm -C packages/server test:e2e -- balance`
Expected: FAIL (route missing).

**Step 3: Implement minimal billing read service**

- `BillingService.getBalance(userId)` reads `balances` by `user_id`.
- `BillingController.getBalance()` uses JWT guard and current user decorator.

**Step 4: Run test to pass**

Run: `pnpm -C packages/server test:e2e -- balance`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/src/billing/*.ts packages/server/test/balance.e2e-spec.ts
git commit -m "feat: add balance query endpoint"
```

### Task 8: Add API Key Guard for Future Proxy Usage

**Files:**
- Create: `packages/server/src/common/guards/api-key.guard.ts`
- Create: `packages/server/src/common/decorators/current-api-key.decorator.ts`
- Modify: `packages/server/src/auth/auth.module.ts`
- Create: `packages/server/src/proxy/proxy.controller.ts`
- Create: `packages/server/src/proxy/proxy.service.ts`

**Step 1: Write failing unit tests for guard**

```typescript
it('accepts x-api-key and resolves active key owner', async () => {
  const result = await guard.canActivate(contextWithHeader('x-api-key', rawKey));
  expect(result).toBe(true);
});
```

**Step 2: Run test to fail**

Run: `pnpm -C packages/server test -- api-key.guard`
Expected: FAIL.

**Step 3: Implement guard**

- Parse `x-api-key` first, fallback to `Authorization: Bearer` when value starts with `sk-tr-`.
- SHA-256 compare with DB hash.
- Validate `apiKey.isActive` and `user.isActive`.
- Attach `request.apiKeyContext = { userId, apiKeyId }`.

**Step 4: Run test to pass**

Run: `pnpm -C packages/server test -- api-key.guard`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/src/common/guards/api-key.guard.ts packages/server/src/common/decorators/current-api-key.decorator.ts packages/server/src/proxy/*.ts
git commit -m "feat: add api key guard for proxy path"
```

### Task 9: Keep Stub Modules Compile-Safe

**Files:**
- Create: `packages/server/src/redeem/redeem.controller.ts`
- Create: `packages/server/src/redeem/redeem.service.ts`
- Create: `packages/server/src/providers/provider-adapter.interface.ts`
- Create: `packages/server/src/providers/anthropic.adapter.ts`
- Create: `packages/server/src/providers/bedrock.adapter.ts`
- Create: `packages/server/src/providers/vertex.adapter.ts`
- Create: `packages/server/src/admin/admin.controller.ts`
- Create: `packages/server/src/admin/admin.service.ts`

**Step 1: Write failing build check**

Run: `pnpm -C packages/server build`
Expected: FAIL if module exports/controllers missing.

**Step 2: Implement minimal stub code**

- Controllers return `501 Not Implemented` JSON.
- `ProviderAdapter` interface matches `docs/design.md`.
- Adapters export class with placeholder methods throwing `NotImplementedException`.

**Step 3: Run build check**

Run: `pnpm -C packages/server build`
Expected: PASS.

**Step 4: Run focused smoke test**

Run: `pnpm -C packages/server test:e2e -- health`
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/server/src/redeem/*.ts packages/server/src/providers/*.ts packages/server/src/admin/*.ts
git commit -m "chore: add compile-safe stubs for remaining modules"
```

### Task 10: End-to-End Verification and Documentation Sync

**Files:**
- Modify: `docs/design.md` (only if behavior deviates)
- Create: `packages/server/README.md`

**Step 1: Run full verification**

Run:

```bash
pnpm -C packages/server prisma:validate
pnpm -C packages/server prisma:generate
pnpm -C packages/server test
pnpm -C packages/server test:e2e
pnpm -C packages/server build
```

Expected: all PASS.

**Step 2: Manual runtime check**

Run: `pnpm -C packages/server start:dev`
Expected: app starts; `GET /health` returns 200.

**Step 3: Write runbook README**

Include:
- required env vars
- local run steps
- API list for first milestone

**Step 4: Validate docs consistency**

Run: `rg "auth/register|api-keys|balance|health" docs/design.md packages/server/README.md`
Expected: endpoints consistently documented.

**Step 5: Commit**

```bash
git add packages/server/README.md docs/design.md
git commit -m "docs: add backend runbook and align design references"
```

## Execution Notes

- During implementation, follow `@test-driven-development` strictly for each endpoint/guard.
- Before claiming completion, run `@verification-before-completion` and capture command outputs.
- Keep commits small and scoped to one task.
