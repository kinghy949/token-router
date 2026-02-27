# Redeem And Ledger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement redeem-code generation and redemption flow with balance credit and transaction ledger records.

**Architecture:** Add `redeem_codes` persistence in Prisma, expose admin endpoint for batch generation, and expose user endpoint for redeeming a code. Redemption runs in one transaction to mark code used, increment balance, and insert a `transactions` ledger row.

**Tech Stack:** TypeScript, NestJS, Prisma, Jest, Supertest

---

### Task 1: Add RedeemCode Model

**Files:**
- Modify: `packages/server/prisma/schema.prisma`

**Step 1: Write failing validation**

Run: `pnpm -C packages/server prisma:validate`
Expected: PASS currently, then fail after adding references if model missing fields.

**Step 2: Add `RedeemCode` model**

```prisma
model RedeemCode {
  code        String    @id @db.VarChar(50)
  tokenAmount BigInt    @map("token_amount")
  createdBy   String?   @map("created_by") @db.Char(36)
  redeemedBy  String?   @map("redeemed_by") @db.Char(36)
  redeemedAt  DateTime? @map("redeemed_at")
  expiresAt   DateTime? @map("expires_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  @@map("redeem_codes")
}
```

**Step 3: Run prisma checks**

Run:
- `pnpm -C packages/server prisma:validate`
- `pnpm -C packages/server prisma:generate`

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/server/prisma/schema.prisma
git commit -m "feat: add redeem code model"
```

### Task 2: Admin Redeem Code Generation

**Files:**
- Create: `packages/server/src/admin/dto/create-redeem-codes.dto.ts`
- Create: `packages/server/src/common/guards/admin.guard.ts`
- Modify: `packages/server/src/admin/admin.controller.ts`
- Modify: `packages/server/src/admin/admin.service.ts`

**Step 1: Write failing e2e**

- Add `test/redeem.e2e-spec.ts` admin generate assertion.

Run: `pnpm -C packages/server test:e2e -- redeem`
Expected: FAIL with 404/501.

**Step 2: Implement endpoint**

- `POST /admin/redeem-codes` with JWT + AdminGuard.
- Inputs: `tokenAmount`, `count`, optional `expiresAt`.
- Generate format `TR-<16 uppercase chars>`.

**Step 3: Re-run test**

Run: `pnpm -C packages/server test:e2e -- redeem`
Expected: admin generation test PASS.

**Step 4: Commit**

```bash
git add packages/server/src/admin/* packages/server/src/common/guards/admin.guard.ts
git commit -m "feat: add admin redeem code generation"
```

### Task 3: User Redeem Flow + Ledger

**Files:**
- Create: `packages/server/src/redeem/dto/redeem.dto.ts`
- Modify: `packages/server/src/redeem/redeem.controller.ts`
- Modify: `packages/server/src/redeem/redeem.service.ts`

**Step 1: Extend e2e with redeem path**

- Redeem success updates balance and returns current tokens.
- Reuse same code second time returns 400.

Run: `pnpm -C packages/server test:e2e -- redeem`
Expected: FAIL before implementation.

**Step 2: Implement redeem transaction**

In one Prisma transaction:
- load code
- reject if missing / used / expired
- mark code redeemed
- increment user balance
- insert `transactions` row with `type='redeem'`

**Step 3: Re-run test**

Run: `pnpm -C packages/server test:e2e -- redeem`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/server/src/redeem/*
git commit -m "feat: implement redeem and ledger credit flow"
```

### Task 4: Test Fake Prisma Support

**Files:**
- Modify: `packages/server/test/helpers/fake-prisma.ts`
- Modify: `packages/server/test/redeem.e2e-spec.ts`

**Step 1: Ensure failing behavior is meaningful**

Run: `pnpm -C packages/server test:e2e -- redeem`
Expected: failures reflect business assertions, not test doubles.

**Step 2: Add fake methods**

- `redeemCode.create/findUnique/update`
- `balance.update`
- `transaction.create`

**Step 3: Re-run tests**

Run: `pnpm -C packages/server test:e2e -- redeem`
Expected: PASS.

**Step 4: Commit**

```bash
git add packages/server/test/helpers/fake-prisma.ts packages/server/test/redeem.e2e-spec.ts
git commit -m "test: extend fake prisma for redeem flow"
```

### Task 5: Final Verification

**Files:**
- Modify: `packages/server/README.md`

**Step 1: Update runbook APIs**

- Add `POST /admin/redeem-codes` and `POST /redeem` behavior notes.

**Step 2: Run full verification**

```bash
pnpm -C packages/server prisma:validate
pnpm -C packages/server prisma:generate
pnpm -C packages/server test
pnpm -C packages/server test:e2e
pnpm -C packages/server build
```

Expected: all PASS.

**Step 3: Commit**

```bash
git add packages/server/README.md
git commit -m "docs: update runbook for redeem flow"
```
