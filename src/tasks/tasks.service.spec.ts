import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';
import { TaskQueryDto } from './dto/task-query.dto';

describe('TasksService', () => {
  const prisma = {
    category: {
      findFirst: jest.fn(),
    },
    task: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      updateManyAndReturn: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: TasksService;

  const task = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Buy groceries',
    description: 'Buy milk and eggs',
    priority: 'HIGH',
    status: 'TODO',
    dueDate: new Date('2026-12-01T09:00:00.000Z'),
    reminderAt: null,
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    categoryId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    prisma.task.create.mockResolvedValue(task);
    prisma.task.findMany.mockResolvedValue([task]);
    prisma.task.count.mockResolvedValue(1);
    prisma.task.findFirst.mockResolvedValue(task);
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    prisma.task.updateManyAndReturn.mockResolvedValue([task]);
    prisma.task.deleteMany.mockResolvedValue({ count: 1 });
    prisma.category.findFirst.mockResolvedValue({ id: 'cat-1' });
    service = new TasksService(prisma as unknown as PrismaService);
  });

  it('creates a task assigning only the authenticated userId', async () => {
    await expect(
      service.create('user-1', {
        title: '  Buy groceries  ',
        description: 'Buy milk',
        priority: 'HIGH',
        status: 'TODO',
        dueDate: '2026-12-01T09:00:00Z',
        categoryId: null,
      }),
    ).resolves.toEqual(task);

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Buy groceries',
          description: 'Buy milk',
          userId: 'user-1',
        }),
        select: expect.objectContaining({
          id: true,
          title: true,
          description: true,
        }),
      }),
    );
  });

  it('sets completedAt when initial status is COMPLETED', async () => {
    prisma.task.create.mockResolvedValue({ ...task, status: 'COMPLETED', completedAt: new Date() });

    await service.create('user-1', {
      title: 'Task',
      status: 'COMPLETED',
    });

    const createCall = prisma.task.create.mock.calls[0][0];
    expect(createCall.data.completedAt).toBeDefined();
  });

  it('lists only owner tasks with deterministic pagination defaults', async () => {
    const result = await service.list('user-1', new TaskQueryDto());

    expect(result).toEqual({
      items: [task],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: expect.arrayContaining([
          expect.objectContaining({ createdAt: 'desc' }),
          expect.objectContaining({ id: 'asc' }),
        ]),
      }),
    );
    expect(prisma.task.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('caps list page size at one hundred', async () => {
    await service.list('user-1', { page: '3', pageSize: '500' } as unknown as TaskQueryDto);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 200, take: 100 }),
    );
  });

  it('rejects inverted date range in list', async () => {
    await expect(
      service.list('user-1', {
        dueDateFrom: '2026-12-31T23:59:59Z',
        dueDateTo: '2026-11-01T00:00:00Z',
      } as unknown as TaskQueryDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.task.count).not.toHaveBeenCalled();
  });

  it('accepts equal date range boundaries in list', async () => {
    await service.list('user-1', {
      dueDateFrom: '2026-11-01T00:00:00Z',
      dueDateTo: '2026-11-01T00:00:00Z',
    } as unknown as TaskQueryDto);
    expect(prisma.task.findMany).toHaveBeenCalled();
  });

  it('accepts only dueDateFrom in list', async () => {
    await service.list('user-1', {
      dueDateFrom: '2026-11-01T00:00:00Z',
    } as unknown as TaskQueryDto);
    expect(prisma.task.findMany).toHaveBeenCalled();
  });

  it('accepts only dueDateTo in list', async () => {
    await service.list('user-1', {
      dueDateTo: '2026-12-31T23:59:59Z',
    } as unknown as TaskQueryDto);
    expect(prisma.task.findMany).toHaveBeenCalled();
  });

  it('reads a task only when it belongs to the authenticated user', async () => {
    await expect(service.findById('user-1', task.id)).resolves.toEqual(task);
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: task.id, userId: 'user-1' },
      select: expect.objectContaining({
        id: true,
        title: true,
      }),
    });
  });

  it('returns a generic not-found result for a foreign task', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.findById('user-1', task.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an owner-scoped task with explicit fields', async () => {
    await expect(
      service.update('user-1', task.id, {
        title: '  Personal  ',
        status: 'COMPLETED',
      }),
    ).resolves.toEqual(task);

    expect(prisma.task.updateManyAndReturn).toHaveBeenCalledWith({
      where: { id: task.id, userId: 'user-1' },
      data: expect.objectContaining({
        title: 'Personal',
        status: 'COMPLETED',
      }),
      select: expect.objectContaining({
        id: true,
        title: true,
      }),
    });
  });

  it('rejects empty task updates', async () => {
    await expect(
      service.update('user-1', task.id, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('clears completedAt when status changes from COMPLETED', async () => {
    prisma.task.findFirst.mockResolvedValue({
      ...task,
      status: 'COMPLETED',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await service.update('user-1', task.id, { status: 'TODO' });

    const updateCall = prisma.task.updateManyAndReturn.mock.calls[0][0];
    expect(updateCall.data.completedAt).toBeNull();
  });

  it('sets completedAt when status changes to COMPLETED', async () => {
    prisma.task.findFirst.mockResolvedValue({
      ...task,
      status: 'TODO',
      completedAt: null,
    });

    await service.update('user-1', task.id, { status: 'COMPLETED' });

    const updateCall = prisma.task.updateManyAndReturn.mock.calls[0][0];
    expect(updateCall.data.completedAt).toBeDefined();
    expect(updateCall.data.completedAt).toBeInstanceOf(Date);
  });

  it('verifies category ownership when assigning a category', async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        title: 'Task',
        categoryId: 'foreign-category-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects foreign category assignment on update', async () => {
    prisma.task.findFirst.mockResolvedValue(task);
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(
      service.update('user-1', task.id, { categoryId: 'foreign-category-id' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('deletes only an owner-scoped task', async () => {
    await service.remove('user-1', task.id);

    expect(prisma.task.deleteMany).toHaveBeenCalledWith({
      where: { id: task.id, userId: 'user-1' },
    });
  });

  it('returns a generic not-found result for a foreign task deletion', async () => {
    prisma.task.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.remove('user-1', task.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
