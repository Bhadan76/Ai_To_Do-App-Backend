import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class MessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  role!: 'user' | 'assistant';

  @ApiProperty()
  content!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class ConversationResponseDto {
  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' })
  id!: string;

  @ApiProperty({ example: 'My Daily Tasks' })
  title!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ConversationWithMessagesResponseDto {
  @ApiProperty({ type: ConversationResponseDto })
  conversation!: ConversationResponseDto;

  @ApiProperty({ type: [MessageResponseDto] })
  messages!: MessageResponseDto[];
}