import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { GEMINI_CHAT_GATEWAY } from './gemini-gateway.token';
import { MockPrismaService } from './mock-prisma-class';
import { MockGeminiChatGateway } from './mock-gateway-class';

const mockUserId = 'user-1';

describe('AiService unit tests', () => {
  let service: AiService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PrismaService,
          useClass: MockPrismaService,
        },
        {
          provide: GEMINI_CHAT_GATEWAY,
          useClass: MockGeminiChatGateway,
        },
        AiService,
      ],
    }).compile();

    service = module.get(AiService);
    prisma = module.get(PrismaService) as MockPrismaService;
  });

  it('should instantiate with both dependencies', () => {
    expect(service).toBeDefined();
  });

  it('reports that Gemini is available', () => {
    expect(service.isGeminiAvailable()).toBe(true);
  });

  it('creates a conversation', async () => {
    const result = await service.createConversation(mockUserId, 'Test');
    expect(result.userId).toBe(mockUserId);
  });
});

describe('AiService without Gemini configuration', () => {
  let service: AiService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PrismaService,
          useClass: MockPrismaService,
        },
        {
          provide: GEMINI_CHAT_GATEWAY,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(false),
            generateContent: jest.fn(),
            countTokens: jest.fn(),
          },
        },
        AiService,
      ],
    }).compile();

    service = module.get(AiService);
    prisma = module.get(PrismaService) as MockPrismaService;
  });

  it('reports that Gemini is unavailable', () => {
    expect(service.isGeminiAvailable()).toBe(false);
  });

  it('answers with 503 when creating a conversation', async () => {
    await expect(
      service.createConversation(mockUserId, 'Test'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('answers with 503 when sending a message', async () => {
    await expect(
      service.sendMessage('conv-1', mockUserId, 'Hello'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('answers with 503 when listing conversations', async () => {
    await expect(service.listConversations(mockUserId)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('answers with 503 when reading a conversation', async () => {
    await expect(
      service.getConversation(mockUserId, 'conv-1'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('answers with 503 when deleting a conversation', async () => {
    await expect(
      service.deleteConversation(mockUserId, 'conv-1'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('does not touch the database while Gemini is unavailable', async () => {
    await expect(
      service.sendMessage('conv-1', mockUserId, 'Hello'),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prisma.aiMessage.create).not.toHaveBeenCalled();
    expect(prisma.aiConversation.create).not.toHaveBeenCalled();
  });
});
