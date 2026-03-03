import { Body, Controller, Headers, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { ApiKeyService } from '../auth/api-key.service';
import { CurrentApiKey } from '../common/decorators/current-api-key.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { sanitizeTextForLog } from '../common/logging/log-sanitizer.util';
import { BillingService, MessageUsage } from '../billing/billing.service';
import { ClaudeRequest, ProviderRequest } from '../providers/provider-adapter.interface';
import { ProxyExceptionFilter } from './proxy-exception.filter';
import { ProxyService } from './proxy.service';

interface UpstreamWriteResult {
  usage: MessageUsage | null;
  errorMessage: string | null;
  upstreamStatus: number;
}

@Controller('v1')
@UseFilters(ProxyExceptionFilter)
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly billingService: BillingService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  @Post('messages')
  @UseGuards(ApiKeyGuard)
  async forwardMessage(
    @CurrentApiKey() apiKeyCtx: { userId: string; apiKeyId: string },
    @Body() body: ClaudeRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() response: ExpressResponse,
  ) {
    const startedAt = Date.now();
    await this.touchApiKeyLastUsedAt(apiKeyCtx.apiKeyId);
    const hold = await this.billingService.reserveForMessage(apiKeyCtx.userId, body);
    let selectedProvider = 'anthropic';
    const settlementBase = {
      userId: apiKeyCtx.userId,
      apiKeyId: apiKeyCtx.apiKeyId,
      model: typeof body.model === 'string' && body.model.trim().length > 0 ? body.model : 'unknown',
      provider: selectedProvider,
      holdAmount: hold.holdAmount,
      durationMs: Date.now() - startedAt,
    };

    let upstreamResponse: globalThis.Response;
    try {
      const result = await this.proxyService.forwardMessage(body, headers);
      selectedProvider = result.provider;
      upstreamResponse = result.response;
    } catch (error) {
      await this.safeRefundMessageHold({
        ...settlementBase,
        provider: selectedProvider,
        upstreamStatus: null,
        errorMessage: this.extractThrownErrorMessage(error),
      });
      throw error;
    }

    let writeResult: UpstreamWriteResult;
    try {
      writeResult = await this.writeUpstreamResponse(upstreamResponse, response);
    } catch (error) {
      await this.safeRefundMessageHold({
        ...settlementBase,
        provider: selectedProvider,
        upstreamStatus: upstreamResponse.status,
        errorMessage: this.extractThrownErrorMessage(error),
      });
      throw error;
    }

    await this.safeSettleMessage({
      ...settlementBase,
      provider: selectedProvider,
      usage: writeResult.usage,
      upstreamStatus: writeResult.upstreamStatus,
      errorMessage: writeResult.errorMessage,
      durationMs: Date.now() - startedAt,
    });
  }

  @Post('messages/count_tokens')
  @UseGuards(ApiKeyGuard)
  async countTokens(
    @CurrentApiKey() apiKeyCtx: { userId: string; apiKeyId: string },
    @Body() body: ProviderRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() response: ExpressResponse,
  ) {
    await this.touchApiKeyLastUsedAt(apiKeyCtx.apiKeyId);
    const result = await this.proxyService.forwardCountTokens(body, headers);
    await this.writeUpstreamResponse(result.response, response);
  }

  private async writeUpstreamResponse(
    upstreamResponse: globalThis.Response,
    response: ExpressResponse,
  ): Promise<UpstreamWriteResult> {
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
      const decoder = new TextDecoder();
      let streamText = '';
      if (upstreamResponse.body) {
        const reader = upstreamResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          streamText += decoder.decode(value, { stream: true });
          response.write(Buffer.from(value));
        }
        streamText += decoder.decode();
      }
      response.end();

      return {
        usage: this.extractUsageFromSse(streamText),
        errorMessage: upstreamResponse.ok ? null : this.extractErrorFromSse(streamText),
        upstreamStatus: upstreamResponse.status,
      };
    }

    const text = await upstreamResponse.text();
    const parsedPayload = this.tryParseJson(text);
    const normalizedError =
      upstreamResponse.status >= 400
        ? this.normalizeUpstreamError(parsedPayload, text, upstreamResponse.status)
        : null;

    if (normalizedError) {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.send(normalizedError);
    } else if (contentType.includes('application/json')) {
      response.send(parsedPayload !== null ? parsedPayload : text);
    } else {
      response.send(text);
    }

    return {
      usage: this.extractUsageFromPayload(parsedPayload),
      errorMessage:
        normalizedError?.error.message ??
        this.extractErrorMessageFromPayload(parsedPayload, text, upstreamResponse.status),
      upstreamStatus: upstreamResponse.status,
    };
  }

  private tryParseJson(text: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractUsageFromPayload(payload: Record<string, unknown> | null): MessageUsage | null {
    if (!payload) {
      return null;
    }

    const candidates: unknown[] = [payload['usage']];
    if (payload['message'] && typeof payload['message'] === 'object') {
      candidates.push((payload['message'] as Record<string, unknown>)['usage']);
    }
    if (payload['delta'] && typeof payload['delta'] === 'object') {
      candidates.push((payload['delta'] as Record<string, unknown>)['usage']);
    }

    for (const candidate of candidates) {
      const usage = this.parseUsageObject(candidate);
      if (usage) {
        return usage;
      }
    }

    return null;
  }

  private extractUsageFromSse(streamText: string): MessageUsage | null {
    let inputTokens = 0;
    let outputTokens = 0;
    let found = false;

    for (const line of streamText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }

      const rawData = trimmed.slice(5).trim();
      if (!rawData || rawData === '[DONE]') {
        continue;
      }

      const payload = this.tryParseJson(rawData);
      const usage = this.extractUsageFromPayload(payload);
      if (!usage) {
        continue;
      }

      found = true;
      inputTokens = Math.max(inputTokens, usage.inputTokens);
      outputTokens = Math.max(outputTokens, usage.outputTokens);
    }

    if (!found) {
      return null;
    }

    return {
      inputTokens,
      outputTokens,
    };
  }

  private parseUsageObject(value: unknown): MessageUsage | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const usage = value as Record<string, unknown>;
    const hasInput = usage['input_tokens'] !== undefined || usage['inputTokens'] !== undefined;
    const hasOutput = usage['output_tokens'] !== undefined || usage['outputTokens'] !== undefined;
    if (!hasInput && !hasOutput) {
      return null;
    }

    return {
      inputTokens: this.toNonNegativeInt(usage['input_tokens'] ?? usage['inputTokens']),
      outputTokens: this.toNonNegativeInt(usage['output_tokens'] ?? usage['outputTokens']),
    };
  }

  private extractErrorFromSse(streamText: string): string | null {
    for (const line of streamText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }

      const rawData = trimmed.slice(5).trim();
      if (!rawData || rawData === '[DONE]') {
        continue;
      }

      const payload = this.tryParseJson(rawData);
      const message = this.extractErrorMessageFromPayload(payload, rawData, 500);
      if (message) {
        return message;
      }
    }

    return null;
  }

  private extractErrorMessageFromPayload(
    payload: Record<string, unknown> | null,
    rawText: string,
    upstreamStatus: number,
  ): string | null {
    if (!payload) {
      return upstreamStatus >= 400 ? this.limitErrorText(rawText) : null;
    }

    const error = payload['error'];
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>)['message'];
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }

    const message = payload['message'];
    if (upstreamStatus >= 400 && typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    return upstreamStatus >= 400 ? this.limitErrorText(rawText) : null;
  }

  private extractThrownErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return sanitizeTextForLog(error.message);
    }
    return '上游请求失败';
  }

  private normalizeUpstreamError(
    payload: Record<string, unknown> | null,
    rawText: string,
    upstreamStatus: number,
  ) {
    const errorMessage =
      this.extractErrorMessageFromPayload(payload, rawText, upstreamStatus) || '上游请求失败';
    let errorType = 'api_error';

    if (payload?.['error'] && typeof payload['error'] === 'object') {
      const type = (payload['error'] as Record<string, unknown>)['type'];
      if (typeof type === 'string' && type.trim().length > 0) {
        errorType = type;
      }
    }

    return {
      error: {
        type: errorType,
        message: errorMessage,
      },
    };
  }

  private toNonNegativeInt(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.trunc(parsed);
  }

  private limitErrorText(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    return sanitizeTextForLog(trimmed.slice(0, 500));
  }

  private async safeSettleMessage(
    context: Parameters<BillingService['settleMessage']>[0],
  ): Promise<void> {
    try {
      await this.billingService.settleMessage(context);
    } catch (error) {
      const message = this.extractThrownErrorMessage(error);
      console.error(`[billing] 请求结算失败 userId=${context.userId}: ${message}`);
    }
  }

  private async safeRefundMessageHold(
    context: Parameters<BillingService['refundMessageHold']>[0],
  ): Promise<void> {
    try {
      await this.billingService.refundMessageHold(context);
    } catch (error) {
      const message = this.extractThrownErrorMessage(error);
      console.error(`[billing] 请求退款失败 userId=${context.userId}: ${message}`);
    }
  }

  private async touchApiKeyLastUsedAt(apiKeyId: string) {
    try {
      await this.apiKeyService.touchLastUsedAt(apiKeyId);
    } catch (error) {
      const message = this.extractThrownErrorMessage(error);
      console.error(`[apikey] 更新 last_used_at 失败 apiKeyId=${apiKeyId}: ${message}`);
    }
  }
}
