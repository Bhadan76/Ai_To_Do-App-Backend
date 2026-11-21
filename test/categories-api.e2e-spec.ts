process.env.NODE_ENV = 'test';

import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/configure-app';
import {
  DEFAULT_CATEGORIES,
  seedDefaultCategories,
} from '../src/categories/seed-default-categories';
import { PrismaService } from '../src/prisma/prisma.service';

const connectionString = process.env.TEST_DATABASE_URL;
const integrationSuite = connectionString ? describe : describe.skip;

type AppModuleType = typeof import('../src/app.module').AppModule;

integrationSuite('Categories API (real PostgreSQL, e2e)', () => {
  let app: INestApplication<App>;
  let AppModule: AppModuleType;
  let prisma: PrismaService;
  let emailPrefix: string;
  const createdUserIds: string[] = [];

  async function register(suffix: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: `Category E2E ${suffix}`,
        email: `${emailPrefix}-${suffix}@example.test`,
        password: 'A-strong-passphrase-2026',
      })
      .expect(201);
    expect(res.body.success).toBe(true);
    const user = res.body.data.user as { id: string };
    createdUserIds.push(user.id);
    return user;
  }

  async function obtainToken(suffix: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `${emailPrefix}-${suffix}@example.test`,
        password: 'A-strong-passphrase-2026',
      })
      .expect(200);
    expect(res.body.success).toBe(true);
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
    }
    // Point the app at the approved test database before the app module is
    // loaded: the merged configuration prefers real environment variables
    // over the .env file, and the module resolves DATABASE_URL when it
    // imports.
    process.env.DATABASE_URL = connectionString;
    const { AppModule: ImportedAppModule } = await import('../src/app.module');
    AppModule = ImportedAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    emailPrefix = `cat-e2e-${randomBytes(8).toString('hex')}`;
  });

  afterAll(async () => {
    // Remove only the test users created by this spec; their categories are
    // deleted by the database cascade.
    for (const userId of createdUserIds) {
      await prisma
        ?.user.delete({ where: { id: userId } })
        .catch(() => undefined);
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  it('creates a category, lists it for the owner, rejects duplicates, and blocks foreign access', async () => {
    const owner = await register('owner');
    const ownerToken = await obtainToken('owner');
    await register('other');
    const otherToken = await obtainToken('other');

    // Unauthenticated calls are rejected.
    await request(app.getHttpServer()).post('/api/v1/categories').expect(401);

    // Empty category names are rejected.
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: '   ' })
      .expect(400);

    // Create a category as the owner.
    const created = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'My Custom Category' })
      .expect(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data).toMatchObject({ name: 'My Custom Category' });
    expect(created.body.data).not.toHaveProperty('userId');

    // The created category belongs to the authenticated user.
    const category = await prisma.category.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(category).toMatchObject({
      name: 'My Custom Category',
      userId: owner.id,
    });

    // The owner's list contains it.
    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.success).toBe(true);
    const ownerIds = list.body.data.items.map((item: { id: string }) => item.id);
    expect(ownerIds).toContain(created.body.data.id);

    // Duplicate category names are rejected with a conflict.
    await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'My Custom Category' })
      .expect(409);

    // Another user cannot read the category.
    const foreign = await request(app.getHttpServer())
      .get(`/api/v1/categories/${created.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    expect(foreign.body.success).toBe(false);

    // Another user's list does not include it.
    const otherList = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    const otherIds = otherList.body.data.items.map(
      (item: { id: string }) => item.id,
    );
    expect(otherIds).not.toContain(created.body.data.id);
  });

  it('seeds the default categories idempotently', async () => {
    await register('seed');
    const seedToken = await obtainToken('seed');

    await expect(seedDefaultCategories(prisma)).resolves.toBeGreaterThanOrEqual(
      0,
    );
    // A second run must not create anything new.
    await expect(seedDefaultCategories(prisma)).resolves.toBe(0);

    const list = await request(app.getHttpServer())
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${seedToken}`)
      .expect(200);
    const names = list.body.data.items.map((item: { name: string }) => item.name);
    for (const name of DEFAULT_CATEGORIES) {
      expect(names).toContain(name);
    }
  }, 60000);
});
