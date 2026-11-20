import { Injectable } from '@nestjs/common';

export class MockPrismaService {
  aiConversation = {
    create: jest.fn().mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findMany: jest.fn(),
    count: jest.fn().mockResolvedValue(2),
    findFirst: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };
  aiMessage = {
    create: jest.fn().mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello, AI!',
      createdAt: new Date(),
    }),
    findMany: jest.fn(),
  };
}