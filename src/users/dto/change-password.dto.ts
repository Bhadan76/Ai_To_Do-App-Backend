import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 72,
    description:
      'At least 12 characters, including lowercase, uppercase, and a number. Bcrypt supports up to 72 UTF-8 bytes.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'newPassword must include lowercase, uppercase, and a number',
  })
  newPassword!: string;
}
