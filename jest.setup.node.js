// Node.js environment setup for API tests
require('@testing-library/jest-dom');

// Mock environment variables
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.DATABASE_URL = 'test.db';
process.env.ENCRYPTION_MASTER_KEY = 'test-key-base64-encoded';

// Global test utilities
global.fetch = jest.fn();

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
