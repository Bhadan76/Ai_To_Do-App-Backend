import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import type { GeminiChatGateway } from './gemini-gateway.token';
import { GEMINI_CHAT_GATEWAY } from './gemini-gateway.token';

const MAX_USER_MESSAGE_LENGTH = 4000;
const MAX_CONTEXT_MESSAGES = 20;

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiChatGateway,
  ) {}

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<{
    id: string;
    userId: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    return this.prisma.aiConversation.create({
      data: {
        userId,
        title,
      },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    content: string,
  ): Promise<{
    conversation: {
      id: string;
      userId: string;
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    userMessage: {
      id: string;
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: Date;
    };
    assistantMessage: {
      id: string;
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: Date;
    };
  }> {
    // Validate message length
    if (Buffer.byteLength(content, 'utf8') > MAX_USER_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message exceeds maximum length of ${MAX_USER_MESSAGE_LENGTH} characters.`,
      );
    }

    // Persist the user message first
    const userMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'USER',
        content,
      },
      select: {
        id: true,
        conversationId: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    // Get existing conversation messages for context
    const allMessages = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: MAX_CONTEXT_MESSAGES + 1,
    });

    // Keep at most MAX_CONTEXT_MESSAGES most recent messages
    // Use as any to bypass type conflicts with Prisma MessageRole enum
    const contextMessages: any[] = allMessages.length > MAX_CONTEXT_MESSAGES
      ? allMessages
          .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, MAX_CONTEXT_MESSAGES)
          .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
      : allMessages as any[];

    // Build content for Gemini: system instruction + conversation history
    const geminiContents: string[] = [];

    // Add system instruction
    const systemInstruction =
      'You are a helpful assistant for the Daily Task application. ' +
      'Provide concise, practical answers focused on task management. ' +
      'Always maintain helpful and professional tone.';

    if (systemInstruction) {
      geminiContents.push(systemInstruction);
    }

    // Build conversation history from context messages
    // Skip the last message (it's the user message we just persisted)
    const conversationHistory = contextMessages.filter(
      (msg: any) => msg.id !== userMessage.id,
    );

    // Add messages in chronological order, preserving newest user message
    for (const msg of conversationHistory) {
      const role = msg.role === 'user' ? 'user' : 'model';
      geminiContents.push(`${role}: ${msg.content}`);
    }

    // Add the current user message at the end
    geminiContents.push(`user: ${userMessage.content}`);

    // Generate assistant response
    let assistantText: string;
    try {
      const geminiResponse = await this.gemini.generateContent(
        geminiContents,
        undefined,
        {
          temperature: 0.7,
          topP: 1,
          maxOutputTokens: 1024,
        },
      );

      assistantText = geminiResponse.text;

      if (!assistantText || assistantText.trim().length === 0) {
        // Remove the user message we just persisted
        await this.prisma.aiMessage.delete({
          where: { id: userMessage.id },
        });
        throw new BadRequestException(
          'Gemini returned an empty response.',
        );
      }
    } catch (error) {
      // If Gemini fails, remove the user message we just persisted
      await this.prisma.aiMessage.delete({
        where: { id: userMessage.id },
      });
      throw error;
    }

    // Persist the assistant message only after successful generation
    const assistantMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: assistantText,
      },
      select: {
        id: true,
        conversationId: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    // Update conversation ordering (update updatedAt)
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      conversation: {
        id: userMessage.conversationId,
        userId,
        title: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      userMessage: {
        ...userMessage,
        role: userMessage.role as 'user' | 'assistant',
      },
      assistantMessage: {
        ...assistantMessage,
        role: assistantMessage.role as 'user' | 'assistant',
      },
    };
  }

  async listConversations(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    items: Array<{
      id: string;
      userId: string;
      title: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;

    const [items, totalItems] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where: { userId },
        select: {
          id: true,
          userId: true,
          title: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.aiConversation.count({ where: { userId } }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<{
    id: string;
    userId: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException(
        'Conversation not found or access denied.',
      );
    }

    return conversation;
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const result = await this.prisma.aiConversation.deleteMany({
      where: { id: conversationId, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Conversation not found or access denied.',
      );
    }
  }
}