import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function createExecutionContext(headers: Record<string, string>): ExecutionContext {
  const request: any = {
    headers,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  it('accepts x-api-key and resolves active key owner', async () => {
    const rawKey = 'sk-tr-abc123';
    const prisma = {
      apiKey: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'k1',
          userId: 'u1',
          isActive: true,
          user: { id: 'u1', isActive: true },
        }),
      },
    } as any;

    const guard = new ApiKeyGuard(prisma, {
      assertWithinLimit: jest.fn().mockResolvedValue(undefined),
    } as any);
    const context = createExecutionContext({ 'x-api-key': rawKey });

    const ok = await guard.canActivate(context);

    expect(ok).toBe(true);
    const request = context.switchToHttp().getRequest() as any;
    expect(request.apiKeyContext).toEqual({ userId: 'u1', apiKeyId: 'k1' });
  });

  it('rejects when key is missing', async () => {
    const guard = new ApiKeyGuard(
      { apiKey: { findUnique: jest.fn() } } as any,
      { assertWithinLimit: jest.fn().mockResolvedValue(undefined) } as any,
    );

    await expect(guard.canActivate(createExecutionContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
