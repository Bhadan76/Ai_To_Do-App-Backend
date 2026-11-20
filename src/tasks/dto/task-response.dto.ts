import { ApiProperty } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '../../generated/prisma/enums';

export class TaskResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: TaskPriority })
  priority!: TaskPriority;

  @ApiProperty({ enum: TaskStatus })
  status!: TaskStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  dueDate!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  reminderAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ format: 'uuid', nullable: true })
  categoryId!: string | null;
}

export class TaskListResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  items!: TaskResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 0 })
  totalItems!: number;

  @ApiProperty({ example: 0 })
  totalPages!: number;
}

export class TaskEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({ type: TaskResponseDto })
  data!: TaskResponseDto;
}

export class TaskListEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({ type: TaskListResponseDto })
  data!: TaskListResponseDto;
}

export class TaskMessageEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({
    example: { message: 'Task deleted successfully.' },
  })
  data!: { message: string };
}
