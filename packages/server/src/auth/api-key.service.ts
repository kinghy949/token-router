import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';

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

  async updateApiKey(userId: string, id: string, dto: UpdateApiKeyDto) {
    const existed = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existed || existed.userId !== userId) {
      throw new NotFoundException('API Key 不存在');
    }

    const data: { name?: string | null; isActive?: boolean } = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const updated =
      Object.keys(data).length > 0
        ? await this.prisma.apiKey.update({
            where: { id },
            data,
            select: {
              id: true,
              keyPrefix: true,
              name: true,
              isActive: true,
              lastUsedAt: true,
              createdAt: true,
            },
          })
        : {
            id: existed.id,
            keyPrefix: existed.keyPrefix,
            name: existed.name,
            isActive: existed.isActive,
            lastUsedAt: existed.lastUsedAt,
            createdAt: existed.createdAt,
          };

    return updated;
  }

  async deleteApiKey(userId: string, id: string) {
    const existed = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existed || existed.userId !== userId) {
      throw new NotFoundException('API Key 不存在');
    }

    await this.prisma.apiKey.delete({ where: { id } });
  }
}
