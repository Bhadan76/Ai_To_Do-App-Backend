import { Injectable } from '@nestjs/common';
import { GEMINI_CHAT_GATEWAY } from './gemini-gateway.token';
import { GeminiChatGateway } from './gemini-gateway.token';

@Injectable()
export class MockGeminiChatGateway implements GeminiChatGateway {
  isConfigured = jest.fn().mockReturnValue(true);

  generateContent = jest.fn().mockResolvedValue({
    text: 'Hello! How can I help you?',
    finishReason: 'STOP',
    safetyRatings: [],
  });

  countTokens = jest.fn().mockResolvedValue(50);
}
