import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeRequest } from '../providers/provider-adapter.interface';

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

  async reserveForMessage(userId: string, request: ClaudeRequest) {
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
    const inputPrice = Number(process.env.INPUT_TOKEN_PRICE || '1');
    const outputPrice = Number(process.env.OUTPUT_TOKEN_PRICE || '5');
    const inputCost = Math.ceil(inputTokens / 1000) * inputPrice;
    const outputCost = Math.ceil(outputTokens / 1000) * outputPrice;
    return Math.max(1, inputCost + outputCost);
  }
}
