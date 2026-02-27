import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRedeemCodesDto } from './dto/create-redeem-codes.dto';
import { ListRedeemCodesDto } from './dto/list-redeem-codes.dto';
import { ListUsageLogsDto } from './dto/list-usage-logs.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    throw new NotImplementedException('管理员用户列表功能暂未实现');
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
}
