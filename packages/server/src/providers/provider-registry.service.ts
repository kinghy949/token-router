import { Injectable } from '@nestjs/common';
import { AnthropicAdapter } from './anthropic.adapter';
import { BedrockAdapter } from './bedrock.adapter';
import { ProviderAdapter } from './provider-adapter.interface';
import { VertexAdapter } from './vertex.adapter';

interface HealthState {
  healthy: boolean;
  checkedAt: number;
}

@Injectable()
export class ProviderRegistryService {
  private readonly adapterMap = new Map<string, ProviderAdapter>();
  private readonly healthCache = new Map<string, HealthState>();
  private readonly healthTtlMs = this.readPositiveInt(process.env.PROVIDER_HEALTH_TTL_MS, 30_000);

  constructor(
    anthropicAdapter: AnthropicAdapter,
    bedrockAdapter: BedrockAdapter,
    vertexAdapter: VertexAdapter,
  ) {
    this.adapterMap.set(anthropicAdapter.name, anthropicAdapter);
    this.adapterMap.set(bedrockAdapter.name, bedrockAdapter);
    this.adapterMap.set(vertexAdapter.name, vertexAdapter);
  }

  async getMessageProviders(model: string): Promise<ProviderAdapter[]> {
    const ordered = this.resolveOrderedProviders(model);
    const providers: ProviderAdapter[] = [];
    for (const provider of ordered) {
      if (await this.isHealthy(provider.name)) {
        providers.push(provider);
      }
    }
    return providers;
  }

  async getCountTokenProviders(): Promise<ProviderAdapter[]> {
    const ordered = this.resolveOrderedProviders(null);
    const providers: ProviderAdapter[] = [];
    for (const provider of ordered) {
      if (await this.isHealthy(provider.name)) {
        providers.push(provider);
      }
    }
    return providers;
  }

  markHealthy(providerName: string) {
    this.healthCache.set(providerName, { healthy: true, checkedAt: Date.now() });
  }

  markUnhealthy(providerName: string) {
    this.healthCache.set(providerName, {
      healthy: false,
      checkedAt: Date.now() - this.healthTtlMs - 1,
    });
  }

  maxFailoverAttempts(availableCount: number): number {
    const configured = this.readPositiveInt(process.env.PROXY_MAX_FAILOVER, 3);
    return Math.max(1, Math.min(configured, availableCount));
  }

  private resolveOrderedProviders(model: string | null): ProviderAdapter[] {
    const configuredPriority = (process.env.PROVIDER_PRIORITY || 'anthropic')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    const uniqueNames: string[] = [];
    for (const name of configuredPriority) {
      if (!uniqueNames.includes(name) && this.adapterMap.has(name)) {
        uniqueNames.push(name);
      }
    }

    if (uniqueNames.length === 0) {
      uniqueNames.push('anthropic');
    }

    const providers = uniqueNames
      .map((name) => this.adapterMap.get(name))
      .filter((item): item is ProviderAdapter => Boolean(item));

    if (!model) {
      return providers;
    }

    return providers.filter((provider) => {
      const supported = provider.supportedModels();
      if (supported.length === 0) {
        return true;
      }
      return supported.some((item) => item.toLowerCase() === model.toLowerCase());
    });
  }

  private async isHealthy(providerName: string): Promise<boolean> {
    const provider = this.adapterMap.get(providerName);
    if (!provider) {
      return false;
    }

    const cached = this.healthCache.get(providerName);
    if (cached && Date.now() - cached.checkedAt <= this.healthTtlMs) {
      return cached.healthy;
    }

    try {
      const healthy = await provider.healthCheck();
      this.healthCache.set(providerName, { healthy, checkedAt: Date.now() });
      return healthy;
    } catch {
      this.healthCache.set(providerName, { healthy: false, checkedAt: Date.now() });
      return false;
    }
  }

  private readPositiveInt(rawValue: string | undefined, defaultValue: number): number {
    const parsed = Number(rawValue ?? '');
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return defaultValue;
    }
    return Math.trunc(parsed);
  }
}
