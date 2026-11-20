import { Test, TestingModule } from '@nestjs/testing';
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
        MockPrismaService,
        MockGeminiChatGateway,
        {
          provide: GEMINI_CHAT_GATEWAY,
          useValue: MockGeminiChatGateway,
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

  it('creates a conversation', async () => {
    const result = await service.createConversation(mockUserId, 'Test');
    expect(result.userId).toBe(mockUserId);
  });
});