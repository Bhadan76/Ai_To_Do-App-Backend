import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateConversationDto,
} from './dto/create-conversation.dto';
import {
  SendMessageDto,
} from './dto/send-message.dto';
import {
  ConversationListResponseDto,
  ConversationResponseDto,
  MessageResponseDto,
} from './dto/conversation-response.dto';
import { AiService } from './ai.service';
import { GEMINI_CHAT_GATEWAY } from './gemini-gateway.token';

@ApiTags('AI')
@ApiBearerAuth()
@ApiServiceUnavailableResponse({
  description:
    'The AI feature is unavailable because Gemini is not configured.',
})
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
  ) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Create a new AI conversation' })
  @ApiCreatedResponse({
    type: ConversationResponseDto,
    description: 'The conversation was created successfully.',
  })
  @ApiBadRequestResponse({ description: 'The request data is invalid.' })
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
  })
  createConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateConversationDto,
  ) {
    return this.aiService.createConversation(user.id, body.title ?? undefined);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message to an AI conversation' })
  @ApiCreatedResponse({
    type: MessageResponseDto,
    description: 'The message was sent and a response was generated.',
  })
  @ApiBadRequestResponse({ description: 'The message is invalid or too long.' })
  @ApiNotFoundResponse({ description: 'The conversation was not found.' })
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
  })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
    @Body() body: SendMessageDto,
  ) {
    const result = await this.aiService.sendMessage(
      id,
      user.id,
      body.content,
    );

    return {
      id: result.userMessage.id,
      role: result.userMessage.role,
      content: result.userMessage.content,
      createdAt: result.userMessage.createdAt,
    };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List AI conversations for the authenticated user' })
  @ApiOkResponse({
    type: ConversationListResponseDto,
    description: 'The conversations were listed successfully.',
  })
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
  })
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.aiService.listConversations(user.id, page, pageSize);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get an AI conversation by ID' })
  @ApiOkResponse({ type: ConversationResponseDto })
  @ApiNotFoundResponse({ description: 'Conversation not found or access denied.' })
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
  })
  getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.aiService.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an AI conversation' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'The conversation ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'Conversation not found or access denied.' })
  @ApiUnauthorizedResponse({
    description: 'A valid access token is required.',
  })
  async deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 400 })) id: string,
  ) {
    await this.aiService.deleteConversation(user.id, id);
    return { id };
  }
}