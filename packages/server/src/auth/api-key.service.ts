import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async createApiKey(userId: string, dto: CreateApiKeyDto) {
    const rawKey = `sk-tr-${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10);

    const record = await this.prisma.apiKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix,
        name: dto.name?.trim() || null,
      },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      ...record,
      apiKey: rawKey,
    };
  }

  async listApiKeys(userId: string) {
    const items = await this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        keyPrefix: true,
        name: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { items };
  }
}
