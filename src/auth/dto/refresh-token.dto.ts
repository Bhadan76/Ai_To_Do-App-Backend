import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Opaque refresh token returned by registration or login.',
    minLength: 43,
    maxLength: 128,
  })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  refreshToken!: string;
}
