import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamEvent,
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
  ProviderStream,
} from './provider-adapter.interface';

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';

  transformRequest(req: ClaudeRequest): ProviderRequest {
    return { ...req };
  }

  transformResponse(res: ProviderResponse): ClaudeResponse {
    return res as ClaudeResponse;
  }

  async *streamResponse(_res: ProviderStream): AsyncIterable<ClaudeStreamEvent> {
    return;
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }

  supportedModels(): string[] {
    return [];
  }

  async forwardMessages(
    request: ClaudeRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response> {
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(
      /\/+$/,
      '',
    );

    return fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.buildUpstreamHeaders(incomingHeaders),
      body: JSON.stringify(this.transformRequest(request)),
    });
  }

  async forwardCountTokens(
    request: ProviderRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response> {
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(
      /\/+$/,
      '',
    );

    return fetch(`${baseUrl}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: this.buildUpstreamHeaders(incomingHeaders),
      body: JSON.stringify(request),
    });
  }

  private buildUpstreamHeaders(incomingHeaders: Record<string, string | string[] | undefined>) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('ANTHROPIC_API_KEY is not configured');
    }

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': this.readHeader(incomingHeaders, 'anthropic-version') || '2023-06-01',
    };

    const anthropicBeta = this.readHeader(incomingHeaders, 'anthropic-beta');
    if (anthropicBeta) {
      headers['anthropic-beta'] = anthropicBeta;
    }

    return headers;
  }

  private readHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ): string | undefined {
    const value = headers[key];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      return value[0];
    }
    return undefined;
  }
}
