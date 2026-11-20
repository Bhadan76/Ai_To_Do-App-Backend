export const mockGeminiService = {
  generateContent: async () => {
    return {
      text: 'Hello! How can I help you?',
      finishReason: 'STOP',
      safetyRatings: [],
    };
  },
  countTokens: async () => {
    return 50;
  },
};