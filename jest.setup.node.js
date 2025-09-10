// Jest setup for Node.js environment (API routes and lib tests)

// Mock environment variables
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.DATABASE_URL = 'test.db';
process.env.ENCRYPTION_MASTER_KEY = 'dGVzdC1rZXktYmFzZTY0LWVuY29kZWQ='; // Base64エンコードされたテストキー

// Mock Next.js server components
global.Request = jest.fn().mockImplementation((url, options = {}) => ({
  url,
  method: options.method || 'GET',
  headers: new Map(Object.entries(options.headers || {})),
  json: jest.fn(),
  text: jest.fn(),
}));

global.Response = jest.fn().mockImplementation((body, options = {}) => ({
  status: options.status || 200,
  headers: new Map(Object.entries(options.headers || {})),
  json: jest.fn().mockReturnValue(Promise.resolve(body)),
  text: jest.fn().mockReturnValue(Promise.resolve(body)),
}));

// Mock Next.js NextRequest and NextResponse
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, options = {}) => ({
    url,
    method: options.method || 'GET',
    headers: new Map(Object.entries(options.headers || {})),
    json: jest.fn(),
    text: jest.fn(),
    nextUrl: new URL(url),
    cookies: {
      get: jest.fn(),
      set: jest.fn(),
    },
  })),
  NextResponse: {
    json: jest.fn().mockImplementation((body, options = {}) => ({
      status: options.status || 200,
      headers: new Map(Object.entries(options.headers || {})),
      json: jest.fn().mockReturnValue(Promise.resolve(body)),
    })),
    redirect: jest.fn(),
    rewrite: jest.fn(),
  },
}));

// Mock Next Auth for server-side
jest.mock('next-auth', () => ({
  default: jest.fn(),
  getServerSession: jest.fn(),
}));

// Mock NextAuth options
jest.mock('@/lib/auth/nextauth-options', () => ({
  authOptions: {
    providers: [],
    callbacks: {},
  },
}));

// Mock database connection
jest.mock('@/db/connection', () => ({
  default: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
  },
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
  },
  initializeDatabase: jest.fn(),
  healthCheck: jest.fn(),
  closeDatabase: jest.fn(),
}));

// Mock crypto module for encryption tests
jest.mock('crypto', () => ({
  createCipherGCM: jest.fn().mockImplementation(() => ({
    update: jest.fn().mockReturnValue(Buffer.from('encrypted')),
    final: jest.fn().mockReturnValue(Buffer.from('final')),
    getAuthTag: jest.fn().mockReturnValue(Buffer.from('auth-tag')),
  })),
  createDecipherGCM: jest.fn().mockImplementation(() => ({
    setAuthTag: jest.fn(),
    update: jest.fn().mockReturnValue(Buffer.from('decrypted')),
    final: jest.fn().mockReturnValue(Buffer.from('final')),
  })),
  randomBytes: jest.fn().mockReturnValue(Buffer.from('random-bytes')),
  createHash: jest.fn().mockImplementation(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('hashed-value'),
  })),
}));

// Global test utilities for Node environment
global.fetch = jest.fn();

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

console.log('Node.js test environment setup complete');