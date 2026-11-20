import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const prisma = {
    category: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  let service: CategoriesService;

  const category = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Work',
    color: '#2563EB',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.category.create.mockResolvedValue(category);
    prisma.category.findMany.mockResolvedValue([category]);
    prisma.category.count.mockResolvedValue(1);
    prisma.category.findFirst.mockResolvedValue(category);
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    prisma.category.deleteMany.mockResolvedValue({ count: 1 });
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  it('creates a category using only the authenticated user ID', async () => {
    await expect(
      service.create('user-1', {
        name: '  Work  ',
        color: '#2563EB',
      }),
    ).resolves.toEqual(category);

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        name: 'Work',
        color: '#2563EB',
        userId: 'user-1',
      },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
      },
    });
  });

  it('maps a duplicate category constraint to conflict', async () => {
    prisma.category.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create('user-1', { name: 'Work' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only owner categories with deterministic pagination defaults', async () => {
    const result = await service.list('user-1', {});

    expect(result).toEqual({
      items: [category],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      skip: 0,
      take: 20,
    });
    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('caps the list page size at one hundred', async () => {
    await service.list('user-1', { page: '3', pageSize: '500' });

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 200, take: 100 }),
    );
  });

  it('reads a category only when it belongs to the authenticated user', async () => {
    await expect(service.findById('user-1', category.id)).resolves.toEqual(
      category,
    );
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: category.id, userId: 'user-1' },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
      },
    });
  });

  it('returns a generic not-found result for a foreign category', async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(
      service.findById('user-1', category.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an owner-scoped category with explicit fields', async () => {
    await expect(
      service.update('user-1', category.id, {
        name: '  Personal  ',
        color: null,
      }),
    ).resolves.toEqual(category);

    expect(prisma.category.updateMany).toHaveBeenCalledWith({
      where: { id: category.id, userId: 'user-1' },
      data: { name: 'Personal', color: null },
    });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: category.id, userId: 'user-1' },
      select: {
        id: true,
        name: true,
        color: true,
        createdAt: true,
      },
    });
  });

  it('rejects empty category updates', async () => {
    await expect(
      service.update('user-1', category.id, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.category.updateMany).not.toHaveBeenCalled();
  });

  it('maps an update duplicate constraint and missing update target safely', async () => {
    prisma.category.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.update('user-1', category.id, { name: 'Duplicate' }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.category.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update('user-1', category.id, { name: 'Missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only an owner-scoped category', async () => {
    await service.remove('user-1', category.id);

    expect(prisma.category.deleteMany).toHaveBeenCalledWith({
      where: { id: category.id, userId: 'user-1' },
    });
  });

  it('returns a generic not-found result for a foreign category deletion', async () => {
    prisma.category.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.remove('user-1', category.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
