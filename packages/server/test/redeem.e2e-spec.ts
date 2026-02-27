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

describe('Redeem (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin creates redeem code and user redeems once', async () => {
    const userToken = await registerAndLogin(app, 'redeem-user@test.com');

    const jwtService = app.get(JwtService);
    const adminToken = jwtService.sign({
      sub: 'admin-1',
      email: 'admin@test.com',
      isAdmin: true,
    });

    const created = await request(app.getHttpServer())
      .post('/admin/redeem-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tokenAmount: 1000, count: 1 })
      .expect(201);

    const code = created.body.items[0].code;
    expect(code.startsWith('TR-')).toBe(true);

    await request(app.getHttpServer())
      .post('/redeem')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code })
      .expect(201);

    const balance = await request(app.getHttpServer())
      .get('/balance')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(balance.body.tokens).toBe(1000);

    await request(app.getHttpServer())
      .post('/redeem')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code })
      .expect(400);
  });
});
