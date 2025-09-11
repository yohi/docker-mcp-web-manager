/**
 * サーバー管理API統合テスト
 * /api/v1/servers エンドポイントのテスト
 */

import { NextRequest } from 'next/server';
import { GET, POST, resetMockServers } from '../v1/servers/route';

describe('/api/v1/servers', () => {
  beforeEach(() => {
    resetMockServers();
  });

  describe('GET /api/v1/servers', () => {
    it('should return paginated server list with default parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/servers');
      const response = await GET(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        success: true,
        data: expect.any(Array),
        pagination: {
          page: 1,
          limit: 20,
          total: expect.any(Number),
          totalPages: expect.any(Number),
          hasNext: expect.any(Boolean),
          hasPrev: expect.any(Boolean),
        },
        meta: {
          version: 'v1',
          requestId: expect.any(String),
          timestamp: expect.any(String),
          duration: undefined,
        },
      });
    });

    it('should handle custom pagination parameters', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/servers?page=2&limit=10'
      );
      const response = await GET(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.pagination.page).toBe(2);
      expect(responseData.pagination.limit).toBe(10);
    });

    it('should enforce maximum limit', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/servers?limit=200'
      );
      const response = await GET(request);
      const responseData = await response.json();

      expect(responseData.pagination.limit).toBe(100); // should be capped at 100
    });
  });

  describe('POST /api/v1/servers', () => {
    const validServerData = {
      name: 'test-server',
      image: 'node:latest',
      port: 3000,
      description: 'Test server',
      version: '1.0.0',
      environment: { NODE_ENV: 'production' },
      resourceLimits: { memory: '1g', cpu: '1' },
    };

    it('should create a new server with valid data', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        body: JSON.stringify(validServerData),
        headers: { 'content-type': 'application/json' },
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(201);
      expect(responseData).toEqual({
        success: true,
        data: expect.objectContaining({
          name: 'test-server',
          image: 'node:latest',
          port: 3000,
          status: 'stopped',
        }),
        meta: {
          version: 'v1',
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });

    it('should validate required fields', async () => {
      const invalidData = {
        name: 'test-server',
        // missing image and port
      };

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        body: JSON.stringify(invalidData),
        headers: { 'content-type': 'application/json' },
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({
        success: false,
        error: {
          code: 'SERVER_002',
          message: '必須フィールドが不足しています (name, image, port)',
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });

    it('should validate port range', async () => {
      const invalidPortData = {
        ...validServerData,
        port: 100000, // invalid port
      };

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        body: JSON.stringify(invalidPortData),
        headers: { 'content-type': 'application/json' },
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData).toEqual({
        success: false,
        error: {
          code: 'SERVER_003',
          message: 'ポート番号は1-65535の範囲で指定してください',
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });

    it('should check for duplicate server names', async () => {
      // 新規サーバー作成（ユニークな名前）
      const uniqueServerData = {
        ...validServerData,
        name: 'unique-test-server'
      };

      const firstRequest = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        body: JSON.stringify(uniqueServerData),
        headers: { 'content-type': 'application/json' },
      });

      const firstResponse = await POST(firstRequest);
      expect(firstResponse.status).toBe(201);

      // 同じ名前で再度作成を試行
      const duplicateRequest = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        body: JSON.stringify(uniqueServerData),
        headers: { 'content-type': 'application/json' },
      });

      const duplicateResponse = await POST(duplicateRequest);
      const responseData = await duplicateResponse.json();

      expect(duplicateResponse.status).toBe(409);
      expect(responseData).toEqual({
        success: false,
        error: {
          code: 'SERVER_004',
          message: '同じ名前のサーバーが既に存在します',
          requestId: expect.any(String),
          timestamp: expect.any(String),
        },
      });
    });
  });
});
