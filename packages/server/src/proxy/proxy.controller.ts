import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentApiKey } from '../common/decorators/current-api-key.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ProxyService } from './proxy.service';

@Controller('v1')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('messages')
  @HttpCode(501)
  @UseGuards(ApiKeyGuard)
  forwardMessage(@CurrentApiKey() apiKeyCtx: { userId: string; apiKeyId: string }, @Body() body: unknown) {
    return this.proxyService.forwardMessage().catch(() => ({
      error: {
        type: 'not_implemented_error',
        message: 'Proxy forwarding is not implemented yet',
      },
      context: {
        userId: apiKeyCtx.userId,
        apiKeyId: apiKeyCtx.apiKeyId,
      },
      body,
    }));
  }
}
