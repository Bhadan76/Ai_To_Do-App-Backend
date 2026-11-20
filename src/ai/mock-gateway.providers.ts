import { Provider } from '@nestjs/common';
import { GEMINI_CHAT_GATEWAY } from './gemini-gateway.token';

export const mockGeminiServiceProvider: Provider = {
  provide: GEMINI_CHAT_GATEWAY,
  useValue: {
    isConfigured: jest.fn().mockReturnValue(true),
    generateContent: jest.fn().mockResolvedValue({
      text: 'Hello! How can I help you?',
      finishReason: 'STOP',
      safetyRatings: [],
    }),
    countTokens: jest.fn().mockResolvedValue(50),
  },
};
