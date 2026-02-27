import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

async function getJwtToken(app: INestApplication) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email: 'balance-user@test.com', password: 'secret123' })
    .expect(201);

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'balance-user@test.com', password: 'secret123' })
    .expect(201);

  return login.body.access_token as string;
}

describe('Balance (e2e)', () => {
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

  it('returns current balance for authenticated user', async () => {
    const token = await getJwtToken(app);

    const response = await request(app.getHttpServer())
      .get('/balance')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(typeof response.body.tokens).toBe('number');
    expect(response.body.tokens).toBe(0);
  });
});
