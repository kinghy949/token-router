import { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/app-config';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

describe('Http Config (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.WEB_URL = 'http://localhost:8080';
    process.env.REQUEST_BODY_LIMIT = '10mb';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication(new ExpressAdapter(), { bodyParser: false });
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.WEB_URL;
    delete process.env.REQUEST_BODY_LIMIT;
    await app.close();
  });

  it('allows configured web origin and blocks unconfigured origin', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:8080')
      .expect(200);

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8080');

    const blocked = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://evil.example.com')
      .expect(200);

    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns 413 when request body exceeds configured size limit', async () => {
    const hugePassword = 'p'.repeat(11 * 1024 * 1024);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'too-big@test.com', password: hugePassword })
      .expect(413);
  });
});
