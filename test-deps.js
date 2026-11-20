// Minimal test: just PrismaService
const { Test } = require('@nestjs/testing');
const { AiService } = require('./src/ai/ai.service');
const { PrismaService } = require('./src/prisma/prisma.service');

async function main() {
  try {
    const module = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: PrismaService,
          useClass: require('./src/ai/mock-prisma.class'),
        },
      ],
    }).compile();
    const service = module.get(AiService);
    console.log('SUCCESS: Service with Prisma only instantiated');
  } catch (e) {
    console.log('ERROR:', e.message);
  }
}
main();