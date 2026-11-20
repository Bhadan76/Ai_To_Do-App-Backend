import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TaskQueryDto } from './dto/task-query.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  dueDate: true,
  reminderAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  categoryId: true,
} satisfies Prisma.TaskSelect;

export type Task = Prisma.TaskGetPayload<{
  select: typeof TASK_SELECT;
}>;

export interface TaskListResult {
  items: Task[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateTaskDto): Promise<Task> {
    return this.prisma.$transaction(async (transaction) => {
      if (input.categoryId !== undefined && input.categoryId !== null) {
        const category = await transaction.category.findFirst({
          where: { id: input.categoryId, userId },
          select: { id: true },
        });
        if (!category) {
          throw new NotFoundException('Task not found.');
        }
      }

      const completedAt =
        input.status === 'COMPLETED' ? new Date() : null;

      return await transaction.task.create({
        data: {
          title: input.title.trim(),
          description: input.description ?? null,
          priority: input.priority ?? 'MEDIUM',
          status: input.status ?? 'TODO',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
          categoryId: input.categoryId ?? null,
          userId,
          ...(completedAt ? { completedAt } : {}),
        },
        select: TASK_SELECT,
      });
    });
  }

  async list(userId: string, query: TaskQueryDto): Promise<TaskListResult> {
    const page = Math.max(
      1,
      parseInt(String(query.page ?? DEFAULT_PAGE), 10) || DEFAULT_PAGE,
    );
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        parseInt(String(query.pageSize ?? DEFAULT_PAGE_SIZE), 10) ||
          DEFAULT_PAGE_SIZE,
      ),
    );
    const where: Prisma.TaskWhereInput = { userId };

    if (query.dueDateFrom && query.dueDateTo) {
      const from = new Date(query.dueDateFrom);
      const to = new Date(query.dueDateTo);
      if (from > to) {
        throw new BadRequestException(
          'dueDateFrom must be before or equal to dueDateTo.',
        );
      }
    }

    if (query.status !== undefined) {
      where.status = query.status;
    }
    if (query.priority !== undefined) {
      where.priority = query.priority;
    }
    if (query.categoryId !== undefined) {
      where.categoryId = query.categoryId;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {};
      if (query.dueDateFrom) {
        where.dueDate.gte = new Date(query.dueDateFrom);
      }
      if (query.dueDateTo) {
        where.dueDate.lte = new Date(query.dueDateTo);
      }
    }

    const [items, totalItems] = await Promise.all([
      transactionFindMany(this.prisma, where, page, pageSize, query),
      this.prisma.task.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findById(userId: string, taskId: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: TASK_SELECT,
    });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  async update(
    userId: string,
    taskId: string,
    input: UpdateTaskDto,
  ): Promise<Task> {
    if (
      input.title === undefined &&
      input.description === undefined &&
      input.priority === undefined &&
      input.status === undefined &&
      input.dueDate === undefined &&
      input.reminderAt === undefined &&
      input.categoryId === undefined
    ) {
      throw new BadRequestException(
        'At least one task field is required.',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.task.findFirst({
        where: { id: taskId, userId },
        select: { id: true, status: true, completedAt: true },
      });
      if (!existing) {
        throw new NotFoundException('Task not found.');
      }

      if (
        input.categoryId !== undefined &&
        input.categoryId !== null
      ) {
        const category = await transaction.category.findFirst({
          where: { id: input.categoryId, userId },
          select: { id: true },
        });
        if (!category) {
          throw new NotFoundException('Task not found.');
        }
      }

      const data: Prisma.TaskUncheckedUpdateManyInput = {};
      let completedAt: Date | null | undefined = undefined;

      if (input.title !== undefined) {
        data.title = input.title.trim();
      }
      if (input.description !== undefined) {
        data.description = input.description;
      }
      if (input.priority !== undefined) {
        data.priority = input.priority;
      }
      if (input.status !== undefined) {
        data.status = input.status;
        if (input.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
          completedAt = new Date();
        }
        if (input.status !== 'COMPLETED' && existing.status === 'COMPLETED') {
          completedAt = null;
        }
      }

      if (input.dueDate !== undefined) {
        data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      }
      if (input.reminderAt !== undefined) {
        data.reminderAt = input.reminderAt
          ? new Date(input.reminderAt)
          : null;
      }
      if (input.categoryId !== undefined) {
        data.categoryId = input.categoryId;
      }

      if (completedAt !== undefined) {
        data.completedAt = completedAt;
      }

      const updated = await transaction.task.updateManyAndReturn({
        where: { id: taskId, userId },
        data,
        select: TASK_SELECT,
      });
      if (updated.length !== 1) {
        throw new NotFoundException('Task not found.');
      }

      return updated[0];
    });
  }

  async remove(userId: string, taskId: string): Promise<void> {
    const result = await this.prisma.task.deleteMany({
      where: { id: taskId, userId },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Task not found.');
    }
  }
}

async function transactionFindMany(
  prisma: PrismaService,
  where: Prisma.TaskWhereInput,
  page: number,
  pageSize: number,
  query: TaskQueryDto,
) {
  return prisma.task.findMany({
    where,
    select: TASK_SELECT,
    orderBy: [
      { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
      { id: 'asc' },
    ],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}
