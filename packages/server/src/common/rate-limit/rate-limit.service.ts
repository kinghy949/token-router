import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memoryStore = new Map<string, number>();
  private readonly redisDisabledDurationMs = 60_000;
  private readonly redisUrl = process.env.REDIS_URL?.trim();
  private redis: Redis | null = this.redisUrl ? new Redis(this.redisUrl, { lazyConnect: true }) : null;
  private redisDisabledUntil = 0;

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => null);
    }
  }

  async assertWithinLimit(scope: string, key: string, limit: number, windowSec = 60) {
    const normalizedLimit = this.normalizeLimit(limit);
    const result = await this.consume(scope, key, normalizedLimit, windowSec);
    if (result.allowed) {
      return result;
    }

    throw new HttpException(
      {
        error: {
          type: 'rate_limit_error',
          message: '请求过于频繁，请稍后再试',
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async consume(scope: string, key: string, limit: number, windowSec = 60): Promise<ConsumeResult> {
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedWindowSec = this.normalizeWindow(windowSec);
    const now = Date.now();
    const bucket = Math.floor(now / (normalizedWindowSec * 1000));
    const rateKey = `rl:${scope}:${key}:${bucket}`;
    const resetAt = (bucket + 1) * normalizedWindowSec * 1000;

    const redisResult = await this.consumeWithRedis(rateKey, normalizedLimit, normalizedWindowSec, resetAt);
    if (redisResult) {
      return redisResult;
    }

    return this.consumeWithMemory(rateKey, normalizedLimit, resetAt);
  }

  private async consumeWithRedis(
    key: string,
    limit: number,
    windowSec: number,
    resetAt: number,
  ): Promise<ConsumeResult | null> {
    if (!this.redis || Date.now() < this.redisDisabledUntil) {
      return null;
    }

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSec + 1);
      }

      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt,
      };
    } catch (error) {
      this.redisDisabledUntil = Date.now() + this.redisDisabledDurationMs;
      this.logger.warn('Redis 限流不可用，已回退到内存限流');
      if (error instanceof Error) {
        this.logger.debug(error.message);
      }
      return null;
    }
  }

  private consumeWithMemory(key: string, limit: number, resetAt: number): ConsumeResult {
    const now = Date.now();
    this.cleanupExpiredMemoryKeys(now);

    const currentCount = (this.memoryStore.get(key) ?? 0) + 1;
    this.memoryStore.set(key, currentCount);

    return {
      allowed: currentCount <= limit,
      remaining: Math.max(0, limit - currentCount),
      resetAt,
    };
  }

  private cleanupExpiredMemoryKeys(now: number) {
    for (const entryKey of this.memoryStore.keys()) {
      const parts = entryKey.split(':');
      const bucket = Number(parts[parts.length - 1] ?? 0);
      if (!Number.isFinite(bucket) || bucket <= 0) {
        this.memoryStore.delete(entryKey);
        continue;
      }
      const resetAt = (bucket + 1) * 60 * 1000;
      if (resetAt <= now) {
        this.memoryStore.delete(entryKey);
      }
    }
  }

  private normalizeLimit(limit: number) {
    const value = Number(limit);
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }
    return Math.trunc(value);
  }

  private normalizeWindow(windowSec: number) {
    const value = Number(windowSec);
    if (!Number.isFinite(value) || value <= 0) {
      return 60;
    }
    return Math.trunc(value);
  }
}
