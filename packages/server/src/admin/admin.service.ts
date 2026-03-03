import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sanitizeTextForLog } from '../common/logging/log-sanitizer.util';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustUserBalanceDto } from './dto/adjust-user-balance.dto';
import { CreateRedeemCodesDto } from './dto/create-redeem-codes.dto';
import { ListRedeemCodesDto } from './dto/list-redeem-codes.dto';
import { ListUsageLogsDto } from './dto/list-usage-logs.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface UsageSummary {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  lastUsedAt: Date | null;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: ListUsersDto) {
    const { page, pageSize, skip } = this.normalizePagination(query.page, query.pageSize);
    const keyword = query.q?.trim();

    const where: Prisma.UserWhereInput = keyword
      ? {
          email: {
            contains: keyword,
          },
        }
      : {};

    const total = await this.prisma.user.count({ where });
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const userIds = users.map((item) => item.id);
    const balanceMap = await this.buildBalanceMap(userIds);
    const usageMap = await this.buildUsageSummaryMap(userIds);

    return {
      page,
      pageSize,
      total,
      items: users.map((item) => ({
        id: item.id,
        email: item.email,
        isAdmin: item.isAdmin,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        balance: balanceMap.get(item.id) ?? 0,
        usageSummary: usageMap.get(item.id) ?? this.createEmptyUsageSummary(),
      })),
    };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const balance = await this.prisma.balance.findUnique({ where: { userId } });
    const usageMap = await this.buildUsageSummaryMap([userId]);

    return {
      ...user,
      balance: Number(balance?.tokens ?? BigInt(0)),
      usageSummary: usageMap.get(userId) ?? this.createEmptyUsageSummary(),
    };
  }

  async updateUser(adminUserId: string, userId: string, dto: UpdateUserDto) {
    if (typeof dto.isActive !== 'boolean' && typeof dto.isAdmin !== 'boolean') {
      throw new BadRequestException('至少提供一个可更新字段');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isAdmin: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('用户不存在');
    }

    if (dto.isAdmin === false && existing.isAdmin) {
      const adminCount = await this.prisma.user.count({ where: { isAdmin: true } });
      if (adminCount <= 1) {
        throw new BadRequestException('至少保留一个管理员账号');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (typeof dto.isActive === 'boolean') {
      data.isActive = dto.isActive;
    }
    if (typeof dto.isAdmin === 'boolean') {
      data.isAdmin = dto.isAdmin;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(
      `[audit] admin_user_update operator=${adminUserId} target=${userId} isActive=${updated.isActive} isAdmin=${updated.isAdmin}`,
    );

    return updated;
  }

  async adjustUserBalance(adminUserId: string, userId: string, dto: AdjustUserBalanceDto) {
    const amount = Math.trunc(dto.amount);
    const description = dto.description?.trim() || `管理员(${adminUserId})调整余额`;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      const balance = await tx.balance.findUnique({ where: { userId } });
      const current = balance?.tokens ?? BigInt(0);
      const next = current + BigInt(amount);

      if (next < BigInt(0)) {
        throw new BadRequestException('余额不足，无法扣减');
      }

      let updatedBalanceTokens = next;
      if (balance) {
        const updated = await tx.balance.update({
          where: { userId },
          data: { tokens: next },
        });
        updatedBalanceTokens = updated.tokens;
      } else {
        const created = await tx.balance.create({
          data: {
            userId,
            tokens: next,
          },
        });
        updatedBalanceTokens = created.tokens;
      }

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: 'admin_adjust',
          amount: BigInt(amount),
          balanceAfter: updatedBalanceTokens,
          description,
        },
      });

      this.logger.log(
        `[audit] admin_balance_adjust operator=${adminUserId} target=${userId} amount=${amount} transactionId=${transaction.id} description="${sanitizeTextForLog(
          description,
        )}"`,
      );

      return {
        userId,
        amount,
        balance: Number(updatedBalanceTokens),
        transactionId: transaction.id,
        description: transaction.description,
      };
    });
  }

  async getStats() {
    const usersTotal = await this.prisma.user.count();
    const activeApiKeys = await this.prisma.apiKey.count({
      where: {
        isActive: true,
      },
    });
    const redeemCodesUsed = await this.prisma.redeemCode.count({
      where: {
        redeemedBy: { not: null },
      },
    });
    const redeemCodesUnused = await this.prisma.redeemCode.count({
      where: {
        redeemedBy: null,
      },
    });
    const usageRows = await this.prisma.usageLog.findMany({
      select: {
        totalCost: true,
        createdAt: true,
      },
    });

    const totalCost = usageRows.reduce((sum, row) => sum + Number(row.totalCost), 0);

    return {
      usersTotal,
      activeApiKeys,
      redeemCodes: {
        used: redeemCodesUsed,
        unused: redeemCodesUnused,
        total: redeemCodesUsed + redeemCodesUnused,
      },
      totalCost,
      trends: {
        last7Days: this.buildDailyTrend(usageRows, 7),
        last30Days: this.buildDailyTrend(usageRows, 30),
      },
    };
  }

  async createRedeemCodes(adminUserId: string, dto: CreateRedeemCodesDto) {
    let expiresAt: Date | null = null;

    if (dto.expiresAt) {
      const parsed = new Date(dto.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('expiresAt 格式无效');
      }
      expiresAt = parsed;
    }

    return this.prisma.$transaction(async (tx) => {
      const items: Array<{ code: string; tokenAmount: number; expiresAt: string | null }> = [];

      for (let i = 0; i < dto.count; i += 1) {
        let code = '';
        let existing: unknown = null;

        do {
          code = `TR-${randomBytes(8).toString('hex').toUpperCase()}`;
          existing = await tx.redeemCode.findUnique({ where: { code } });
        } while (existing);

        const created = await tx.redeemCode.create({
          data: {
            code,
            tokenAmount: BigInt(dto.tokenAmount),
            createdBy: adminUserId,
            expiresAt,
          },
        });

        items.push({
          code: created.code,
          tokenAmount: Number(created.tokenAmount),
          expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
        });
      }

      return { items };
    });
  }

  async listRedeemCodes(query: ListRedeemCodesDto) {
    const { page, pageSize, skip } = this.normalizePagination(query.page, query.pageSize);
    const used = this.parseUsedFlag(query.used);

    const where: {
      redeemedBy?: string | null | { not: null };
    } = {};

    if (used === true) {
      where.redeemedBy = { not: null };
    } else if (used === false) {
      where.redeemedBy = null;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.redeemCode.count({ where }),
      this.prisma.redeemCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        code: item.code,
        tokenAmount: Number(item.tokenAmount),
        createdBy: item.createdBy,
        redeemedBy: item.redeemedBy,
        redeemedAt: item.redeemedAt,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      })),
    };
  }

  async listUsageLogs(query: ListUsageLogsDto) {
    const { page, pageSize, skip } = this.normalizePagination(query.page, query.pageSize);
    const where = this.buildUsageWhere(query);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.usageLog.count({ where }),
      this.prisma.usageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        userId: item.userId,
        apiKeyId: item.apiKeyId,
        model: item.model,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        totalCost: Number(item.totalCost),
        provider: item.provider,
        upstreamStatus: item.upstreamStatus,
        durationMs: item.durationMs,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt,
      })),
    };
  }

  private normalizePagination(page?: number, pageSize?: number) {
    const parsedPage = Number(page ?? 1);
    const parsedPageSize = Number(pageSize ?? 20);

    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.trunc(parsedPage) : 1;
    const requestedPageSize =
      Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? Math.trunc(parsedPageSize) : 20;
    const safePageSize = Math.min(requestedPageSize, 100);

    return {
      page: safePage,
      pageSize: safePageSize,
      skip: (safePage - 1) * safePageSize,
    };
  }

  private parseUsedFlag(value?: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }

    throw new BadRequestException('used 参数必须为 true 或 false');
  }

  private buildUsageWhere(query: ListUsageLogsDto) {
    const where: {
      model?: string;
      createdAt?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    const model = query.model?.trim();
    if (model) {
      where.model = model;
    }

    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from 不能晚于 to');
    }
    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = from;
      }
      if (to) {
        where.createdAt.lte = to;
      }
    }

    return where;
  }

  private parseDate(value: string | undefined, field: 'from' | 'to') {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} 日期格式无效`);
    }
    return date;
  }

  private async buildBalanceMap(userIds: string[]) {
    const map = new Map<string, number>();
    if (userIds.length === 0) {
      return map;
    }

    const balances = await this.prisma.balance.findMany({
      where: {
        userId: {
          in: userIds,
        },
      },
      select: {
        userId: true,
        tokens: true,
      },
    });

    for (const item of balances) {
      map.set(item.userId, Number(item.tokens));
    }

    return map;
  }

  private async buildUsageSummaryMap(userIds: string[]) {
    const map = new Map<string, UsageSummary>();
    if (userIds.length === 0) {
      return map;
    }

    const rows = await this.prisma.usageLog.findMany({
      where: {
        userId: {
          in: userIds,
        },
      },
      select: {
        userId: true,
        inputTokens: true,
        outputTokens: true,
        totalCost: true,
        createdAt: true,
      },
    });

    for (const row of rows) {
      const current = map.get(row.userId) ?? this.createEmptyUsageSummary();
      current.requestCount += 1;
      current.inputTokens += row.inputTokens;
      current.outputTokens += row.outputTokens;
      current.totalCost += Number(row.totalCost);
      if (!current.lastUsedAt || row.createdAt > current.lastUsedAt) {
        current.lastUsedAt = row.createdAt;
      }
      map.set(row.userId, current);
    }

    return map;
  }

  private createEmptyUsageSummary(): UsageSummary {
    return {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      lastUsedAt: null,
    };
  }

  private buildDailyTrend(
    rows: Array<{
      totalCost: bigint;
      createdAt: Date;
    }>,
    days: number,
  ) {
    const buckets = new Map<string, { date: string; requestCount: number; totalCost: number }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = this.toDayKey(date);
      buckets.set(key, {
        date: key,
        requestCount: 0,
        totalCost: 0,
      });
    }

    for (const row of rows) {
      const key = this.toDayKey(row.createdAt);
      const bucket = buckets.get(key);
      if (!bucket) {
        continue;
      }
      bucket.requestCount += 1;
      bucket.totalCost += Number(row.totalCost);
    }

    return Array.from(buckets.values());
  }

  private toDayKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
