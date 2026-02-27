import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRedeemCodesDto } from './dto/create-redeem-codes.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    throw new NotImplementedException('Admin users listing is not implemented yet');
  }

  async createRedeemCodes(adminUserId: string, dto: CreateRedeemCodesDto) {
    let expiresAt: Date | null = null;

    if (dto.expiresAt) {
      const parsed = new Date(dto.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid expiresAt');
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
}
