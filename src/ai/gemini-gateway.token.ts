/**
 * Runtime DI token for the Gemini chat gateway.
 * Using a string token to avoid circular dependency issues
 * and allow runtime configuration swapping.
 */
export const GEMINI_CHAT_GATEWAY = 'GEMINI_CHAT_GATEWAY';

/**
 * Generic, client-safe message used whenever Gemini is not configured.
 * It intentionally avoids exposing any environment or credential details.
 */
export const GEMINI_UNAVAILABLE_MESSAGE =
  'AI service is temporarily unavailable.';

export type GeminiChatGateway = {
  /**
   * Reports whether the gateway is backed by a usable Gemini client.
   * When it returns false the AI endpoints answer with 503.
   */
  isConfigured(): boolean;
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
