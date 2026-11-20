// Debug script to check module resolution
const { Test, TestingModule } = require('@nestjs/testing');
const { AiService } = require('./src/ai/ai.service');
const { PrismaService } = require('./src/prisma/prisma.service');
const { GEMINI_CHAT_GATEWAY } = require('./src/ai/gemini-gateway.token');
const { MockPrismaService } = require('./src/ai/mock-prisma-class');
const { MockGeminiChatGateway } = require('./src/ai/mock-gateway.class');

async function main() {
  try {
    console.log('All modules loaded successfully');
    
    const module = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: PrismaService,
          useClass: MockPrismaService,
        },
        {
          provide: GEMINI_CHAT_GATEWAY,
          useClass: MockGeminiChatGateway,
        },
      ],
    }).compile();
    
    const service = module.get(AiService);
    console.log('SUCCESS: Service instantiated');
    console.log('Service type:', typeof service);
  } catch (e) {
    console.log('ERROR:', e.message);
    console.log('Stack:', e.stack);
  }
}
main();