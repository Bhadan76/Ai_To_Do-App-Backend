import { Test, TestingModule } from '@nestjs/testing';
import { GeminiService } from './gemini.service';
import { Logger } from '@nestjs/common';

const mockGoogleGenAI = {
  models: {
    generateContent: jest.fn().mockResolvedValue({
      text: 'This is a helpful response from the AI assistant.',
      finishReason: 'STOP',
      safetyRatings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          probability: 'NEGLIGIBLE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          probability: 'NEGLIGIBLE',
        },
        {
          category: 'HARM_CATEGORY_SEXUAL_CONTENT',
          probability: 'NEGLIGIBLE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          probability: 'NEGLIGIBLE',
        },
      ],
    }),
    countTokens: jest.fn().mockResolvedValue({ totalTokens: 50 }),
  },
};

const mockClient = {
  models: mockGoogleGenAI.models,
};

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Logger,
        {
          provide: 'GoogleGenAI_TOKEN',
          useValue: mockClient,
        },
        GeminiService,
      ],
    }).compile();

    service = module.get(GeminiService);
  });

  it('generates content successfully', async () => {
    const result = await service.generateContent(
      ['user: Hello, how are you?'],
      'You are a helpful assistant.',
    );

    expect(result.text).toBe(
      'This is a helpful response from the AI assistant.',
    );
    expect(result.finishReason).toBe('STOP');
    expect(result.safetyRatings).toBeDefined();
  });

  it('generates content without system instruction', async () => {
    const result = await service.generateContent(
      ['user: Hello'],
    );

    expect(result.text).toBe(
      'This is a helpful response from the AI assistant.',
    );
  });

  it('counts tokens', async () => {
    const result = await service.countTokens(['user: Hello']);

    expect(result).toBe(50);
  });

  it('maps rate limit errors', async () => {
    const rateError = new Error('429 RESOURCE_EXHAUSTED: API rate limit exceeded');
    const mapped = service['mapError'](rateError);

    expect(mapped.name).toBe('RateLimitError');
    expect(mapped.message).toBe('Too many requests. Please try again later.');
  });

  it('maps authentication errors', async () => {
    const authError = new Error('401: Invalid API key');
    const mapped = service['mapError'](authError);

    expect(mapped.name).toBe('AuthenticationError');
    expect(mapped.message).toBe(
      'Invalid Gemini API key or insufficient permissions.',
    );
  });

  it('maps forbidden errors', async () => {
    const forbiddenError = new Error('403: Permission denied');
    const mapped = service['mapError'](forbiddenError);

    expect(mapped.name).toBe('ForbiddenError');
    expect(mapped.message).toBe('Gemini API access forbidden.');
  });

  it('maps model not found errors', async () => {
    const modelError = new Error('Model not found: invalid-model-name');
    const mapped = service['mapError'](modelError);

    expect(mapped.name).toBe('ModelNotFoundError');
    expect(mapped.message).toBe(
      'Requested Gemini model is not available.',
    );
  });

  it('maps generic errors', async () => {
    const genericError = new Error('Some other error');
    const mapped = service['mapError'](genericError);

    expect(mapped).toBeInstanceOf(Error);
    expect(mapped.message).toBe('Some other error');
  });
});