import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
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
export class VertexAdapter implements ProviderAdapter {
  name = 'vertex';

  transformRequest(req: ClaudeRequest): ProviderRequest {
    return {
      model: req.model,
      contents: req.messages,
      generationConfig: {
        maxOutputTokens: req.max_tokens,
      },
      stream: Boolean(req.stream),
    };
  }

  transformResponse(res: ProviderResponse): ClaudeResponse {
    const payload = res as Record<string, unknown>;
    const candidates = payload['candidates'];
    const firstCandidate =
      Array.isArray(candidates) && candidates.length > 0
        ? (candidates[0] as Record<string, unknown>)
        : undefined;
    const usageMetadata = payload['usageMetadata'] as Record<string, unknown> | undefined;

    return {
      id: this.readString(payload['id']),
      model: this.readString(payload['model']),
      content: Array.isArray(firstCandidate?.['content'])
        ? (firstCandidate?.['content'] as unknown[])
        : Array.isArray(payload['content'])
          ? (payload['content'] as unknown[])
          : undefined,
      usage: {
        input_tokens: this.readNonNegativeInt(
          usageMetadata?.['promptTokenCount'] ?? usageMetadata?.['input_tokens'],
        ),
        output_tokens: this.readNonNegativeInt(
          usageMetadata?.['candidatesTokenCount'] ?? usageMetadata?.['output_tokens'],
        ),
      },
    };
  }

  async *streamResponse(_res: ProviderStream): AsyncIterable<ClaudeStreamEvent> {
    throw new BadRequestException('Vertex 上游暂不支持流式透传');
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(process.env.VERTEX_BASE_URL && process.env.VERTEX_API_KEY);
  }

  supportedModels(): string[] {
    return this.readConfiguredModels(process.env.VERTEX_SUPPORTED_MODELS);
  }

  async forwardMessages(
    request: ClaudeRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response> {
    if (request.stream) {
      throw new BadRequestException('Vertex 上游暂不支持 stream=true');
    }

    const baseUrl = this.readBaseUrl();
    const upstreamResponse = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: this.buildUpstreamHeaders(incomingHeaders),
      body: JSON.stringify(this.transformRequest(request)),
    });

    return this.normalizeResponse(upstreamResponse);
  }

  async forwardCountTokens(
    request: ProviderRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response> {
    const baseUrl = this.readBaseUrl();
    return fetch(`${baseUrl}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: this.buildUpstreamHeaders(incomingHeaders),
      body: JSON.stringify(request),
    });
  }

  private async normalizeResponse(response: Response): Promise<Response> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return response;
    }

    const text = await response.text();
    try {
      const payload = JSON.parse(text) as ProviderResponse;
      return new Response(JSON.stringify(this.transformResponse(payload)), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return new Response(text, {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  private readBaseUrl() {
    const value = process.env.VERTEX_BASE_URL?.trim();
    if (!value) {
      throw new InternalServerErrorException('未配置 VERTEX_BASE_URL');
    }
    return value.replace(/\/+$/, '');
  }

  private buildUpstreamHeaders(incomingHeaders: Record<string, string | string[] | undefined>) {
    const apiKey = process.env.VERTEX_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('未配置 VERTEX_API_KEY');
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
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

  private readConfiguredModels(rawValue: string | undefined): string[] {
    if (!rawValue) {
      return [];
    }
    return rawValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    return value;
  }

  private readNonNegativeInt(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }
}
