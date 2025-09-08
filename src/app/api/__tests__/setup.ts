import { createMocks } from 'node-mocks-http';
import type { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

// NextAuth のモック
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

// データベースのモック
jest.mock('@/db/connection', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: {
      servers: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      users: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      settings: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    },
  },
}));

// Docker API のモック
jest.mock('@/lib/docker-mcp/client', () => ({
  DockerMCPClient: {
    getInstance: () => ({
      listContainers: jest.fn(),
      getContainer: jest.fn(),
      startContainer: jest.fn(),
      stopContainer: jest.fn(),
      restartContainer: jest.fn(),
      createContainer: jest.fn(),
      deleteContainer: jest.fn(),
      getContainerLogs: jest.fn(),
      getContainerStats: jest.fn(),
    }),
  },
}));

// 暗号化のモック
jest.mock('@/lib/crypto/encryption', () => ({
  encrypt: jest.fn((data: string) => `encrypted_${data}`),
  decrypt: jest.fn((data: string) => data.replace('encrypted_', '')),
  generateKey: jest.fn(() => 'mock-key'),
  hash: jest.fn((data: string) => `hashed_${data}`),
}));

// テスト用ヘルパー関数
export const mockSession = (session: any = null) => {
  (getServerSession as jest.Mock).mockResolvedValue(session);
};

export const mockAdminSession = () => {
  mockSession({
    user: {
      id: 'admin-user-id',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'ADMIN',
    },
    expires: '2024-12-31T23:59:59.999Z',
  });
};

export const mockUserSession = () => {
  mockSession({
    user: {
      id: 'user-id',
      email: 'user@example.com', 
      name: 'Regular User',
      role: 'USER',
    },
    expires: '2024-12-31T23:59:59.999Z',
  });
};

export const mockViewerSession = () => {
  mockSession({
    user: {
      id: 'viewer-id',
      email: 'viewer@example.com',
      name: 'Viewer User', 
      role: 'VIEWER',
    },
    expires: '2024-12-31T23:59:59.999Z',
  });
};

// API ルート テスト用ヘルパー
export const createAPITestRequest = (method: string, url: string, body?: any) => {
  const { req, res } = createMocks({ method, url, body });
  return { req: req as unknown as NextRequest, res: res as unknown as NextResponse };
};

// レスポンスマッチャー
export const expectAPIResponse = (res: any, status: number, data?: any) => {
  expect(res._getStatusCode()).toBe(status);
  
  if (data !== undefined) {
    const responseData = JSON.parse(res._getData());
    expect(responseData).toMatchObject(data);
  }
};

// エラーレスポンスマッチャー
export const expectAPIError = (res: any, status: number, message?: string) => {
  expect(res._getStatusCode()).toBe(status);
  
  const responseData = JSON.parse(res._getData());
  expect(responseData).toHaveProperty('error');
  
  if (message) {
    expect(responseData.error.message).toBe(message);
  }
};

// 認証エラーマッチャー
export const expectUnauthorized = (res: any) => {
  expectAPIError(res, 401, 'Unauthorized');
};

// 権限エラーマッチャー
export const expectForbidden = (res: any) => {
  expectAPIError(res, 403, 'Forbidden');
};

// バリデーションエラーマッチャー  
export const expectValidationError = (res: any) => {
  expect(res._getStatusCode()).toBe(400);
  
  const responseData = JSON.parse(res._getData());
  expect(responseData).toHaveProperty('error');
  expect(responseData.error.type).toBe('VALIDATION_ERROR');
};

// データベースクリーンアップ
export const clearDatabase = () => {
  jest.clearAllMocks();
};

// 共通のテストデータ
export const testServer = {
  id: 'test-server-id',
  name: 'test-server',
  displayName: 'Test Server',
  description: 'Test server description',
  image: 'test/server:latest',
  status: 'running',
  category: 'development',
  version: '1.0.0',
  port: 3001,
  config: {},
  env: {},
  healthCheck: {
    enabled: true,
    path: '/health',
    interval: 30,
    timeout: 5,
    retries: 3,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  userId: 'user-id',
};

export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'USER',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// 環境変数設定
beforeAll(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret';
  process.env.DATABASE_URL = 'test.db';
  process.env.ENCRYPTION_MASTER_KEY = 'test-key-base64-encoded';
});

// テスト後クリーンアップ
afterEach(() => {
  jest.clearAllMocks();
  clearDatabase();
});