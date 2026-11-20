import { randomBytes } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { CategoriesService } from '../src/categories/categories.service';
import { AuthService } from '../src/auth/auth.service';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from '../src/auth/dto/register.dto';

const connectionString = process.env.TEST_DATABASE_URL;
const integrationSuite = connectionString ? describe : describe.skip;

integrationSuite('Category API (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let categories: CategoriesService;
  let emailPrefix: string;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
    }

    const url = new URL(connectionString);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (
      databaseName !== 'daily_task_test_db' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      (url.port || '5432') !== '5432'
    ) {
      throw new Error('TEST_DATABASE_URL does not match the approved test database.');
    }

    const config = {
      getOrThrow: (key: string) => {
        if (key === 'DATABASE_URL') return connectionString;
        if (key === 'JWT_ACCESS_TOKEN_TTL') return '15m';
        if (key === 'REFRESH_TOKEN_TTL_DAYS') return 30;
        throw new Error(`Unexpected test configuration key: ${key}`);
      },
    } as unknown as ConfigService;

    prisma = new PrismaService(config);
    await prisma.$connect();
    categories = new CategoriesService(prisma);
    emailPrefix = `pg-category-${randomBytes(8).toString('hex')}`;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function registerUser(suffix: string) {
    const auth = new AuthService(
      prisma,
      new JwtService({ secret: 'integration-test-secret-at-least-32-bytes' }),
      new RefreshTokenService(
        prisma,
        { getOrThrow: () => 30 } as unknown as ConfigService,
      ),
      {
        getOrThrow: () => '15m',
      } as unknown as ConfigService,
    );
    return auth.register({
      name: 'Category Integration User',
      email: `${emailPrefix}-${suffix}@example.test`,
      password: 'A-strong-passphrase-2026',
    } as RegisterDto);
  }

  it('creates, reads, lists, updates, and deletes only owner categories', async () => {
    const owner = await registerUser('owner');
    const other = await registerUser('other');
    const created = await categories.create(owner.user.id, {
      name: 'Work',
      color: '#2563EB',
    });

    expect(created).toMatchObject({
      name: 'Work',
      color: '#2563EB',
    });
    expect(created).not.toHaveProperty('userId');

    await expect(
      categories.create(other.user.id, { name: 'Work' }),
    ).resolves.toBeDefined();

    const listed = await categories.list(owner.user.id, {});
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0].id).toBe(created.id);

    await expect(
      categories.findById(other.user.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    const updated = await categories.update(owner.user.id, created.id, {
      name: 'Personal',
      color: null,
    });
    expect(updated).toMatchObject({ name: 'Personal', color: null });

    await expect(
      categories.update(other.user.id, created.id, { name: 'Hijacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await categories.remove(owner.user.id, created.id);
    await expect(
      categories.remove(other.user.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      categories.findById(owner.user.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces the per-user duplicate constraint and maps it to conflict', async () => {
    const owner = await registerUser('duplicate');
    await categories.create(owner.user.id, { name: 'Finance' });

    await expect(
      categories.create(owner.user.id, { name: 'Finance' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves associated tasks and detaches them when a category is deleted', async () => {
    const owner = await registerUser('tasks');
    const category = await categories.create(owner.user.id, {
      name: 'Project',
    });
    const task = await prisma.task.create({
      data: {
        title: 'Task in category',
        userId: owner.user.id,
        categoryId: category.id,
      },
    });

    await categories.remove(owner.user.id, category.id);

    const detachedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(detachedTask.categoryId).toBeNull();
  });
});
