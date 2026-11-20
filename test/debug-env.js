process.env.JWT_SECRET = 'test-only-secret-not-for-any-environment-outside-tests-xyz';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GEMINI_MODEL = 'gemini-1.5-flash';
process.env.GEMINI_TIMEOUT_MS = '30000';
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const { Buffer } = require('buffer');
console.log('JWT_SECRET:', process.env.JWT_SECRET);
console.log('JWT_SECRET length:', Buffer.byteLength(process.env.JWT_SECRET, 'utf8'));
console.log('JWT_SECRET valid:', Buffer.byteLength(process.env.JWT_SECRET, 'utf8') >= 32);