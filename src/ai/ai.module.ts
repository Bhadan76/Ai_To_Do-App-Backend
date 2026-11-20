import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { GEMINI_CHAT_GATEWAY } from './gemini-gateway.token';
import { GeminiChatGateway } from './gemini-gateway.token';
import { AiController } from './ai.controller';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationListResponseDto } from './dto/conversation-response.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { MessageResponseDto } from './dto/conversation-response.dto';

@Module({
  imports: [
    ConfigModule,
  ],
  providers: [
    {
      provide: GEMINI_CHAT_GATEWAY,
      useClass: GeminiService,
    },
    GeminiService,
    AiService,
    PrismaService,
    {
      provide: 'GEMINI_API_KEY',
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow('GEMINI_API_KEY'),
      inject: [ConfigService],
    },
    {
      provide: 'GEMINI_MODEL',
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow('GEMINI_MODEL'),
      inject: [ConfigService],
    },
    {
      provide: 'GEMINI_TIMEOUT_MS',
      useFactory: (configService: ConfigService) => {
        const timeout = configService.get('GEMINI_TIMEOUT_MS');
        return timeout ? parseInt(timeout, 10) : 30000;
      },
      inject: [ConfigService],
    },
  ],
  controllers: [AiController],
  exports: [
    AiService,
    GEMINI_CHAT_GATEWAY,
    GeminiService,
  ],
})
export class AiModule {}