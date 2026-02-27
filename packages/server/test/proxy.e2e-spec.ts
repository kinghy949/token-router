import { INestApplication } from '@nestjs/common';
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

  return created.body.apiKey as string;
}

describe('Proxy (e2e)', () => {
  let app: INestApplication;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
    fetchSpy = jest.spyOn(global, 'fetch');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(async () => {
    fetchSpy.mockRestore();
    await app.close();
  });

  it('forwards non-stream message to anthropic', async () => {
    const apiKey = await createApiKey(app, 'proxy-user-1@test.com');

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
        max_tokens: 16,
      })
      .expect(200);

    expect(response.body.id).toBe('msg_1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('streams SSE response from anthropic', async () => {
    const apiKey = await createApiKey(app, 'proxy-user-2@test.com');
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: message_start\ndata: {"type":"message_start"}\n\n' +
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
        max_tokens: 16,
        stream: true,
      })
      .expect(200)
      .expect('content-type', /text\/event-stream/);

    expect(response.text).toContain('message_start');
    expect(response.text).toContain('message_stop');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
