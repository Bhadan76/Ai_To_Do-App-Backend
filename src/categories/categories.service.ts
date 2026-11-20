import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryQueryDto } from './dto/category-query.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
} satisfies Prisma.CategorySelect;

export type Category = Prisma.CategoryGetPayload<{
  select: typeof CATEGORY_SELECT;
}>;

export interface CategoryListResult {
  items: Category[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateCategoryDto,
  ): Promise<Category> {
    try {
      return await this.prisma.category.create({
        data: {
          name: input.name.trim(),
          color: input.color ?? null,
          userId,
        },
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A category with this name already exists.',
        );
      }
      throw error;
    }
  }

  async list(
    userId: string,
    query: CategoryQueryDto,
  ): Promise<CategoryListResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(
      query.pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const where = { userId };

    const [items, totalItems] = await Promise.all([
      this.prisma.category.findMany({
        where,
        select: CATEGORY_SELECT,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async findById(userId: string, categoryId: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: CATEGORY_SELECT,
    });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }
    return category;
  }

  async update(
    userId: string,
    categoryId: string,
    input: UpdateCategoryDto,
  ): Promise<Category> {
    if (input.name === undefined && input.color === undefined) {
      throw new BadRequestException(
        'At least one category field is required.',
      );
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name.trim();
    }
    if (input.color !== undefined) {
      data.color = input.color;
    }

    try {
      const result = await this.prisma.category.updateMany({
        where: { id: categoryId, userId },
        data,
      });
      if (result.count !== 1) {
        throw new NotFoundException('Category not found.');
      }

      return this.findById(userId, categoryId);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A category with this name already exists.',
        );
      }
      throw error;
    }
  }

  async remove(userId: string, categoryId: string): Promise<void> {
    const result = await this.prisma.category.deleteMany({
      where: { id: categoryId, userId },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Category not found.');
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
