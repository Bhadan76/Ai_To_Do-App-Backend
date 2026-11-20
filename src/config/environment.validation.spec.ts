import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  const baseEnvironment = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/daily_task',
    JWT_SECRET: 'test-only-jwt-secret-that-is-at-least-32-bytes',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'gemini-1.5-flash',
    GEMINI_TIMEOUT_MS: '30000',
  };

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
});
