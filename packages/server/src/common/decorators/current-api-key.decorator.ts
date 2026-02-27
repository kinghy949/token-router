import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentApiKeyPayload {
  userId: string;
  apiKeyId: string;
}

export const CurrentApiKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentApiKeyPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKeyContext as CurrentApiKeyPayload;
  },
);
