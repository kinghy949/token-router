import { randomUUID } from 'crypto';

type SelectObject = Record<string, boolean>;

function applySelect<T extends Record<string, any>>(value: T, select?: SelectObject) {
  if (!select) {
    return value;
  }

  const selected: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) {
      selected[key] = value[key];
    }
  }

  return selected;
}

export class FakePrismaService {
  private users: any[] = [];
  private balances: any[] = [];
  private apiKeys: any[] = [];
  private redeemCodes: any[] = [];
  private transactions: any[] = [];
  private usageLogs: any[] = [];

  user: any = {};
  balance: any = {};
  apiKey: any = {};
  redeemCode: any = {};
  transaction: any = {};
  usageLog: any = {};

  constructor() {
    this.user.findUnique = async ({ where, select }: any) => {
      const user = this.users.find((u) => {
        if (where?.email) {
          return u.email === where.email;
        }
        if (where?.id) {
          return u.id === where.id;
        }
        return false;
      });

      return user ? applySelect(user, select) : null;
    };

    this.user.findMany = async ({ where, orderBy, skip, take, select }: any = {}) => {
      let list = this.users.filter((u) => {
        if (where?.id?.in && !where.id.in.includes(u.id)) {
          return false;
        }
        if (where?.isAdmin !== undefined && u.isAdmin !== where.isAdmin) {
          return false;
        }
        if (where?.email?.contains) {
          const keyword = String(where.email.contains).toLowerCase();
          if (!String(u.email).toLowerCase().includes(keyword)) {
            return false;
          }
        }
        return true;
      });

      if (orderBy?.createdAt === 'desc') {
        list = list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      } else if (orderBy?.createdAt === 'asc') {
        list = list.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
      }

      const start = Number(skip ?? 0);
      const end = take !== undefined ? start + Number(take) : undefined;
      return list.slice(start, end).map((item) => applySelect(item, select));
    };

    this.user.count = async ({ where }: any = {}) => {
      return this.users.filter((u) => {
        if (where?.id?.in && !where.id.in.includes(u.id)) {
          return false;
        }
        if (where?.isAdmin !== undefined && u.isAdmin !== where.isAdmin) {
          return false;
        }
        if (where?.email?.contains) {
          const keyword = String(where.email.contains).toLowerCase();
          if (!String(u.email).toLowerCase().includes(keyword)) {
            return false;
          }
        }
        return true;
      }).length;
    };

    this.user.create = async ({ data }: any) => {
      const now = new Date();
      const user = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        isAdmin: data.isAdmin ?? false,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(user);
      return user;
    };

    this.user.update = async ({ where, data }: any) => {
      const idx = this.users.findIndex((u) => u.id === where.id);
      if (idx < 0) {
        throw new Error('用户不存在');
      }

      const next = {
        ...this.users[idx],
        ...data,
        updatedAt: new Date(),
      };
      this.users[idx] = next;
      return next;
    };

    this.balance.create = async ({ data }: any) => {
      const balance = {
        userId: data.userId,
        tokens: data.tokens ?? BigInt(0),
        updatedAt: new Date(),
      };
      this.balances = this.balances.filter((b) => b.userId !== data.userId);
      this.balances.push(balance);
      return balance;
    };

    this.balance.findUnique = async ({ where }: any) => {
      const balance = this.balances.find((b) => b.userId === where.userId);
      return balance ?? null;
    };

    this.balance.findMany = async ({ where, select }: any = {}) => {
      let list = this.balances;
      if (where?.userId?.in) {
        list = list.filter((item) => where.userId.in.includes(item.userId));
      }
      return list.map((item) => applySelect(item, select));
    };

    this.balance.update = async ({ where, data }: any) => {
      const idx = this.balances.findIndex((b) => b.userId === where.userId);
      if (idx < 0) {
        throw new Error('余额不存在');
      }

      const next = {
        ...this.balances[idx],
        ...data,
        updatedAt: new Date(),
      };
      this.balances[idx] = next;
      return next;
    };

    this.apiKey.create = async ({ data }: any) => {
      const apiKey = {
        id: randomUUID(),
        userId: data.userId,
        keyHash: data.keyHash,
        keyPrefix: data.keyPrefix,
        name: data.name ?? null,
        isActive: data.isActive ?? true,
        lastUsedAt: null,
        createdAt: new Date(),
      };
      this.apiKeys.push(apiKey);
      return apiKey;
    };

    this.apiKey.findMany = async ({ where, orderBy }: any) => {
      let list = this.apiKeys.filter((k) => {
        if (where?.userId) {
          return k.userId === where.userId;
        }
        return true;
      });

      if (orderBy?.createdAt === 'desc') {
        list = list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      }

      return list;
    };

    this.apiKey.findUnique = async ({ where, include }: any) => {
      const apiKey = this.apiKeys.find((k) => {
        if (where?.id) {
          return k.id === where.id;
        }
        if (where?.keyHash) {
          return k.keyHash === where.keyHash;
        }
        return false;
      });

      if (!apiKey) {
        return null;
      }

      if (include?.user) {
        const user = this.users.find((u) => u.id === apiKey.userId);
        return { ...apiKey, user };
      }

      return apiKey;
    };

    this.apiKey.count = async ({ where }: any = {}) => {
      return this.apiKeys.filter((item) => {
        if (where?.isActive !== undefined && item.isActive !== where.isActive) {
          return false;
        }
        if (where?.userId && item.userId !== where.userId) {
          return false;
        }
        return true;
      }).length;
    };

    this.apiKey.update = async ({ where, data, select }: any) => {
      const idx = this.apiKeys.findIndex((k) => k.id === where.id);
      if (idx < 0) {
        throw new Error('API Key 不存在');
      }

      const next = {
        ...this.apiKeys[idx],
        ...data,
      };
      this.apiKeys[idx] = next;
      return applySelect(next, select);
    };

    this.apiKey.delete = async ({ where }: any) => {
      const idx = this.apiKeys.findIndex((k) => k.id === where.id);
      if (idx < 0) {
        throw new Error('API Key 不存在');
      }

      const removed = this.apiKeys[idx];
      this.apiKeys.splice(idx, 1);
      return removed;
    };

    this.redeemCode.findUnique = async ({ where }: any) => {
      const code = this.redeemCodes.find((c) => c.code === where.code);
      return code ?? null;
    };

    this.redeemCode.findMany = async ({ where, orderBy, skip, take }: any) => {
      let list = this.redeemCodes.filter((item) => {
        if (where?.redeemedBy === null && item.redeemedBy !== null) {
          return false;
        }
        if (where?.redeemedBy?.not === null && item.redeemedBy === null) {
          return false;
        }
        return true;
      });

      if (orderBy?.createdAt === 'desc') {
        list = list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      }

      const start = Number(skip ?? 0);
      const end = take !== undefined ? start + Number(take) : undefined;
      return list.slice(start, end);
    };

    this.redeemCode.count = async ({ where }: any) => {
      return this.redeemCodes.filter((item) => {
        if (where?.redeemedBy === null && item.redeemedBy !== null) {
          return false;
        }
        if (where?.redeemedBy?.not === null && item.redeemedBy === null) {
          return false;
        }
        return true;
      }).length;
    };

    this.redeemCode.create = async ({ data }: any) => {
      const created = {
        code: data.code,
        tokenAmount: data.tokenAmount,
        createdBy: data.createdBy ?? null,
        redeemedBy: data.redeemedBy ?? null,
        redeemedAt: data.redeemedAt ?? null,
        expiresAt: data.expiresAt ?? null,
        createdAt: new Date(),
      };
      this.redeemCodes.push(created);
      return created;
    };

    this.redeemCode.update = async ({ where, data }: any) => {
      const idx = this.redeemCodes.findIndex((c) => c.code === where.code);
      if (idx < 0) {
        throw new Error('兑换码不存在');
      }

      const next = {
        ...this.redeemCodes[idx],
        ...data,
      };
      this.redeemCodes[idx] = next;
      return next;
    };

    this.transaction.create = async ({ data }: any) => {
      const item = {
        id: randomUUID(),
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        balanceAfter: data.balanceAfter,
        refId: data.refId ?? null,
        description: data.description ?? null,
        createdAt: new Date(),
      };
      this.transactions.push(item);
      return item;
    };

    this.transaction.findMany = async ({ where, orderBy, skip, take }: any) => {
      let list = this.transactions.filter((item) => {
        if (where?.userId && item.userId !== where.userId) {
          return false;
        }
        return true;
      });

      if (orderBy?.createdAt === 'desc') {
        list = list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      }

      const start = Number(skip ?? 0);
      const end = take !== undefined ? start + Number(take) : undefined;
      return list.slice(start, end);
    };

    this.transaction.count = async ({ where }: any) => {
      return this.transactions.filter((item) => {
        if (where?.userId && item.userId !== where.userId) {
          return false;
        }
        return true;
      }).length;
    };

    this.usageLog.create = async ({ data }: any) => {
      const item = {
        id: randomUUID(),
        userId: data.userId,
        apiKeyId: data.apiKeyId ?? null,
        model: data.model,
        inputTokens: data.inputTokens ?? 0,
        outputTokens: data.outputTokens ?? 0,
        totalCost: data.totalCost ?? BigInt(0),
        provider: data.provider,
        upstreamStatus: data.upstreamStatus ?? null,
        durationMs: data.durationMs ?? null,
        errorMessage: data.errorMessage ?? null,
        createdAt: new Date(),
      };
      this.usageLogs.push(item);
      return item;
    };

    this.usageLog.findMany = async ({ where, orderBy, skip, take, select }: any = {}) => {
      let list = this.usageLogs.filter((item) => {
        if (where?.userId && typeof where.userId === 'string' && item.userId !== where.userId) {
          return false;
        }

        if (where?.userId?.in && !where.userId.in.includes(item.userId)) {
          return false;
        }

        if (where?.model && item.model !== where.model) {
          return false;
        }

        if (where?.createdAt?.gte && Number(item.createdAt) < Number(where.createdAt.gte)) {
          return false;
        }

        if (where?.createdAt?.lte && Number(item.createdAt) > Number(where.createdAt.lte)) {
          return false;
        }

        return true;
      });

      if (orderBy?.createdAt === 'desc') {
        list = list.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      }

      const start = Number(skip ?? 0);
      const end = take !== undefined ? start + Number(take) : undefined;
      const paged = list.slice(start, end);
      return paged.map((item) => applySelect(item, select));
    };

    this.usageLog.count = async ({ where }: any = {}) => {
      return this.usageLogs.filter((item) => {
        if (where?.userId && typeof where.userId === 'string' && item.userId !== where.userId) {
          return false;
        }
        if (where?.userId?.in && !where.userId.in.includes(item.userId)) {
          return false;
        }
        if (where?.model && item.model !== where.model) {
          return false;
        }
        if (where?.createdAt?.gte && Number(item.createdAt) < Number(where.createdAt.gte)) {
          return false;
        }
        if (where?.createdAt?.lte && Number(item.createdAt) > Number(where.createdAt.lte)) {
          return false;
        }
        return true;
      }).length;
    };
  }

  async $transaction(arg: any) {
    if (typeof arg === 'function') {
      return arg(this);
    }
    return Promise.all(arg);
  }

  inspectState() {
    return {
      users: [...this.users],
      balances: [...this.balances],
      apiKeys: [...this.apiKeys],
      redeemCodes: [...this.redeemCodes],
      transactions: [...this.transactions],
      usageLogs: [...this.usageLogs],
    };
  }
}
