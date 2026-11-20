import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'The user message content',
    maxLength: 4000,
    example: 'What tasks do I have for today?',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(4000)
  content!: string;
}