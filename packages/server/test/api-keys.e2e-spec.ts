import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrismaService } from './helpers/fake-prisma';

async function getJwtToken(app: INestApplication, email: string) {
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

describe('Api Keys (e2e)', () => {
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

  it('create api key once and list masked keys', async () => {
    const token = await getJwtToken(app, 'key-user-1@test.com');

    const created = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'default' })
      .expect(201);

    expect(created.body.apiKey.startsWith('sk-tr-')).toBe(true);

    const listed = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(listed.body.items)).toBe(true);
    expect(listed.body.items[0].keyPrefix.startsWith('sk-tr-')).toBe(true);
    expect(listed.body.items[0].apiKey).toBeUndefined();
  });

  it('updates and deletes api key', async () => {
    const token = await getJwtToken(app, 'key-user-2@test.com');

    const created = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'to-update' })
      .expect(201);

    const keyId = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'renamed',
        isActive: false,
      })
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const updated = listed.body.items.find((item: any) => item.id === keyId);
    expect(updated).toBeTruthy();
    expect(updated.name).toBe('renamed');
    expect(updated.isActive).toBe(false);

    await request(app.getHttpServer())
      .delete(`/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const listedAfterDelete = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const found = listedAfterDelete.body.items.find((item: any) => item.id === keyId);
    expect(found).toBeUndefined();
  });
});
