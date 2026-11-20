import { randomBytes } from 'node:crypto';
import {
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';
import { AuthService } from '../src/auth/auth.service';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from '../src/auth/dto/register.dto';

const connectionString = process.env.TEST_DATABASE_URL;
const integrationSuite = connectionString ? describe : describe.skip;

integrationSuite('Task API (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let tasks: TasksService;
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
    tasks = new TasksService(prisma);
    emailPrefix = `pg-task-${randomBytes(8).toString('hex')}`;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const registerUser = async (suffix: string) => {
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
      name: 'Task Integration User',
      email: `${emailPrefix}-${suffix}@example.test`,
      password: 'A-strong-passphrase-2026',
    } as RegisterDto);
  };

  it('creates, reads, lists, updates, and deletes only owner tasks', async () => {
    const owner = await registerUser('owner');
    const other = await registerUser('other');

    const category = await prisma.category.create({
      data: { name: 'Task Category', userId: owner.user.id },
    });

    const created = await tasks.create(owner.user.id, {
      title: 'Buy groceries',
      description: 'Buy milk and eggs',
      priority: 'HIGH',
      status: 'TODO',
      dueDate: '2026-12-01T09:00:00Z',
      categoryId: category.id,
    });

    expect(created).toMatchObject({
      title: 'Buy groceries',
      description: 'Buy milk and eggs',
      priority: 'HIGH',
      status: 'TODO',
    });
    expect(created).not.toHaveProperty('userId');

    // Other user can create a category with the same name
    await expect(
      tasks.create(other.user.id, {
        title: 'Buy groceries',
      }),
    ).resolves.toBeDefined();

    const listed = await tasks.list(owner.user.id, {});
    expect(listed.items.length).toBeGreaterThanOrEqual(1);
    expect(listed.items.some((item) => item.id === created.id)).toBe(true);

    // Other user cannot read owner's task
    await expect(
      tasks.findById(other.user.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Update owner's task
    const updated = await tasks.update(owner.user.id, created.id, {
      title: 'Buy groceries and milk',
      status: 'COMPLETED',
    });
    expect(updated).toMatchObject({
      title: 'Buy groceries and milk',
      status: 'COMPLETED',
    });
    expect(updated.completedAt).not.toBeNull();

    // Other user cannot update owner's task
    await expect(
      tasks.update(other.user.id, created.id, { title: 'Hijacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Other user cannot delete owner's task
    await expect(
      tasks.remove(other.user.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Owner deletes task
    await tasks.remove(owner.user.id, created.id);
    await expect(
      tasks.findById(owner.user.id, created.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects cross-user category assignment', async () => {
    const owner = await registerUser('category-owner');
    const other = await registerUser('category-other');

    const category = await prisma.category.create({
      data: { name: 'Foreign Category', userId: owner.user.id },
    });

    // Other user cannot assign owner's category to their task
    await expect(
      tasks.create(other.user.id, {
        title: 'Task with foreign category',
        categoryId: category.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears category assignment when categoryId is null', async () => {
    const owner = await registerUser('clear-category');
    const category = await prisma.category.create({
      data: { name: 'Clear Category', userId: owner.user.id },
    });

    const created = await tasks.create(owner.user.id, {
      title: 'Categorized task',
      categoryId: category.id,
    });
    expect(created.categoryId).toBe(category.id);

    const cleared = await tasks.update(owner.user.id, created.id, {
      categoryId: null,
    });
    expect(cleared.categoryId).toBeNull();
  });

  it('sets task.categoryId to null when category is deleted', async () => {
    const owner = await registerUser('category-delete');
    const category = await prisma.category.create({
      data: { name: 'Delete Category', userId: owner.user.id },
    });
    const task = await prisma.task.create({
      data: {
        title: 'Task in category',
        userId: owner.user.id,
        categoryId: category.id,
      },
    });

    await prisma.category.delete({
      where: { id: category.id },
    });

    const detachedTask = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(detachedTask.categoryId).toBeNull();
  });

  it('filters by status and priority', async () => {
    const owner = await registerUser('filter');
    await tasks.create(owner.user.id, {
      title: 'High priority task',
      priority: 'HIGH',
      status: 'TODO',
    });
    await tasks.create(owner.user.id, {
      title: 'Low priority task',
      priority: 'LOW',
      status: 'COMPLETED',
    });

    const highPriority = await tasks.list(owner.user.id, {
      priority: 'HIGH',
    });
    expect(highPriority.items.every((item) => item.priority === 'HIGH')).toBe(
      true,
    );

    const completed = await tasks.list(owner.user.id, {
      status: 'COMPLETED',
    });
    expect(
      completed.items.every((item) => item.status === 'COMPLETED'),
    ).toBe(true);
  });

  it('supports pagination with bounds', async () => {
    const owner = await registerUser('pagination');
    for (let i = 0; i < 5; i++) {
      await tasks.create(owner.user.id, {
        title: `Task ${i}`,
      });
    }

    const firstPage = await tasks.list(owner.user.id, {
      page: 1,
      pageSize: 2,
    });
    expect(firstPage.items.length).toBeLessThanOrEqual(2);
    expect(firstPage.page).toBe(1);
    expect(firstPage.pageSize).toBe(2);

    const oversized = await tasks.list(owner.user.id, {
      pageSize: 500,
    });
    expect(oversized.pageSize).toBeLessThanOrEqual(100);
  });

  it('completedAt transitions correctly', async () => {
    const owner = await registerUser('completed-at');

    const incomplete = await tasks.create(owner.user.id, {
      title: 'Not completed',
      status: 'TODO',
    });
    expect(incomplete.completedAt).toBeNull();

    const completed = await tasks.update(owner.user.id, incomplete.id, {
      status: 'COMPLETED',
    });
    expect(completed.completedAt).not.toBeNull();

    const reopened = await tasks.update(owner.user.id, incomplete.id, {
      status: 'TODO',
    });
    expect(reopened.completedAt).toBeNull();
  });
});
