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
    .send({ name: 'admin-e2e' })
    .expect(201);

  return created.body.apiKey as string;
}

describe('Admin (e2e)', () => {
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

  it('lists redeem codes with used filter', async () => {
    const userToken = await registerAndLogin(app, 'admin-redeem-user@test.com');
    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: 'admin-list-redeem',
      email: 'admin-list-redeem@test.com',
      isAdmin: true,
    });

    const created = await request(app.getHttpServer())
      .post('/admin/redeem-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tokenAmount: 1000, count: 2 })
      .expect(201);

    const firstCode = created.body.items[0].code as string;
    await request(app.getHttpServer())
      .post('/redeem')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code: firstCode })
      .expect(201);

    const all = await request(app.getHttpServer())
      .get('/admin/redeem-codes?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(all.body.total).toBe(2);
    expect(all.body.items).toHaveLength(2);

    const used = await request(app.getHttpServer())
      .get('/admin/redeem-codes?used=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(used.body.total).toBe(1);
    expect(used.body.items[0].redeemedBy).toBeTruthy();

    const unused = await request(app.getHttpServer())
      .get('/admin/redeem-codes?used=false')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(unused.body.total).toBe(1);
    expect(unused.body.items[0].redeemedBy).toBeNull();
  });

  it('lists usage logs with model filter', async () => {
    const userToken = await registerAndLogin(app, 'admin-usage-user@test.com');
    const apiKey = await createApiKey(app, userToken);
    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: 'admin-list-usage',
      email: 'admin-list-usage@test.com',
      isAdmin: true,
    });

    const createdCode = await request(app.getHttpServer())
      .post('/admin/redeem-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tokenAmount: 2000, count: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/redeem')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code: createdCode.body.items[0].code })
      .expect(201);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_admin_usage_1',
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
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 2000,
      })
      .expect(200);

    const logs = await request(app.getHttpServer())
      .get('/admin/usage-logs?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(logs.body.total).toBe(1);
    expect(logs.body.items).toHaveLength(1);
    expect(logs.body.items[0].model).toBe('claude-3-5-sonnet-20241022');
    expect(logs.body.items[0].provider).toBe('anthropic');

    const filtered = await request(app.getHttpServer())
      .get('/admin/usage-logs?model=not-exists-model')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(filtered.body.total).toBe(0);
    expect(filtered.body.items).toHaveLength(0);
  });
});
