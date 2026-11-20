/**
 * Runtime DI token for the Gemini chat gateway.
 * Using a string token to avoid circular dependency issues
 * and allow runtime configuration swapping.
 */
export const GEMINI_CHAT_GATEWAY = 'GEMINI_CHAT_GATEWAY';

export type GeminiChatGateway = {
  generateContent(
    contents: string[],
    systemInstruction?: string,
    options?: { temperature?: number; topP?: number; maxOutputTokens?: number }
  ): Promise<{
    text: string;
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  countTokens(contents: string[]): Promise<number>;
};