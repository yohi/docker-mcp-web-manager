import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { 
  mockAdminSession,
  mockUserSession,
  mockViewerSession,
  mockSession,
  testServer,
  expectAPIResponse,
  expectUnauthorized,
  expectForbidden,
  expectValidationError
} from '../../__tests__/setup';
import { db } from '@/db/connection';
import { DockerMCPClient } from '@/lib/docker-mcp/client';

describe('/api/v1/servers', () => {
  describe('GET /api/v1/servers', () => {
    beforeEach(() => {
      // データベースモックのリセット
      (db.query.servers.findMany as jest.Mock).mockReset();
    });

    it('returns servers for authenticated admin user', async () => {
      mockAdminSession();
      
      const mockServers = [testServer];
      (db.query.servers.findMany as jest.Mock).mockResolvedValue(mockServers);

      const request = new NextRequest('http://localhost/api/v1/servers');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        data: mockServers,
      });
    });

    it('returns user servers for authenticated user', async () => {
      mockUserSession();
      
      const userServers = [{ ...testServer, userId: 'user-id' }];
      (db.query.servers.findMany as jest.Mock).mockResolvedValue(userServers);

      const request = new NextRequest('http://localhost/api/v1/servers');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toEqual(userServers);
    });

    it('returns servers for viewer with read-only access', async () => {
      mockViewerSession();
      
      const viewerServers = [{ ...testServer, userId: 'viewer-id' }];
      (db.query.servers.findMany as jest.Mock).mockResolvedValue(viewerServers);

      const request = new NextRequest('http://localhost/api/v1/servers');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toEqual(viewerServers);
    });

    it('returns 401 for unauthenticated user', async () => {
      mockSession(null);

      const request = new NextRequest('http://localhost/api/v1/servers');
      const response = await GET(request);
      
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.message).toBe('Unauthorized');
    });

    it('supports search filtering', async () => {
      mockUserSession();
      
      const request = new NextRequest('http://localhost/api/v1/servers?search=test');
      const response = await GET(request);
      
      expect(db.query.servers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function)
        })
      );
    });

    it('supports status filtering', async () => {
      mockUserSession();
      
      const request = new NextRequest('http://localhost/api/v1/servers?status=running');
      const response = await GET(request);
      
      expect(db.query.servers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function)
        })
      );
    });

    it('supports category filtering', async () => {
      mockUserSession();
      
      const request = new NextRequest('http://localhost/api/v1/servers?category=development');
      const response = await GET(request);
      
      expect(db.query.servers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function)
        })
      );
    });

    it('handles database errors gracefully', async () => {
      mockUserSession();
      
      (db.query.servers.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/v1/servers');
      const response = await GET(request);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Internal server error');
    });
  });

  describe('POST /api/v1/servers', () => {
    const validServerData = {
      name: 'new-server',
      displayName: 'New Server',
      description: 'New test server',
      image: 'test/new-server:latest',
      category: 'development',
      port: 3001,
      config: { key: 'value' },
      env: { NODE_ENV: 'development' },
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: 30,
        timeout: 5,
        retries: 3,
      },
    };

    beforeEach(() => {
      (db.query.servers.create as jest.Mock).mockReset();
      (db.query.servers.findFirst as jest.Mock).mockReset();
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.createContainer as jest.Mock).mockReset();
      (dockerClient.startContainer as jest.Mock).mockReset();
    });

    it('creates server for authenticated user', async () => {
      mockUserSession();
      
      // 名前の重複チェック
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(null);
      
      // サーバー作成
      const createdServer = { ...testServer, ...validServerData, id: 'new-server-id' };
      (db.query.servers.create as jest.Mock).mockResolvedValue(createdServer);
      
      // Docker コンテナ作成
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.createContainer as jest.Mock).mockResolvedValue({ id: 'container-id' });
      (dockerClient.startContainer as jest.Mock).mockResolvedValue({});

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        name: validServerData.name,
        displayName: validServerData.displayName,
      });
    });

    it('prevents duplicate server names', async () => {
      mockUserSession();
      
      // 既存サーバーをモック
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('already exists');
    });

    it('validates required fields', async () => {
      mockUserSession();

      const invalidData = { ...validServerData };
      delete invalidData.name;

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe('VALIDATION_ERROR');
    });

    it('validates server name format', async () => {
      mockUserSession();

      const invalidData = { ...validServerData, name: 'Invalid Name!' };

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe('VALIDATION_ERROR');
    });

    it('validates port number range', async () => {
      mockUserSession();

      const invalidData = { ...validServerData, port: 99999 };

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe('VALIDATION_ERROR');
    });

    it('returns 401 for unauthenticated user', async () => {
      mockSession(null);

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });
      
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('returns 403 for viewer role', async () => {
      mockViewerSession();

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });
      
      const response = await POST(request);
      expect(response.status).toBe(403);
    });

    it('handles Docker container creation failure', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(null);
      (db.query.servers.create as jest.Mock).mockResolvedValue({ ...testServer, id: 'new-id' });
      
      // Docker エラーをモック
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.createContainer as jest.Mock).mockRejectedValue(new Error('Docker error'));

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toContain('Failed to create container');
    });

    it('handles malformed JSON', async () => {
      mockUserSession();

      const request = new NextRequest('http://localhost/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe('VALIDATION_ERROR');
    });
  });
});