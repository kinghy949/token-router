import { BadRequestException, Injectable } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RedeemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async redeemCode(userId: string, rawCode: string) {
    const limit = this.readRedeemRateLimitPerMinute();
    await this.rateLimitService.assertWithinLimit('redeem', userId, limit);

    const code = rawCode.trim().toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const redeemCode = await tx.redeemCode.findUnique({ where: { code } });
      if (!redeemCode) {
        throw new BadRequestException('兑换码不存在');
      }

      if (redeemCode.redeemedAt) {
        throw new BadRequestException('兑换码已被使用');
      }

      const now = new Date();
      if (redeemCode.expiresAt && redeemCode.expiresAt.getTime() < now.getTime()) {
        throw new BadRequestException('兑换码已过期');
      }

      const balance = await tx.balance.findUnique({ where: { userId } });
      if (!balance) {
        throw new BadRequestException('余额账户不存在');
      }

      const nextTokens = balance.tokens + redeemCode.tokenAmount;

      await tx.redeemCode.update({
        where: { code },
        data: {
          redeemedBy: userId,
          redeemedAt: now,
        },
      });

      const updatedBalance = await tx.balance.update({
        where: { userId },
        data: { tokens: nextTokens },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'redeem',
          amount: redeemCode.tokenAmount,
          balanceAfter: nextTokens,
          refId: null,
          description: `兑换码 ${code}`,
        },
      });

      return {
        code,
        amount: Number(redeemCode.tokenAmount),
        balance: {
          tokens: Number(updatedBalance.tokens),
          updatedAt: updatedBalance.updatedAt,
        },
      };
    });
  }

  private readRedeemRateLimitPerMinute() {
    const raw = Number(process.env.REDEEM_RATE_LIMIT_PER_MINUTE ?? 5);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 5;
    }
    return Math.trunc(raw);
  }
}
