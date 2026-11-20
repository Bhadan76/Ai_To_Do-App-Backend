import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, example: '#2563EB' })
  color!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class CategoryListResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  items!: CategoryResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 0 })
  totalItems!: number;

  @ApiProperty({ example: 0 })
  totalPages!: number;
}

export class CategoryEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({ type: CategoryResponseDto })
  data!: CategoryResponseDto;
}

export class CategoryListEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({ type: CategoryListResponseDto })
  data!: CategoryListResponseDto;
}

export class CategoryMessageEnvelopeDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Request successful' })
  message!: string;

  @ApiProperty({
    example: { message: 'Category deleted successfully.' },
  })
  data!: { message: string };
}
