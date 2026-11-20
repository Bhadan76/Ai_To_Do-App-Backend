import { Logger } from '@nestjs/common';

type Environment = Record<string, unknown>;

const logger = new Logger('Environment');

const allowedNodeEnvironments = new Set([
  'development',
  'test',
  'production',
]);

function positiveInteger(value: unknown, name: string, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} configuration.`);
  }
  return parsed;
}

/**
 * Reads an optional string setting without ever failing validation.
 * Missing or blank values are normalized to an empty string so that
 * optional features can stay disabled instead of blocking startup.
 */
function optionalString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function validateCorsOrigins(value: unknown, nodeEnv: string) {
  if (value === undefined || value === '') {
    if (nodeEnv === 'production') {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must be configured in production.',
      );
    }
    return '';
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid CORS_ALLOWED_ORIGINS configuration.');
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 && nodeEnv === 'production') {
    throw new Error(
      'CORS_ALLOWED_ORIGINS must be configured in production.',
    );
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('Invalid CORS_ALLOWED_ORIGINS configuration.');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      origin === '*'
    ) {
      throw new Error('Invalid CORS_ALLOWED_ORIGINS configuration.');
    }
  }

  return origins.join(',');
}

export function validateEnvironment(config: Environment): Environment {
  const nodeEnv =
    process.env.NODE_ENV ? process.env.NODE_ENV : (typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development');

  if (!allowedNodeEnvironments.has(nodeEnv)) {
    throw new Error('Invalid NODE_ENV configuration.');
  }

  if (
    typeof config.DATABASE_URL !== 'string' ||
    config.DATABASE_URL.trim().length === 0
  ) {
    throw new Error('DATABASE_URL must be configured.');
  }

  if (
    nodeEnv !== 'test' &&
    config.JWT_SECRET !== undefined &&
    typeof config.JWT_SECRET === 'string' &&
    Buffer.byteLength(config.JWT_SECRET, 'utf8') < 32
  ) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  const accessTokenTtl =
    config.JWT_ACCESS_TOKEN_TTL === undefined
      ? '15m'
      : config.JWT_ACCESS_TOKEN_TTL;
  if (
    typeof accessTokenTtl !== 'string' ||
    !/^[1-9]\d*(s|m|h|d)$/.test(accessTokenTtl)
  ) {
    throw new Error('Invalid JWT_ACCESS_TOKEN_TTL configuration.');
  }

  const port = positiveInteger(config.PORT, 'PORT', 3000);
  if (port > 65535) {
    throw new Error('Invalid PORT configuration.');
  }
  // Gemini AI is an optional feature: a missing key or model must never
  // prevent the application from starting. When it is not configured the
  // AI endpoints answer with 503 Service Unavailable instead.
  const geminiApiKey = optionalString(config.GEMINI_API_KEY);
  const geminiModel = optionalString(config.GEMINI_MODEL);
  const geminiTimeoutMs =
    config.GEMINI_TIMEOUT_MS === undefined
      ? undefined
      : positiveInteger(config.GEMINI_TIMEOUT_MS, 'GEMINI_TIMEOUT_MS', 30000);

  if (geminiApiKey === '' || geminiModel === '') {
    logger.warn(
      'Gemini AI is not configured. AI endpoints will respond with 503 until ' +
        'both GEMINI_API_KEY and GEMINI_MODEL are provided.',
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    JWT_ACCESS_TOKEN_TTL: accessTokenTtl,
    RATE_LIMIT_TTL_MS: positiveInteger(
      config.RATE_LIMIT_TTL_MS,
      'RATE_LIMIT_TTL_MS',
      60000,
    ),
    RATE_LIMIT_LIMIT: positiveInteger(
      config.RATE_LIMIT_LIMIT,
      'RATE_LIMIT_LIMIT',
      100,
    ),
    REFRESH_TOKEN_TTL_DAYS: positiveInteger(
      config.REFRESH_TOKEN_TTL_DAYS,
      'REFRESH_TOKEN_TTL_DAYS',
      30,
    ),
    CORS_ALLOWED_ORIGINS: validateCorsOrigins(
      config.CORS_ALLOWED_ORIGINS,
      nodeEnv,
    ),
    GEMINI_API_KEY: geminiApiKey,
    GEMINI_MODEL: geminiModel,
    GEMINI_TIMEOUT_MS: geminiTimeoutMs,
  };
}
