import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

async function registerAndLogin(app: INestApplication, email: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'secret123' })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'secret123' })
    .expect(201);

  return login.body.access_token as string;
}

async function createApiKey(app: INestApplication, userToken: string) {
  const created = await request(app.getHttpServer())
    .post('/api-keys')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ name: 'default' })
    .expect(201);

  return created.body.apiKey as string;
}

async function grantTokens(app: INestApplication, userToken: string, tokenAmount: number) {
  const jwtService = app.get(JwtService);
  const adminToken = jwtService.sign({
    sub: 'admin-billing',
    email: 'admin-billing@test.com',
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

describe('Billing Records (e2e)', () => {
  let app: INestApplication;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
    process.env.INPUT_TOKEN_PRICE = '1';
    process.env.OUTPUT_TOKEN_PRICE = '5';
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

  it('returns paginated transactions for current user', async () => {
    const token = await registerAndLogin(app, 'ledger-user@test.com');
    const apiKey = await createApiKey(app, token);
    await grantTokens(app, token, 2000);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_ledger_1',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2000,
      })
      .expect(200);

    const page1 = await request(app.getHttpServer())
      .get('/transactions?page=1&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page1.body.total).toBeGreaterThanOrEqual(3);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.items[0]).toHaveProperty('id');
    expect(page1.body.items[0]).toHaveProperty('type');
    expect(page1.body.items[0]).toHaveProperty('amount');
    expect(page1.body.items[0]).toHaveProperty('balanceAfter');

    const page2 = await request(app.getHttpServer())
      .get('/transactions?page=2&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(page2.body.page).toBe(2);
    expect(page2.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('returns usage summary and supports model filter', async () => {
    const token = await registerAndLogin(app, 'usage-user@test.com');
    const apiKey = await createApiKey(app, token);
    await grantTokens(app, token, 2000);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_usage_1',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await request(app.getHttpServer())
      .post('/v1/messages')
      .set('x-api-key', apiKey)
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 2000,
      })
      .expect(200);

    const usage = await request(app.getHttpServer())
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(usage.body.summary.count).toBe(1);
    expect(usage.body.summary.inputTokens).toBe(10);
    expect(usage.body.summary.outputTokens).toBe(5);
    expect(usage.body.summary.totalCost).toBe(6);
    expect(usage.body.items).toHaveLength(1);
    expect(usage.body.items[0].model).toBe('claude-3-5-sonnet-20241022');

    const filtered = await request(app.getHttpServer())
      .get('/usage?model=claude-3-7-sonnet-20250219')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(filtered.body.summary.count).toBe(0);
    expect(filtered.body.items).toHaveLength(0);
  });
});
