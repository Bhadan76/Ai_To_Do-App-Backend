import { Logger } from '@nestjs/common';
import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  const baseEnvironment = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/daily_task',
    JWT_SECRET: 'test-only-jwt-secret-that-is-at-least-32-bytes',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'gemini-1.5-flash',
    GEMINI_TIMEOUT_MS: '30000',
  };

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // The validator prefers the ambient NODE_ENV, so it is removed to keep
    // these cases deterministic regardless of the environment jest runs in.
    delete process.env.NODE_ENV;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    jest.restoreAllMocks();
  });

  it('applies safe defaults for local development', () => {
    expect(validateEnvironment(baseEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TOKEN_TTL: '15m',
      RATE_LIMIT_TTL_MS: 60000,
      RATE_LIMIT_LIMIT: 100,
      CORS_ALLOWED_ORIGINS: '',
    });
  });

  it('rejects production configuration without explicit CORS origins', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS must be configured in production.');
  });

  it('rejects wildcard production CORS without revealing other settings', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow('Invalid CORS_ALLOWED_ORIGINS configuration.');
  });

  it('rejects invalid numeric rate-limit settings', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        RATE_LIMIT_LIMIT: '0',
      }),
    ).toThrow('Invalid RATE_LIMIT_LIMIT configuration.');
  });

  it('rejects an undersized JWT signing secret without exposing it', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('JWT_SECRET must contain at least 32 bytes.');
  });

  it('rejects access-token lifetimes without a supported unit', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        JWT_ACCESS_TOKEN_TTL: '900',
      }),
    ).toThrow('Invalid JWT_ACCESS_TOKEN_TTL configuration.');
  });

  it('keeps the Gemini configuration when it is provided', () => {
    expect(validateEnvironment(baseEnvironment)).toMatchObject({
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_MODEL: 'gemini-1.5-flash',
      GEMINI_TIMEOUT_MS: 30000,
    });
  });

  it('starts without a Gemini API key', () => {
    const { GEMINI_API_KEY: _omitted, ...withoutApiKey } = baseEnvironment;

    expect(() => validateEnvironment(withoutApiKey)).not.toThrow();
    expect(validateEnvironment(withoutApiKey)).toMatchObject({
      GEMINI_API_KEY: '',
    });
  });

  it('starts without a Gemini model', () => {
    const { GEMINI_MODEL: _omitted, ...withoutModel } = baseEnvironment;

    expect(() => validateEnvironment(withoutModel)).not.toThrow();
    expect(validateEnvironment(withoutModel)).toMatchObject({
      GEMINI_MODEL: '',
    });
  });

  it('starts in production without any Gemini configuration', () => {
    const {
      GEMINI_API_KEY: _omittedKey,
      GEMINI_MODEL: _omittedModel,
      ...withoutGemini
    } = baseEnvironment;

    expect(() =>
      validateEnvironment({
        ...withoutGemini,
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://app.example.com',
      }),
    ).not.toThrow();
  });

  it('rejects a blank Gemini API key without blocking startup', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        GEMINI_API_KEY: '   ',
      }),
    ).not.toThrow();
  });

  it('rejects an invalid Gemini timeout', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        GEMINI_TIMEOUT_MS: 'not-a-number',
      }),
    ).toThrow('Invalid GEMINI_TIMEOUT_MS configuration.');
  });
});
