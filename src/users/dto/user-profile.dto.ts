import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  avatar!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class UserProfileEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({ type: UserProfileDto })
  data!: UserProfileDto;
}

export class UserMessageEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({
    example: { message: 'Operation completed successfully.' },
  })
  data!: { message: string };
}
