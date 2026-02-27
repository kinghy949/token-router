import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

describe('Auth (e2e)', () => {
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

  it('register -> login -> me', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'u@test.com', password: 'secret123' })
      .expect(201);

    expect(register.body.email).toBe('u@test.com');

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'u@test.com', password: 'secret123' })
      .expect(201);

    const token = login.body.access_token;
    expect(token).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.email).toBe('u@test.com');
  });

  it('updates password with correct old password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'pwd@test.com', password: 'secret123' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'pwd@test.com', password: 'secret123' })
      .expect(201);

    const token = login.body.access_token as string;

    await request(app.getHttpServer())
      .put('/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        oldPassword: 'secret123',
        newPassword: 'newsecret123',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'pwd@test.com', password: 'secret123' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'pwd@test.com', password: 'newsecret123' })
      .expect(201);
  });
});
