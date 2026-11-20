import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({ minLength: 1, maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @ApiProperty({ example: 'DELETE' })
  @IsString()
  @Equals('DELETE')
  confirmation!: string;
}
