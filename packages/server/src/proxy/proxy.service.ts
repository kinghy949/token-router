import { BadGatewayException, Injectable } from '@nestjs/common';
import { AnthropicAdapter } from '../providers/anthropic.adapter';
import { ClaudeRequest, ProviderRequest } from '../providers/provider-adapter.interface';

@Injectable()
export class ProxyService {
  constructor(private readonly anthropicAdapter: AnthropicAdapter) {}

  async forwardMessage(
    request: ClaudeRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response> {
    try {
      return await this.anthropicAdapter.forwardMessages(request, incomingHeaders);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadGatewayException(error.message);
      }
      throw new BadGatewayException('上游服务请求失败');
    }
  }

  async forwardCountTokens(
    request: ProviderRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response> {
    try {
      return await this.anthropicAdapter.forwardCountTokens(request, incomingHeaders);
    } catch (error) {
      if (error instanceof Error) {
        throw new BadGatewayException(error.message);
      }
      throw new BadGatewayException('上游服务请求失败');
    }
  }
}
