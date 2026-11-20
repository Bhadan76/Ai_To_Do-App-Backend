import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums';
import {
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  IsValidTimezoneOffset,
  IsValidCalendarDate,
} from '../../common/validators/date.validator';

const ISO_DATETIME_WITH_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Buy groceries', maxLength: 255 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    example: 'Buy milk and eggs',
    nullable: true,
    maxLength: 10000,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'HIGH',
    enum: TaskPriority,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    example: 'COMPLETED',
    enum: TaskStatus,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  status?: TaskStatus;

  @ApiPropertyOptional({
    example: '2026-12-01T09:00:00Z',
    format: 'date-time',
    nullable: true,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
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
  @ValidateIf((_object, value: unknown) => value !== undefined)
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
  @ValidateIf((_object, value: unknown) => value !== undefined)
  categoryId?: string | null;
}
