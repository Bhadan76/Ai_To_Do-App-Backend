import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GEMINI_UNAVAILABLE_MESSAGE } from './gemini-gateway.token';

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
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: 'GoogleGenAI_TOKEN',
          useValue: mockClient,
        },
        {
          provide: 'GEMINI_MODEL',
          useValue: 'gemini-test-model',
        },
        {
          provide: 'GEMINI_TIMEOUT_MS',
          useValue: 30000,
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

  it('uses the configured model instead of a hardcoded one', async () => {
    await service.generateContent(['user: Hello']);

    expect(mockGoogleGenAI.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-test-model' }),
    );
  });

  it('counts tokens', async () => {
    const result = await service.countTokens(['user: Hello']);

    expect(result).toBe(50);
    expect(mockGoogleGenAI.models.countTokens).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-test-model' }),
    );
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

describe('GeminiService without Gemini configuration', () => {
  async function createService(
    providers: Array<Record<string, unknown>>,
  ): Promise<GeminiService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [...providers, GeminiService],
    }).compile();

    return module.get(GeminiService);
  }

  it('is not configured when no client is provided', async () => {
    const service = await createService([]);

    expect(service.isConfigured()).toBe(false);
  });

  it('is not configured when the model is missing', async () => {
    const service = await createService([
      {
        provide: 'GoogleGenAI_TOKEN',
        useValue: mockClient,
      },
    ]);

    expect(service.isConfigured()).toBe(false);
  });

  it('does not call Gemini and answers with 503 when it is not configured', async () => {
    const service = await createService([]);

    await expect(service.generateContent(['user: Hello'])).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(service.generateContent(['user: Hello'])).rejects.toThrow(
      GEMINI_UNAVAILABLE_MESSAGE,
    );
    expect(mockGoogleGenAI.models.generateContent).not.toHaveBeenCalled();
  });

  it('answers with 503 when counting tokens without a configuration', async () => {
    const service = await createService([]);

    await expect(service.countTokens(['user: Hello'])).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(mockGoogleGenAI.models.countTokens).not.toHaveBeenCalled();
  });
});
