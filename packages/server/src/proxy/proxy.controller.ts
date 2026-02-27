import { Body, Controller, Headers, Post, Res, UseGuards } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ClaudeRequest, ProviderRequest } from '../providers/provider-adapter.interface';
import { ProxyService } from './proxy.service';

@Controller('v1')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('messages')
  @UseGuards(ApiKeyGuard)
  async forwardMessage(
    @Body() body: ClaudeRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() response: ExpressResponse,
  ) {
    const upstreamResponse = await this.proxyService.forwardMessage(body, headers);
    await this.writeUpstreamResponse(upstreamResponse, response);
  }

  @Post('messages/count_tokens')
  @UseGuards(ApiKeyGuard)
  async countTokens(
    @Body() body: ProviderRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() response: ExpressResponse,
  ) {
    const upstreamResponse = await this.proxyService.forwardCountTokens(body, headers);
    await this.writeUpstreamResponse(upstreamResponse, response);
  }

  private async writeUpstreamResponse(upstreamResponse: globalThis.Response, response: ExpressResponse) {
    response.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey === 'content-length' ||
        normalizedKey === 'transfer-encoding' ||
        normalizedKey === 'connection'
      ) {
        return;
      }
      response.setHeader(key, value);
    });

    const contentType = upstreamResponse.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      if (upstreamResponse.body) {
        const reader = upstreamResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          response.write(Buffer.from(value));
        }
      }
      response.end();
      return;
    }

    const text = await upstreamResponse.text();
    if (contentType.includes('application/json')) {
      try {
        response.send(JSON.parse(text));
        return;
      } catch {
        response.send(text);
        return;
      }
    }

    response.send(text);
  }
}
