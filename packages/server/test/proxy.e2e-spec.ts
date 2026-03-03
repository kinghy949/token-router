import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

async function createApiKey(app: INestApplication, email: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'secret123' })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'secret123' })
    .expect(201);

  const token = login.body.access_token as string;

  const created = await request(app.getHttpServer())
    .post('/api-keys')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'proxy' })
    .expect(201);

  return {
    apiKey: created.body.apiKey as string,
    userToken: token,
  };
}

async function grantTokens(app: INestApplication, userToken: string, tokenAmount: number) {
  const jwtService = app.get(JwtService);
  const adminToken = jwtService.sign({
    sub: 'admin-proxy',
    email: 'admin-proxy@test.com',
    isAdmin: true,
  });

  const createCode = await request(app.getHttpServer())
    .post('/admin/redeem-codes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ tokenAmount, count: 1 })
    .expect(201);

  const code = createCode.body.items[0].code as string;

  await request(app.getHttpServer())
    .post('/redeem')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ code })
    .expect(201);
}

describe('Proxy (e2e)', () => {
  let app: INestApplication;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
    process.env.INPUT_TOKEN_PRICE = '1';
    process.env.OUTPUT_TOKEN_PRICE = '5';
    fetchSpy = jest.spyOn(global, 'fetch');
    fakePrisma = new FakePrismaService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    fetchSpy.mockReset();
    delete process.env.PROVIDER_PRIORITY;
    delete process.env.BEDROCK_BASE_URL;
    delete process.env.BEDROCK_API_KEY;
    delete process.env.VERTEX_BASE_URL;
    delete process.env.VERTEX_API_KEY;
    delete process.env.RATE_LIMIT_PER_MINUTE;
  });

  afterAll(async () => {
    fetchSpy.mockRestore();
    await app.close();
  });

  it('forwards non-stream message to anthropic and settles by actual usage', async () => {
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-1@test.com');
    await grantTokens(app, userToken, 2000);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2000,
      })
      .expect(200);

    expect(response.body.id).toBe('msg_1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const balance = await request(app.getHttpServer())
      .get('/balance')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(balance.body.tokens).toBe(1994);

    const state = fakePrisma.inspectState();
    const usageLog = state.usageLogs[state.usageLogs.length - 1];
    expect(usageLog).toBeTruthy();
    expect(usageLog.totalCost).toBe(BigInt(6));
    expect(usageLog.upstreamStatus).toBe(200);
    expect(usageLog.errorMessage).toBeNull();
  });

  it('returns 402 when balance is insufficient for precharge', async () => {
    const { apiKey } = await createApiKey(app, 'proxy-user-3@test.com');

    await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 16,
      })
      .expect(402);

    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('streams SSE response from anthropic', async () => {
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-2@test.com');
    await grantTokens(app, userToken, 2000);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n' +
              'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":5}}\n\n' +
              'event: message_stop\ndata: {"type":"message_stop"}\n\n',
          ),
        );
        controller.close();
      },
    });

    fetchSpy.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2000,
        stream: true,
      })
      .expect(200)
      .expect('content-type', /text\/event-stream/);

    expect(response.text).toContain('message_start');
    expect(response.text).toContain('message_stop');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const balance = await request(app.getHttpServer())
      .get('/balance')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(balance.body.tokens).toBe(1994);
  });

  it('refunds full hold when upstream returns error response', async () => {
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-4@test.com');
    await grantTokens(app, userToken, 2000);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { type: 'api_error', message: '上游繁忙' },
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 16,
      })
      .expect(500);

    const balance = await request(app.getHttpServer())
      .get('/balance')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(balance.body.tokens).toBe(2000);

    const state = fakePrisma.inspectState();
    const usageLog = state.usageLogs[state.usageLogs.length - 1];
    expect(usageLog).toBeTruthy();
    expect(usageLog.totalCost).toBe(BigInt(0));
    expect(usageLog.upstreamStatus).toBe(500);
    expect(usageLog.errorMessage).toContain('上游繁忙');
  });

  it('fails over to next provider when primary upstream is unavailable', async () => {
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-failover@test.com');
    await grantTokens(app, userToken, 2000);
    process.env.PROVIDER_PRIORITY = 'anthropic,bedrock';
    process.env.BEDROCK_BASE_URL = 'https://bedrock.example.com';
    process.env.BEDROCK_API_KEY = 'bedrock-test-key';

    fetchSpy.mockResolvedValueOnce(
      new Response('anthropic unavailable', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'bedrock_msg_1',
          modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          output: {
            message: {
              content: [{ type: 'text', text: 'hello from bedrock' }],
            },
          },
          usage: {
            inputTokens: 8,
            outputTokens: 4,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'failover' }],
        max_tokens: 2000,
      })
      .expect(200);

    expect(response.body.id).toBe('bedrock_msg_1');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const state = fakePrisma.inspectState();
    const usageLog = state.usageLogs[state.usageLogs.length - 1];
    expect(usageLog.provider).toBe('bedrock');
  });

  it('updates api key lastUsedAt after proxy call succeeds', async () => {
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-last-used@test.com');
    await grantTokens(app, userToken, 2000);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_last_used_1',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'touch last used' }],
        max_tokens: 512,
      })
      .expect(200);

    const apiKeys = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(apiKeys.body.items[0].lastUsedAt).toBeTruthy();
  });

  it('returns anthropic-style error body on authentication and validation errors', async () => {
    const noAuth = await request(app.getHttpServer())
      .post('/v1/messages')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'missing key' }],
        max_tokens: 100,
      })
      .expect(401);

    expect(noAuth.body).toEqual({
      error: {
        type: 'authentication_error',
        message: 'API Key 无效',
      },
    });

    const { apiKey } = await createApiKey(app, 'proxy-user-invalid-params@test.com');

    const invalid = await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'bad max tokens' }],
        max_tokens: 0,
      })
      .expect(400);

    expect(invalid.body.error.type).toBe('invalid_request_error');
    expect(typeof invalid.body.error.message).toBe('string');
  });

  it('returns anthropic-style error body on upstream failure', async () => {
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-upstream-error@test.com');
    await grantTokens(app, userToken, 2000);

    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    const failed = await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'upstream failure' }],
        max_tokens: 200,
      })
      .expect(502);

    expect(failed.body.error.type).toBe('api_error');
    expect(typeof failed.body.error.message).toBe('string');
  });

  it('returns 429 when api key rate limit is exceeded', async () => {
    process.env.RATE_LIMIT_PER_MINUTE = '1';
    const { apiKey, userToken } = await createApiKey(app, 'proxy-user-rate-limit@test.com');
    await grantTokens(app, userToken, 2000);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_rate_limit_1',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 5, output_tokens: 2 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'first request' }],
        max_tokens: 128,
      })
      .expect(200);

    const limited = await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'second request' }],
        max_tokens: 128,
      })
      .expect(429);

    expect(limited.body.error.type).toBe('rate_limit_error');
    expect(typeof limited.body.error.message).toBe('string');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
