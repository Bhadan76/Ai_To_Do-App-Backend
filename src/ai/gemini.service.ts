import {
  Injectable,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  GeminiChatGateway,
  GEMINI_UNAVAILABLE_MESSAGE,
} from './gemini-gateway.token';

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 1;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 30000;

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
export class GeminiService implements GeminiChatGateway {
  private readonly client: GoogleGenAI | null;
  private readonly modelName: string;
  private readonly timeoutMs: number;

  constructor(
    @Optional()
    @Inject('GoogleGenAI_TOKEN')
    googleGenAI: GoogleGenAI | null,
    @Optional()
    @Inject('GEMINI_MODEL')
    modelName?: string,
    @Optional()
    @Inject('GEMINI_TIMEOUT_MS')
    timeoutMs?: number,
  ) {
    // The client is only created when the API key is available, so a missing
    // key never turns into a real Gemini client (and never reaches the API).
    this.client = googleGenAI ?? null;
    this.modelName = modelName?.trim() ?? '';
    this.timeoutMs =
      typeof timeoutMs === 'number' && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_TIMEOUT_MS;
  }

  isConfigured(): boolean {
    return this.client !== null && this.modelName.length > 0;
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
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(GEMINI_UNAVAILABLE_MESSAGE);
    }

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

      const response = await this.client!.models.generateContent({
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
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(GEMINI_UNAVAILABLE_MESSAGE);
    }

    try {
      const result = await this.client!.models.countTokens({
        model: this.modelName,
        contents,
      });
      return result.totalTokens ?? 0;
    } catch (error) {
      return 0;
    }
  }
}