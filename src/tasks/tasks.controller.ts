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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { TasksService } from './tasks.service';
import { TaskQueryDto } from './dto/task-query.dto';
import {
  TaskEnvelopeDto,
  TaskListEnvelopeDto,
  TaskMessageEnvelopeDto,
} from './dto/task-response.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task for the authenticated user' })
  @ApiCreatedResponse({ type: TaskEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The task DTO is invalid.' })
  @ApiNotFoundResponse({ description: 'The referenced category was not found.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateTaskDto,
  ) {
    return this.tasksService.create(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'List tasks owned by the authenticated user' })
  @ApiOkResponse({ type: TaskListEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The query parameters are invalid.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TaskQueryDto,
  ) {
    return this.tasksService.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an owned task by ID' })
  @ApiOkResponse({ type: TaskEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The task ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The task was not found.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.findById(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an owned task' })
  @ApiOkResponse({ type: TaskEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The task update is invalid.' })
  @ApiNotFoundResponse({ description: 'The task was not found.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an owned task' })
  @ApiOkResponse({ type: TaskMessageEnvelopeDto })
  @ApiBadRequestResponse({ description: 'The task ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'The task was not found.' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required.' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tasksService.remove(user.id, id);
    return { message: 'Task deleted successfully.' };
  }
}
