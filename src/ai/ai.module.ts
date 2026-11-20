import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
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

const DEFAULT_GEMINI_TIMEOUT_MS = 30000;

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
        configService.get<string>('GEMINI_API_KEY') ?? '',
      inject: [ConfigService],
    },
    {
      provide: 'GEMINI_MODEL',
      useFactory: (configService: ConfigService) =>
        configService.get<string>('GEMINI_MODEL') ?? '',
      inject: [ConfigService],
    },
    {
      provide: 'GEMINI_TIMEOUT_MS',
      useFactory: (configService: ConfigService) => {
        const timeout = configService.get<string | number>('GEMINI_TIMEOUT_MS');
        const parsed = typeof timeout === 'number' ? timeout : Number(timeout);
        return Number.isSafeInteger(parsed) && parsed > 0
          ? parsed
          : DEFAULT_GEMINI_TIMEOUT_MS;
      },
      inject: [ConfigService],
    },
    {
      // A real Gemini client is only built when the feature is fully
      // configured. Otherwise the gateway stays disabled and the AI
      // endpoints answer with 503 Service Unavailable.
      provide: 'GoogleGenAI_TOKEN',
      useFactory: (
        apiKey: string,
        model: string,
      ): GoogleGenAI | null => {
        if (!apiKey || !model) {
          return null;
        }
        return new GoogleGenAI({ apiKey });
      },
      inject: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
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
