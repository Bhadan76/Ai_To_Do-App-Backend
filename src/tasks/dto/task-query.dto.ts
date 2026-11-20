import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums';
import {
  IsOptional,
  IsInt,
  Max,
  Min,
  IsIn,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IsValidTimezoneOffset,
  IsValidCalendarDate,
} from '../../common/validators/date.validator';

const ISO_DATETIME_WITH_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class TaskQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsIn(Object.values(TaskStatus))
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsIn(Object.values(TaskPriority))
  priority?: TaskPriority;

  @ApiPropertyOptional({ example: '11111111-1111-4111-8111-111111111111', format: 'uuid', nullable: true })
  @IsOptional()
  categoryId?: string | null;

  @ApiPropertyOptional({ example: 'grocery', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00Z', format: 'date-time' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_WITH_TZ, {
    message:
      'dueDateFrom must be a timezone-aware ISO 8601 datetime (e.g., 2026-11-01T00:00:00Z).',
  })
  @IsValidTimezoneOffset({
    message:
      'dueDateFrom must have a valid timezone offset (maximum +/-14:00).',
  })
  @IsValidCalendarDate({
    message: 'dueDateFrom must be a valid calendar date.',
  })
  dueDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z', format: 'date-time' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_WITH_TZ, {
    message:
      'dueDateTo must be a timezone-aware ISO 8601 datetime (e.g., 2026-12-31T23:59:59Z).',
  })
  @IsValidTimezoneOffset({
    message:
      'dueDateTo must have a valid timezone offset (maximum +/-14:00).',
  })
  @IsValidCalendarDate({
    message: 'dueDateTo must be a valid calendar date.',
  })
  dueDateTo?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'dueDate'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'dueDate'])
  sortBy?: 'createdAt' | 'updatedAt' | 'dueDate';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  get normalizedPage(): number {
    return this.page ?? DEFAULT_PAGE;
  }

  get normalizedPageSize(): number {
    return Math.min(this.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  }

  get offset(): number {
    return (this.normalizedPage - 1) * this.normalizedPageSize;
  }

  get limit(): number {
    return this.normalizedPageSize;
  }
}
