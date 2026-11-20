process.env.NODE_ENV = 'test';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { AiService } from '../src/ai/ai.service';
import { GeminiService } from '../src/ai/gemini.service';

describe('AI API (e2e - mocked)', () => {
  let app: INestApplication<App>;
  const conversationId = '11111111-1111-4111-8111-111111111111';

  const aiService = {
    createConversation: jest.fn(),
    sendMessage: jest.fn(),
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    deleteConversation: jest.fn(),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    conversation: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    },
  };

  const mockUserMessage = {
    id: 'msg-1',
    conversationId,
    role: 'user',
    content: 'Hello, AI!',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockAssistantMessage = {
    id: 'msg-2',
    conversationId,
    role: 'assistant',
    content: 'Hello! How can I help you?',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const mockConversations = [
    {
      id: conversationId,
      userId: 'user-1',
      title: 'Test Conversation',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    // Set test environment variables before ConfigModule loads
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-only-secret-not-for-any-environment-outside-tests-xyz';
    jest.clearAllMocks();
    prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    );

    aiService.createConversation.mockImplementation(async (userId, title) => ({
      id: 'conv-1',
      userId,
      title: title || 'Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    aiService.sendMessage.mockImplementation(async (convId, userId, content) => ({
      conversation: { id: convId, userId, title: 'C', createdAt: new Date(), updatedAt: new Date() },
      userMessage: { id: 'm1', conversationId: convId, role: 'user', content, createdAt: new Date() },
      assistantMessage: { id: 'm2', conversationId: convId, role: 'assistant', content: 'Hi', createdAt: new Date() },
    }));
    aiService.listConversations.mockResolvedValue({
      items: mockConversations,
      page: 1, pageSize: 20, totalItems: 1, totalPages: 1
    });
    aiService.getConversation.mockImplementation(async (userId, id) => ({
      id, userId, title: 'C', createdAt: new Date(), updatedAt: new Date()
    }));
    aiService.deleteConversation.mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: 'GoogleGenAI_TOKEN',
          useValue: {
            models: {
              generateContent: jest.fn().mockResolvedValue({
                text: 'This is a helpful response from the AI assistant.',
                finishReason: 'STOP',
                safetyRatings: [],
              }),
              countTokens: jest.fn().mockResolvedValue({ totalTokens: 50 }),
            },
          },
        },
        {
          provide: GeminiService,
          useValue: {
            generateContent: jest.fn().mockResolvedValue({
              text: 'This is a helpful response from the AI assistant.',
              finishReason: 'STOP',
              safetyRatings: [],
            }),
          },
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AiService)
      .useValue(aiService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  async function accessTokenFor(userId: string): Promise<string> {
    return app.get(JwtService).signAsync({ sub: userId });
  }

  it('requires authentication for every AI endpoint', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations')
      .send({ title: 'Test' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations/:id/messages')
      .send({ content: 'Hello' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/ai/conversations')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/conversations/${conversationId}`)
      .expect(401);
  });

  it('rejects invalid and expired JWTs', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations')
      .set('Authorization', 'Bearer expired-token')
      .expect(401);
  });

  it('creates a new conversation through the envelope and JWT subject', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Daily Tasks' })
      .expect(201)
      .expect((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('title', 'My Daily Tasks');
      });
  });

  it('creates a new conversation with default title', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations')
      .set('Authorization', `Bearer ${token}`)
      .expect(201)
      .expect((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data.title).toContain('Conversation');
      });
  });

  it('sends a message to a conversation and gets a response', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post(`/api/v1/ai/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'What tasks do I have today?' })
      .expect(201)
      .expect((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id');
        expect(response.body.data).toHaveProperty('role', 'user');
        expect(response.body.data.content).toBe('What tasks do I have today?');
      });
  });

  it('lists conversations for the authenticated user', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/ai/conversations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(Array.isArray(response.body.data.items)).toBe(true);
      });
  });

  it('returns a conversation by ID for the authenticated user', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get(`/api/v1/ai/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id', conversationId);
      });
  });

  it('returns 404 for a missing or foreign conversation', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .get('/api/v1/ai/conversations/non-existent-id')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
      .expect((response) => {
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('not found');
      });
  });

  it('deletes a conversation using owner-scoped deletion', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .delete(`/api/v1/ai/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('id', conversationId);
      });
  });

  it('rejects a client-supplied userId in conversation creation', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post('/api/v1/ai/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Work', userId: 'user-b' })
      .expect(400);
  });

  it('rejects empty message content', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post(`/api/v1/ai/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '' })
      .expect(400);
  });

  it('rejects message exceeding max length', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post(`/api/v1/ai/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'a'.repeat(4001) })
      .expect(400);
  });

  it('rejects whitespace-only message content', async () => {
    const token = await accessTokenFor('user-a');
    await request(app.getHttpServer())
      .post(`/api/v1/ai/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '   ' })
      .expect(400);
  });
});