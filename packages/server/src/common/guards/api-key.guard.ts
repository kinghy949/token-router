import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API Key 无效');
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          select: {
            id: true,
            isActive: true,
          },
        },
      },
    });

    if (!record || !record.isActive || !record.user?.isActive) {
      throw new UnauthorizedException('API Key 无效');
    }

    const limit = this.readRateLimitPerMinute();
    await this.rateLimitService.assertWithinLimit('api_key', record.id, limit);

    request.apiKeyContext = {
      userId: record.userId,
      apiKeyId: record.id,
    };

    return true;
  }

  private extractApiKey(request: any): string | null {
    const xApiKey = request.headers?.['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.trim().length > 0) {
      return xApiKey.trim();
    }

    const authHeader = request.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const value = authHeader.slice(7).trim();
      if (value.startsWith('sk-tr-')) {
        return value;
      }
    }

    return null;
  }

  private readRateLimitPerMinute() {
    const raw = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 60;
    }
    return Math.trunc(raw);
  }
}
