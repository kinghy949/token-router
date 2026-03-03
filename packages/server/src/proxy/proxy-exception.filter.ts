import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

interface AnthropicErrorBody {
  error: {
    type: string;
    message: string;
  };
}

@Catch()
export class ProxyExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.buildErrorBody(exception, status);
    response.status(status).json(body);
  }

  private buildErrorBody(exception: unknown, status: number): AnthropicErrorBody {
    if (exception instanceof HttpException) {
      const raw = exception.getResponse() as unknown;
      const normalized = this.normalizeExistingError(raw);
      if (normalized) {
        const normalizedType =
          normalized.error.type === 'api_error'
            ? this.mapErrorType(exception, status)
            : normalized.error.type;
        return {
          error: {
            type: normalizedType,
            message: normalized.error.message,
          },
        };
      }
    }

    return {
      error: {
        type: this.mapErrorType(exception, status),
        message: this.mapMessage(exception, status),
      },
    };
  }

  private normalizeExistingError(value: unknown): AnthropicErrorBody | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const data = value as Record<string, unknown>;
    const nested = data['error'];
    if (nested && typeof nested === 'object') {
      const errorData = nested as Record<string, unknown>;
      const type = typeof errorData['type'] === 'string' ? errorData['type'] : undefined;
      const message =
        typeof errorData['message'] === 'string' ? errorData['message'] : this.extractMessage(data);
      if (message) {
        return {
          error: {
            type: type || 'api_error',
            message,
          },
        };
      }
    }

    const message = this.extractMessage(data);
    if (!message) {
      return null;
    }

    return {
      error: {
        type: 'api_error',
        message,
      },
    };
  }

  private extractMessage(data: Record<string, unknown>): string | null {
    const raw = data['message'];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw;
    }
    if (Array.isArray(raw)) {
      const texts = raw.filter((item): item is string => typeof item === 'string');
      if (texts.length > 0) {
        return texts.join('; ');
      }
    }
    return null;
  }

  private mapErrorType(exception: unknown, status: number): string {
    if (exception instanceof UnauthorizedException || status === HttpStatus.UNAUTHORIZED) {
      return 'authentication_error';
    }
    if (exception instanceof ForbiddenException || status === HttpStatus.FORBIDDEN) {
      return 'permission_error';
    }
    if (exception instanceof BadRequestException || status === HttpStatus.BAD_REQUEST) {
      return 'invalid_request_error';
    }
    if (status === HttpStatus.PAYMENT_REQUIRED) {
      return 'insufficient_balance_error';
    }
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return 'rate_limit_error';
    }
    if (
      exception instanceof ServiceUnavailableException ||
      exception instanceof GatewayTimeoutException ||
      status === HttpStatus.BAD_GATEWAY ||
      status === HttpStatus.SERVICE_UNAVAILABLE ||
      status === HttpStatus.GATEWAY_TIMEOUT
    ) {
      return 'api_error';
    }
    return 'api_error';
  }

  private mapMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse() as unknown;
      if (typeof response === 'string' && response.trim().length > 0) {
        return response;
      }
      if (response && typeof response === 'object') {
        const message = this.extractMessage(response as Record<string, unknown>);
        if (message) {
          return message;
        }
      }
      return exception.message || this.defaultMessage(status);
    }

    if (exception instanceof Error && exception.message.trim().length > 0) {
      return exception.message;
    }
    return this.defaultMessage(status);
  }

  private defaultMessage(status: number): string {
    if (status === HttpStatus.UNAUTHORIZED) {
      return '鉴权失败';
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return '请求参数无效';
    }
    if (status === HttpStatus.PAYMENT_REQUIRED) {
      return '余额不足';
    }
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return '上游服务暂不可用';
    }
    if (status === HttpStatus.BAD_GATEWAY) {
      return '上游服务请求失败';
    }
    return '请求处理失败';
  }
}
