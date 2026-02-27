import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
