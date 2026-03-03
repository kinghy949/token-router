import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ClaudeRequest, ProviderRequest } from '../providers/provider-adapter.interface';
import { ProviderRegistryService } from '../providers/provider-registry.service';

export interface ProxyForwardResult {
  provider: string;
  response: Response;
}

@Injectable()
export class ProxyService {
  constructor(private readonly providerRegistry: ProviderRegistryService) {}

  async forwardMessage(
    request: ClaudeRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<ProxyForwardResult> {
    const providers = await this.providerRegistry.getMessageProviders(request.model);
    if (providers.length === 0) {
      throw new ServiceUnavailableException('当前无可用上游服务');
    }

    const maxAttempts = this.providerRegistry.maxFailoverAttempts(providers.length);
    let lastError: unknown = null;

    for (let index = 0; index < maxAttempts; index += 1) {
      const provider = providers[index];
      try {
        const response = await provider.forwardMessages(request, incomingHeaders);
        if (response.status >= 500 && index < maxAttempts - 1) {
          this.providerRegistry.markUnhealthy(provider.name);
          continue;
        }

        if (response.status >= 500) {
          this.providerRegistry.markUnhealthy(provider.name);
        } else {
          this.providerRegistry.markHealthy(provider.name);
        }

        return { provider: provider.name, response };
      } catch (error) {
        lastError = error;
        this.providerRegistry.markUnhealthy(provider.name);
        if (index >= maxAttempts - 1) {
          break;
        }
      }
    }

    if (lastError) {
      if (lastError instanceof Error) {
        throw new BadGatewayException(lastError.message);
      }
      throw new BadGatewayException('上游服务请求失败');
    }

    throw new ServiceUnavailableException('所有上游均不可用');
  }

  async forwardCountTokens(
    request: ProviderRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<ProxyForwardResult> {
    const providers = await this.providerRegistry.getCountTokenProviders();
    if (providers.length === 0) {
      throw new ServiceUnavailableException('当前无可用上游服务');
    }

    const maxAttempts = this.providerRegistry.maxFailoverAttempts(providers.length);
    let lastError: unknown = null;

    for (let index = 0; index < maxAttempts; index += 1) {
      const provider = providers[index];
      try {
        const response = await provider.forwardCountTokens(request, incomingHeaders);
        if (response.status >= 500 && index < maxAttempts - 1) {
          this.providerRegistry.markUnhealthy(provider.name);
          continue;
        }

        if (response.status >= 500) {
          this.providerRegistry.markUnhealthy(provider.name);
        } else {
          this.providerRegistry.markHealthy(provider.name);
        }

        return { provider: provider.name, response };
      } catch (error) {
        lastError = error;
        this.providerRegistry.markUnhealthy(provider.name);
        if (index >= maxAttempts - 1) {
          break;
        }
      }
    }

    if (lastError) {
      if (lastError instanceof Error) {
        throw new BadGatewayException(lastError.message);
      }
      throw new BadGatewayException('上游服务请求失败');
    }

    throw new ServiceUnavailableException('所有上游均不可用');
  }
}
