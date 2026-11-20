import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CategoriesService } from './categories.service';
import { CategoryQueryDto } from './dto/category-query.dto';
import {
  CategoryEnvelopeDto,
  CategoryListEnvelopeDto,
  CategoryMessageEnvelopeDto,
} from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category for the authenticated user' })
  @ApiCreatedResponse({ type: CategoryEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The category DTO is invalid.' })
  @ApiConflictResponse({ description: 'The category name is already in use.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'List categories owned by the authenticated user' })
  @ApiOkResponse({ type: CategoryListEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The pagination query is invalid.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CategoryQueryDto,
  ) {
    return this.categoriesService.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an owned category by ID' })
  @ApiOkResponse({ type: CategoryEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The category ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The category was not found.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.findById(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an owned category' })
  @ApiOkResponse({ type: CategoryEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The category update is invalid.' })
  @ApiNotFoundResponse({ description: 'The category was not found.' })
  @ApiConflictResponse({ description: 'The category name is already in use.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an owned category',
    description:
      'Associated tasks are preserved and their categoryId is set to null.',
  })
  @ApiOkResponse({ type: CategoryMessageEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The category ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The category was not found.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.categoriesService.remove(user.id, id);
    return { message: 'Category deleted successfully.' };
  }
}
