import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

async function registerAndLogin(app: INestApplication, email: string) {
  const register = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'secret123' })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'secret123' })
    .expect(201);

  return {
    token: login.body.access_token as string,
    userId: register.body.id as string,
    email: register.body.email as string,
  };
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
  let fakePrisma: FakePrismaService;

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
    fakePrisma = app.get(PrismaService) as unknown as FakePrismaService;
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(async () => {
    fetchSpy.mockRestore();
    await app.close();
  });

  it('lists redeem codes with used filter', async () => {
    const user = await registerAndLogin(app, 'admin-redeem-user@test.com');
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
      .set('Authorization', `Bearer ${user.token}`)
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
    const user = await registerAndLogin(app, 'admin-usage-user@test.com');
    const apiKey = await createApiKey(app, user.token);
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
      .set('Authorization', `Bearer ${user.token}`)
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

  it('lists users with pagination and email search and forbids non-admin access', async () => {
    const alice = await registerAndLogin(app, 'admin-user-alice@test.com');
    await registerAndLogin(app, 'admin-user-bob@test.com');
    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: 'admin-list-users',
      email: 'admin-list-users@test.com',
      isAdmin: true,
    });

    const list = await request(app.getHttpServer())
      .get('/admin/users?page=1&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(list.body.page).toBe(1);
    expect(list.body.pageSize).toBe(1);
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    expect(list.body.items).toHaveLength(1);
    expect(typeof list.body.items[0].balance).toBe('number');
    expect(list.body.items[0].usageSummary).toBeDefined();

    const searched = await request(app.getHttpServer())
      .get('/admin/users?q=alice@test.com')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const hit = searched.body.items.find((item: { email: string }) =>
      item.email.includes('admin-user-alice@test.com'),
    );
    expect(hit).toBeDefined();

    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(403);
  });

  it('gets user detail with balance and usage summary', async () => {
    const target = await registerAndLogin(app, 'admin-detail-target@test.com');
    const admin = await registerAndLogin(app, 'admin-detail-operator@test.com');
    await fakePrisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });

    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: admin.userId,
      email: admin.email,
      isAdmin: true,
    });

    const redeemCode = await request(app.getHttpServer())
      .post('/admin/redeem-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tokenAmount: 3000, count: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/redeem')
      .set('Authorization', `Bearer ${target.token}`)
      .send({ code: redeemCode.body.items[0].code })
      .expect(201);

    const apiKey = await createApiKey(app, target.token);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_admin_detail_1',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 7, output_tokens: 3 },
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
        messages: [{ role: 'user', content: 'detail' }],
        max_tokens: 512,
      })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/admin/users/${target.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detail.body.id).toBe(target.userId);
    expect(detail.body.email).toBe(target.email);
    expect(typeof detail.body.balance).toBe('number');
    expect(detail.body.usageSummary.requestCount).toBeGreaterThanOrEqual(1);
    expect(detail.body.usageSummary.totalCost).toBeGreaterThan(0);
  });

  it('updates user state and role, and prevents removing the last admin', async () => {
    const target = await registerAndLogin(app, 'admin-update-target@test.com');
    const admin = await registerAndLogin(app, 'admin-update-operator@test.com');
    await fakePrisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });

    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: admin.userId,
      email: admin.email,
      isAdmin: true,
    });

    const updated = await request(app.getHttpServer())
      .patch(`/admin/users/${target.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false, isAdmin: true })
      .expect(200);

    expect(updated.body.id).toBe(target.userId);
    expect(updated.body.isActive).toBe(false);
    expect(updated.body.isAdmin).toBe(true);

    await request(app.getHttpServer())
      .patch(`/admin/users/${target.userId}`)
      .set('Authorization', `Bearer ${target.token}`)
      .send({ isActive: true })
      .expect(403);

    const state = fakePrisma.inspectState();
    for (const user of state.users) {
      if (user.id !== admin.userId && user.isAdmin) {
        await fakePrisma.user.update({ where: { id: user.id }, data: { isAdmin: false } });
      }
    }

    await request(app.getHttpServer())
      .patch(`/admin/users/${admin.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAdmin: false })
      .expect(400);
  });

  it('adjusts user balance and writes admin_adjust transaction', async () => {
    const target = await registerAndLogin(app, 'admin-balance-target@test.com');
    const admin = await registerAndLogin(app, 'admin-balance-operator@test.com');
    await fakePrisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });

    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: admin.userId,
      email: admin.email,
      isAdmin: true,
    });

    const increased = await request(app.getHttpServer())
      .patch(`/admin/users/${target.userId}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 1200, description: '人工补偿' })
      .expect(200);

    expect(increased.body.balance).toBe(1200);
    expect(increased.body.amount).toBe(1200);

    const decreased = await request(app.getHttpServer())
      .patch(`/admin/users/${target.userId}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: -200, description: '扣减测试' })
      .expect(200);

    expect(decreased.body.balance).toBe(1000);
    expect(decreased.body.amount).toBe(-200);

    await request(app.getHttpServer())
      .patch(`/admin/users/${target.userId}/balance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: -2000, description: '扣减过量' })
      .expect(400);

    const transactions = await request(app.getHttpServer())
      .get('/transactions')
      .set('Authorization', `Bearer ${target.token}`)
      .expect(200);

    const latest = transactions.body.items[0];
    expect(latest.type).toBe('admin_adjust');
    expect(typeof latest.description).toBe('string');
  });

  it('returns platform stats with required aggregate fields', async () => {
    const admin = await registerAndLogin(app, 'admin-stats-operator@test.com');
    await fakePrisma.user.update({ where: { id: admin.userId }, data: { isAdmin: true } });
    const user = await registerAndLogin(app, 'admin-stats-user@test.com');
    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: admin.userId,
      email: admin.email,
      isAdmin: true,
    });

    const before = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const apiKey = await createApiKey(app, user.token);
    const createdCodes = await request(app.getHttpServer())
      .post('/admin/redeem-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tokenAmount: 1000, count: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/redeem')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ code: createdCodes.body.items[0].code })
      .expect(201);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_admin_stats_1',
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 11, output_tokens: 6 },
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
        messages: [{ role: 'user', content: 'stats' }],
        max_tokens: 700,
      })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(after.body.usersTotal).toBeGreaterThanOrEqual(before.body.usersTotal);
    expect(after.body.activeApiKeys).toBeGreaterThanOrEqual(before.body.activeApiKeys + 1);
    expect(after.body.redeemCodes.used).toBeGreaterThanOrEqual(before.body.redeemCodes.used + 1);
    expect(after.body.redeemCodes.unused).toBeGreaterThanOrEqual(before.body.redeemCodes.unused + 1);
    expect(after.body.totalCost).toBeGreaterThanOrEqual(before.body.totalCost);
  });
});
