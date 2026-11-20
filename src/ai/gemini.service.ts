import { Injectable, Inject } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 1;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

type GenerateContentResponse = {
  text?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
  finishReason?: string;
};

@Injectable()
export class GeminiService {
  private readonly client: GoogleGenAI;
  private readonly modelName: string;
  private readonly timeoutMs: number;

  constructor(
    @Inject('GoogleGenAI_TOKEN') private readonly googleGenAI: GoogleGenAI,
  ) {
    this.modelName = 'gemini-1.5-flash';
    this.timeoutMs = 30000;
    this.client = googleGenAI;
  }

  async generateContent(
    contents: string[],
    systemInstruction?: string,
    options?: {
      temperature?: number;
      topP?: number;
      maxOutputTokens?: number;
    },
  ): Promise<{
    text: string;
    finishReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }> {
    try {
      const config: {
        temperature?: number;
        topP?: number;
        maxOutputTokens?: number;
        systemInstruction?: {
          role: string;
          parts: { text: string }[];
        };
      } = {
        temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
        topP: options?.topP ?? DEFAULT_TOP_P,
        maxOutputTokens: options?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      };

      if (systemInstruction) {
        config.systemInstruction = {
          role: 'model',
          parts: [{ text: systemInstruction }],
        };
      }

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents,
        config,
      }) as GenerateContentResponse;

      // Extract text from response
      let text = response.text;
      if (text === undefined && response.candidates?.[0]?.content?.parts) {
        text = response.candidates[0].content.parts
          .reduce((acc, part) => acc + (part.text ?? ''), '' as string);
      }
      text = text ?? '';

      // Extract safety ratings
      const safetyRatings =
        'safetyRatings' in response && response.safetyRatings
          ? response.safetyRatings as Array<{
              category: string;
              probability: string;
            }>
          : undefined;

      // Extract finishReason from response or candidates
      const finishReason =
        response.finishReason ??
        (response.candidates?.[0]?.finishReason);

      return {
        text: text.trim(),
        finishReason,
        safetyRatings,
      };
    } catch (error) {
      throw error;
    }
  }

  mapError(error: Error): Error {
    const message = error.message || '';

    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      const mapped = new Error('Too many requests. Please try again later.');
      mapped.name = 'RateLimitError';
      return mapped;
    }
    if (message.includes('401') || message.includes('UNAUTHENTICATED')) {
      const mapped = new Error(
        'Invalid Gemini API key or insufficient permissions.',
      );
      mapped.name = 'AuthenticationError';
      return mapped;
    }
    if (message.includes('403') || message.includes('PERMISSION_DENIED')) {
      const mapped = new Error('Gemini API access forbidden.');
      mapped.name = 'ForbiddenError';
      return mapped;
    }
    if (message.includes('Model not found') || message.includes('UNKNOWN_MODEL')) {
      const mapped = new Error(
        'Requested Gemini model is not available.',
      );
      mapped.name = 'ModelNotFoundError';
      return mapped;
    }

    return error;
  }

  async countTokens(contents: string[]): Promise<number> {
    try {
      const result = await this.client.models.countTokens({
        model: this.modelName,
        contents,
      });
      return result.totalTokens ?? 0;
    } catch (error) {
      return 0;
    }
  }
}