process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-not-for-any-environment-outside-tests';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_MODEL = 'gemini-1.5-flash';
process.env.GEMINI_TIMEOUT_MS = '30000';