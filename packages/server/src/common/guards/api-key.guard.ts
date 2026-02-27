import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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
}
