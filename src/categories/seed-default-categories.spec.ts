import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_CATEGORIES,
  seedDefaultCategories,
} from './seed-default-categories';

const prismaMock = {
  user: { findMany: jest.fn() },
  category: { createMany: jest.fn() },
};
const prisma = prismaMock as unknown as PrismaService;

describe('seedDefaultCategories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the default categories for every existing user', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    prismaMock.category.createMany.mockResolvedValue({ count: 12 });

    await expect(seedDefaultCategories(prisma)).resolves.toBe(12);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(prismaMock.category.createMany).toHaveBeenCalledWith({
      data: DEFAULT_CATEGORIES.map((name) => ({ name, userId: 'user-1' })),
      skipDuplicates: true,
    });
  });

  it('seeds the full default set for each of multiple users', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'user-1' },
      { id: 'user-2' },
    ]);
    prismaMock.category.createMany.mockResolvedValue({ count: 24 });

    await expect(seedDefaultCategories(prisma)).resolves.toBe(24);

    expect(prismaMock.category.createMany).toHaveBeenCalledWith({
      data: [
        ...DEFAULT_CATEGORIES.map((name) => ({ name, userId: 'user-1' })),
        ...DEFAULT_CATEGORIES.map((name) => ({ name, userId: 'user-2' })),
      ],
      skipDuplicates: true,
    });
  });

  it('creates nothing when there are no users', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await expect(seedDefaultCategories(prisma)).resolves.toBe(0);
    expect(prismaMock.category.createMany).not.toHaveBeenCalled();
  });
});
