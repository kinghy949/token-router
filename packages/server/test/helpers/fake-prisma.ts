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

  user: any = {};
  balance: any = {};
  apiKey: any = {};

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
  }

  async $transaction(arg: any) {
    if (typeof arg === 'function') {
      return arg(this);
    }
    return Promise.all(arg);
  }
}
