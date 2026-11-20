import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { CategoriesService } from '../src/categories/categories.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('Task API (e2e)', () => {
  let app: INestApplication<App>;
  const taskId = '11111111-1111-4111-8111-111111111111';
  const task = {
    id: taskId,
    title: 'Buy groceries',
    description: 'Buy milk and eggs',
    priority: 'HIGH',
    status: 'TODO',
    dueDate: '2026-12-01T09:00:00.000Z',
    reminderAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    categoryId: null,
  };
  const tasksService = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    );
    tasksService.create.mockResolvedValue(task);
    tasksService.list.mockResolvedValue({
      items: [task],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    tasksService.findById.mockResolvedValue(task);
    tasksService.update.mockResolvedValue(task);
    tasksService.remove.mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AuthService)
      .useValue({})
      .overrideProvider(UsersService)
      .useValue({})
      .overrideProvider(CategoriesService)
      .useValue({})
      .overrideProvider(TasksService)
      .useValue(tasksService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  async function accessTokenFor(userId: string): Promise<string> {
    return app.get(JwtService).signAsync({ sub: userId });
  }

  it('requires authentication for every task endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .send({ title: 'Task' })
      .expect(401);
    await request(app.getHttpServer()).get('/api/v1/tasks').expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .send({ title: 'Updated' })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}`)
      .expect(401);
  });

  it('rejects invalid and expired JWTs', async () => {
    const expired = await app
      .get(JwtService)
      .signAsync({ sub: 'user-1' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('creates a task through the envelope and JWT subject', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Buy groceries',
        priority: 'HIGH',
        dueDate: '2026-12-01T09:00:00Z',
      })
      .expect(201)
      .expect({
        success: true,
        message: 'Request successful',
        data: task,
      });
    expect(tasksService.create).toHaveBeenCalledWith('user-a', {
      title: 'Buy groceries',
      priority: 'HIGH',
      dueDate: '2026-12-01T09:00:00Z',
    });
  });

  it('lists owned tasks with pagination', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/tasks?page=2&pageSize=50')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: {
          items: [task],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      });
    expect(tasksService.list).toHaveBeenCalledWith('user-a', {
      page: 2,
      pageSize: 50,
    });
  });

  it('returns an owned task without userId', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(tasksService.findById).toHaveBeenCalledWith('user-a', taskId);
        expect(response.body.data).not.toHaveProperty('userId');
        expect(response.body.data).not.toHaveProperty('password');
      });
  });

  it('updates and deletes only through the JWT subject', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Task', status: 'COMPLETED' })
      .expect(200);
    expect(tasksService.update).toHaveBeenCalledWith('user-a', taskId, {
      title: 'Updated Task',
      status: 'COMPLETED',
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({
        success: true,
        message: 'Request successful',
        data: { message: 'Task deleted successfully.' },
      });
    expect(tasksService.remove).toHaveBeenCalledWith('user-a', taskId);
  });

  it('rejects a client-supplied userId and invalid task fields', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task', userId: 'user-b' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task', dueDate: '2026-12-01' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unknownField: true })
      .expect(400);
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(tasksService.update).not.toHaveBeenCalled();
  });

  it('rejects invalid timezone offsets for task creation with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task', dueDate: '2026-12-01T09:00:00+99:99' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task', reminderAt: '2026-12-01T09:00:00+25:00' })
      .expect(400);
    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid calendar dates for task creation with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task', dueDate: '2026-02-30T09:00:00Z' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Task', reminderAt: '2026-02-29T09:00:00Z' })
      .expect(400);
    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('rejects invalid timezone offsets for task update with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dueDate: '2026-12-01T09:00:00+99:99' })
      .expect(400);
    expect(tasksService.update).not.toHaveBeenCalled();
  });

  it('rejects invalid calendar dates for task update with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dueDate: '2026-02-30T09:00:00Z' })
      .expect(400);
    expect(tasksService.update).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID task ID before calling the service', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/tasks/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(tasksService.findById).not.toHaveBeenCalled();
  });

  it('rejects invalid query date parameters with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/tasks?dueDateFrom=not-a-date')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/tasks?dueDateTo=not-a-date')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(tasksService.list).not.toHaveBeenCalled();
  });

  it('rejects date-only query date parameters with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/tasks?dueDateFrom=2026-11-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/tasks?dueDateTo=2026-12-31T23:59:59')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(tasksService.list).not.toHaveBeenCalled();
  });

  it('rejects invalid calendar date query parameters with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/tasks?dueDateFrom=2026-02-30T00:00:00Z')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(tasksService.list).not.toHaveBeenCalled();
  });

  it('rejects invalid timezone offset query parameters with 400', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/tasks?dueDateFrom=2026-11-01T00:00:00+99:99')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(tasksService.list).not.toHaveBeenCalled();
  });

  it('accepts valid timezone-aware query date parameters', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get(
        '/api/v1/tasks?dueDateFrom=2026-11-01T00:00:00Z&dueDateTo=2026-12-31T23:59:59Z',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
