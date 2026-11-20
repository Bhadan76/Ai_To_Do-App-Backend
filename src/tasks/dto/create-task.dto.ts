import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import {
  IsValidTimezoneOffset,
  IsValidCalendarDate,
} from '../../common/validators/date.validator';

const ISO_DATETIME_WITH_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export class CreateTaskDto {
  @ApiProperty({ example: 'Buy groceries', maxLength: 255 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    example: 'Buy milk and eggs',
    nullable: true,
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'HIGH',
    enum: TaskPriority,
    default: 'MEDIUM',
  })
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({
    example: 'TODO',
    enum: TaskStatus,
    default: 'TODO',
  })
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: '2026-12-01T09:00:00Z',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_WITH_TZ, {
    message:
      'dueDate must be a timezone-aware ISO 8601 datetime (e.g., 2026-12-01T09:00:00Z)',
  })
  @IsValidTimezoneOffset({
    message:
      'dueDate must have a valid timezone offset (maximum +/-14:00).',
  })
  @IsValidCalendarDate({
    message: 'dueDate must be a valid calendar date.',
  })
  dueDate?: string | null;

  @ApiPropertyOptional({
    example: '2026-11-30T08:00:00Z',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_WITH_TZ, {
    message:
      'reminderAt must be a timezone-aware ISO 8601 datetime (e.g., 2026-11-30T08:00:00Z)',
  })
  @IsValidTimezoneOffset({
    message:
      'reminderAt must have a valid timezone offset (maximum +/-14:00).',
  })
  @IsValidCalendarDate({
    message: 'reminderAt must be a valid calendar date.',
  })
  reminderAt?: string | null;

  @ApiPropertyOptional({
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  categoryId?: string | null;
}
