import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'Optional title for the conversation',
    maxLength: 200,
    example: 'My Daily Tasks',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;
}