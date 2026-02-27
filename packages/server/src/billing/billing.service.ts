import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeRequest } from '../providers/provider-adapter.interface';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { GetUsageDto } from './dto/get-usage.dto';

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface MessageHold {
  holdAmount: number;
  inputTokenEstimate: number;
  outputTokenEstimate: number;
  balanceAfter: number;
}

export interface MessageSettlementContext {
  userId: string;
  apiKeyId: string | null;
  model: string;
  provider: string;
  holdAmount: number;
  usage?: MessageUsage | null;
  upstreamStatus?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}

interface DateRange {
  gte?: Date;
  lte?: Date;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string) {
    const balance = await this.prisma.balance.findUnique({ where: { userId } });
    const tokens = balance?.tokens ?? BigInt(0);

    return {
      tokens: Number(tokens),
      updatedAt: balance?.updatedAt ?? null,
    };
  }

  async getTransactions(userId: string, query: GetTransactionsDto) {
    const { page, pageSize, skip } = this.normalizePagination(query.page, query.pageSize);
    const where = { userId };

    const [total, records] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
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
      items: records.map((record) => ({
        id: record.id,
        type: record.type,
        amount: Number(record.amount),
        balanceAfter: Number(record.balanceAfter),
        refId: record.refId,
        description: record.description,
        createdAt: record.createdAt,
      })),
    };
  }

  async getUsage(userId: string, query: GetUsageDto) {
    const { page, pageSize, skip } = this.normalizePagination(query.page, query.pageSize);
    const where = this.buildUsageWhere(userId, query);

    const [total, records, summaryRows] = await this.prisma.$transaction([
      this.prisma.usageLog.count({ where }),
      this.prisma.usageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.usageLog.findMany({
        where,
        select: {
          inputTokens: true,
          outputTokens: true,
          totalCost: true,
        },
      }),
    ]);

    const summary = summaryRows.reduce(
      (acc, item) => {
        acc.inputTokens += item.inputTokens;
        acc.outputTokens += item.outputTokens;
        acc.totalCost += Number(item.totalCost);
        return acc;
      },
      { count: total, inputTokens: 0, outputTokens: 0, totalCost: 0 },
    );

    return {
      page,
      pageSize,
      total,
      summary,
      items: records.map((record) => ({
        id: record.id,
        apiKeyId: record.apiKeyId,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        totalCost: Number(record.totalCost),
        provider: record.provider,
        upstreamStatus: record.upstreamStatus,
        durationMs: record.durationMs,
        errorMessage: record.errorMessage,
        createdAt: record.createdAt,
      })),
    };
  }

  async reserveForMessage(userId: string, request: ClaudeRequest): Promise<MessageHold> {
    const maxTokens = Number(request.max_tokens ?? 0);
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            message: 'max_tokens 必须是正数',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const inputTokenEstimate = this.estimateInputTokens(request.messages);
    const holdAmount = this.calculateHoldAmount(inputTokenEstimate, maxTokens);
    const holdAmountBigInt = BigInt(holdAmount);

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({ where: { userId } });
      if (!balance) {
        throw new HttpException(
          {
            error: {
              type: 'balance_not_found_error',
              message: '余额账户不存在',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (balance.tokens < holdAmountBigInt) {
        throw new HttpException(
          {
            error: {
              type: 'insufficient_balance_error',
              message: '余额不足',
            },
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      const nextTokens = balance.tokens - holdAmountBigInt;
      const updated = await tx.balance.update({
        where: { userId },
        data: { tokens: nextTokens },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'usage_hold',
          amount: -holdAmountBigInt,
          balanceAfter: nextTokens,
          refId: null,
          description: `请求 /v1/messages 预扣费，max_tokens=${maxTokens}`,
        },
      });

      return {
        holdAmount,
        inputTokenEstimate,
        outputTokenEstimate: maxTokens,
        balanceAfter: Number(updated.tokens),
      };
    });
  }

  async settleMessage(context: MessageSettlementContext) {
    const holdAmount = this.normalizeAmount(context.holdAmount);
    const holdAmountBigInt = BigInt(holdAmount);
    const usage = this.normalizeUsage(context.usage);
    const upstreamStatus = this.normalizeNullableInt(context.upstreamStatus);
    const durationMs = this.normalizeNullableInt(context.durationMs);

    if (typeof upstreamStatus === 'number' && upstreamStatus >= 400) {
      return this.refundMessageHold({
        ...context,
        holdAmount,
        usage,
        upstreamStatus,
        durationMs,
      });
    }

    const actualCost = usage
      ? this.calculateTokenCost(usage.inputTokens, usage.outputTokens)
      : holdAmount;
    const actualCostBigInt = BigInt(actualCost);
    const delta = holdAmountBigInt - actualCostBigInt;

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({ where: { userId: context.userId } });
      if (!balance) {
        throw new HttpException(
          {
            error: {
              type: 'balance_not_found_error',
              message: '余额账户不存在',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const usageLog = await tx.usageLog.create({
        data: {
          userId: context.userId,
          apiKeyId: context.apiKeyId,
          model: context.model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalCost: actualCostBigInt,
          provider: context.provider,
          upstreamStatus,
          durationMs,
          errorMessage: context.errorMessage ?? null,
        },
      });

      let nextTokens = balance.tokens;

      if (delta > BigInt(0)) {
        nextTokens = balance.tokens + delta;
        await tx.balance.update({
          where: { userId: context.userId },
          data: { tokens: nextTokens },
        });
        await tx.transaction.create({
          data: {
            userId: context.userId,
            type: 'usage_refund',
            amount: delta,
            balanceAfter: nextTokens,
            refId: usageLog.id,
            description: '请求 /v1/messages 实际用量低于预扣，退还差额',
          },
        });
      } else if (delta < BigInt(0)) {
        const extraCharge = -delta;
        nextTokens = balance.tokens - extraCharge;
        await tx.balance.update({
          where: { userId: context.userId },
          data: { tokens: nextTokens },
        });
        await tx.transaction.create({
          data: {
            userId: context.userId,
            type: 'usage_settlement',
            amount: -extraCharge,
            balanceAfter: nextTokens,
            refId: usageLog.id,
            description: '请求 /v1/messages 实际用量超出预扣，补扣差额',
          },
        });
      }

      return {
        usageLogId: usageLog.id,
        actualCost,
        balanceAfter: Number(nextTokens),
      };
    });
  }

  async refundMessageHold(context: MessageSettlementContext) {
    const holdAmount = this.normalizeAmount(context.holdAmount);
    const holdAmountBigInt = BigInt(holdAmount);
    const usage = this.normalizeUsage(context.usage);
    const upstreamStatus = this.normalizeNullableInt(context.upstreamStatus);
    const durationMs = this.normalizeNullableInt(context.durationMs);

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({ where: { userId: context.userId } });
      if (!balance) {
        throw new HttpException(
          {
            error: {
              type: 'balance_not_found_error',
              message: '余额账户不存在',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const usageLog = await tx.usageLog.create({
        data: {
          userId: context.userId,
          apiKeyId: context.apiKeyId,
          model: context.model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalCost: BigInt(0),
          provider: context.provider,
          upstreamStatus,
          durationMs,
          errorMessage: context.errorMessage ?? null,
        },
      });

      if (holdAmountBigInt === BigInt(0)) {
        return {
          usageLogId: usageLog.id,
          actualCost: 0,
          balanceAfter: Number(balance.tokens),
        };
      }

      const nextTokens = balance.tokens + holdAmountBigInt;
      await tx.balance.update({
        where: { userId: context.userId },
        data: { tokens: nextTokens },
      });
      await tx.transaction.create({
        data: {
          userId: context.userId,
          type: 'usage_refund',
          amount: holdAmountBigInt,
          balanceAfter: nextTokens,
          refId: usageLog.id,
          description: '请求 /v1/messages 上游失败，退还预扣费用',
        },
      });

      return {
        usageLogId: usageLog.id,
        actualCost: 0,
        balanceAfter: Number(nextTokens),
      };
    });
  }

  private estimateInputTokens(messages: unknown[]): number {
    let chars = 0;
    for (const message of messages || []) {
      chars += this.readChars(message);
    }
    return Math.max(1, Math.ceil(chars / 4));
  }

  private readChars(value: unknown): number {
    if (typeof value === 'string') {
      return value.length;
    }
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.readChars(item), 0);
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).reduce<number>(
        (sum, item) => sum + this.readChars(item),
        0,
      );
    }
    return 0;
  }

  private calculateHoldAmount(inputTokens: number, outputTokens: number): number {
    return this.calculateTokenCost(inputTokens, outputTokens);
  }

  private calculateTokenCost(inputTokens: number, outputTokens: number): number {
    const inputPrice = Number(process.env.INPUT_TOKEN_PRICE || '1');
    const outputPrice = Number(process.env.OUTPUT_TOKEN_PRICE || '5');
    const inputCost = Math.ceil(inputTokens / 1000) * inputPrice;
    const outputCost = Math.ceil(outputTokens / 1000) * outputPrice;
    return Math.max(1, inputCost + outputCost);
  }

  private normalizeUsage(usage?: MessageUsage | null): MessageUsage | null {
    if (!usage) {
      return null;
    }

    return {
      inputTokens: this.normalizeAmount(usage.inputTokens),
      outputTokens: this.normalizeAmount(usage.outputTokens),
    };
  }

  private normalizeAmount(value: unknown): number {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0;
    }
    return Math.trunc(numeric);
  }

  private normalizeNullableInt(value: unknown): number | null {
    const normalized = this.normalizeAmount(value);
    return normalized > 0 ? normalized : null;
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

  private buildUsageWhere(userId: string, query: GetUsageDto) {
    const where: {
      userId: string;
      model?: string;
      createdAt?: DateRange;
    } = { userId };

    const model = query.model?.trim();
    if (model) {
      where.model = model;
    }

    const dateRange = this.parseDateRange(query.from, query.to);
    if (dateRange.gte || dateRange.lte) {
      where.createdAt = dateRange;
    }

    return where;
  }

  private parseDateRange(from?: string, to?: string): DateRange {
    const gte = this.parseDateValue(from, 'from');
    const lte = this.parseDateValue(to, 'to');

    if (gte && lte && gte.getTime() > lte.getTime()) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            message: 'from 不能晚于 to',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return { gte, lte };
  }

  private parseDateValue(value: string | undefined, field: 'from' | 'to'): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            message: `${field} 日期格式无效`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return parsed;
  }
}
