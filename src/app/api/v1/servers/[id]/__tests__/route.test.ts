import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from '../route';
import {
  mockAdminSession,
  mockUserSession,
  mockViewerSession,
  mockSession,
  testServer,
} from '../../../__tests__/setup';
import { db } from '@/db/connection';
import { DockerMCPClient } from '@/lib/docker-mcp/client';

// パラメータモック用のヘルパー
const createRequestWithParams = (method: string, url: string, params: { id: string }, body?: any) => {
  const request = new NextRequest(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  
  // Next.js のパラメータを模擬
  (request as any).params = params;
  return request;
};

describe('/api/v1/servers/[id]', () => {
  const serverId = 'test-server-id';
  const context = { params: { id: serverId } };

  describe('GET /api/v1/servers/[id]', () => {
    beforeEach(() => {
      (db.query.servers.findFirst as jest.Mock).mockReset();
    });

    it('returns server details for authenticated user', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);

      const request = createRequestWithParams('GET', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await GET(request, context);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(testServer);
    });

    it('returns 404 for non-existent server', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createRequestWithParams('GET', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await GET(request, context);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error.message).toBe('Server not found');
    });

    it('returns 403 for user accessing another users server', async () => {
      mockUserSession();
      
      const otherUsersServer = { ...testServer, userId: 'other-user-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(otherUsersServer);

      const request = createRequestWithParams('GET', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await GET(request, context);
      
      expect(response.status).toBe(403);
    });

    it('allows admin to access any server', async () => {
      mockAdminSession();
      
      const anyServer = { ...testServer, userId: 'any-user-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(anyServer);

      const request = createRequestWithParams('GET', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await GET(request, context);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toEqual(anyServer);
    });

    it('returns 401 for unauthenticated user', async () => {
      mockSession(null);

      const request = createRequestWithParams('GET', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await GET(request, context);
      
      expect(response.status).toBe(401);
    });

    it('includes Docker container status', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);
      
      // Docker ステータスをモック
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.getContainer as jest.Mock).mockResolvedValue({
        id: 'container-id',
        status: 'running',
        state: {
          Status: 'running',
          Running: true,
          StartedAt: '2024-01-01T00:00:00.000Z',
        },
      });

      const request = createRequestWithParams('GET', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await GET(request, context);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.containerStatus).toEqual({
        id: 'container-id',
        status: 'running',
        state: {
          Status: 'running',
          Running: true,
          StartedAt: '2024-01-01T00:00:00.000Z',
        },
      });
    });
  });

  describe('PATCH /api/v1/servers/[id]', () => {
    const updateData = {
      displayName: 'Updated Server',
      description: 'Updated description',
      config: { newKey: 'newValue' },
    };

    beforeEach(() => {
      (db.query.servers.findFirst as jest.Mock).mockReset();
      (db.query.servers.update as jest.Mock).mockReset();
    });

    it('updates server for owner', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);
      
      const updatedServer = { ...testServer, ...updateData };
      (db.query.servers.update as jest.Mock).mockResolvedValue(updatedServer);

      const request = createRequestWithParams(
        'PATCH', 
        `http://localhost/api/v1/servers/${serverId}`, 
        { id: serverId },
        updateData
      );
      const response = await PATCH(request, context);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.displayName).toBe(updateData.displayName);
    });

    it('allows admin to update any server', async () => {
      mockAdminSession();
      
      const anyServer = { ...testServer, userId: 'any-user-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(anyServer);
      
      const updatedServer = { ...anyServer, ...updateData };
      (db.query.servers.update as jest.Mock).mockResolvedValue(updatedServer);

      const request = createRequestWithParams(
        'PATCH',
        `http://localhost/api/v1/servers/${serverId}`,
        { id: serverId },
        updateData
      );
      const response = await PATCH(request, context);
      
      expect(response.status).toBe(200);
    });

    it('returns 403 for viewer role', async () => {
      mockViewerSession();
      
      const viewerServer = { ...testServer, userId: 'viewer-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(viewerServer);

      const request = createRequestWithParams(
        'PATCH',
        `http://localhost/api/v1/servers/${serverId}`,
        { id: serverId },
        updateData
      );
      const response = await PATCH(request, context);
      
      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent server', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createRequestWithParams(
        'PATCH',
        `http://localhost/api/v1/servers/${serverId}`,
        { id: serverId },
        updateData
      );
      const response = await PATCH(request, context);
      
      expect(response.status).toBe(404);
    });

    it('validates update data', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);

      const invalidData = { port: 'invalid' };

      const request = createRequestWithParams(
        'PATCH',
        `http://localhost/api/v1/servers/${serverId}`,
        { id: serverId },
        invalidData
      );
      const response = await PATCH(request, context);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe('VALIDATION_ERROR');
    });

    it('prevents updating name to existing server name', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock)
        .mockResolvedValueOnce(testServer) // Current server
        .mockResolvedValueOnce({ ...testServer, id: 'other-id' }); // Existing server with same name

      const nameUpdate = { name: 'existing-name' };

      const request = createRequestWithParams(
        'PATCH',
        `http://localhost/api/v1/servers/${serverId}`,
        { id: serverId },
        nameUpdate
      );
      const response = await PATCH(request, context);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.message).toContain('already exists');
    });
  });

  describe('DELETE /api/v1/servers/[id]', () => {
    beforeEach(() => {
      (db.query.servers.findFirst as jest.Mock).mockReset();
      (db.query.servers.delete as jest.Mock).mockReset();
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.deleteContainer as jest.Mock).mockReset();
      (dockerClient.stopContainer as jest.Mock).mockReset();
    });

    it('deletes server for owner', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);
      (db.query.servers.delete as jest.Mock).mockResolvedValue(testServer);
      
      // Docker 操作をモック
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.stopContainer as jest.Mock).mockResolvedValue({});
      (dockerClient.deleteContainer as jest.Mock).mockResolvedValue({});

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      expect(response.status).toBe(204);
      
      // Docker 操作が呼ばれたことを確認
      expect(dockerClient.stopContainer).toHaveBeenCalledWith(testServer.name);
      expect(dockerClient.deleteContainer).toHaveBeenCalledWith(testServer.name);
    });

    it('allows admin to delete any server', async () => {
      mockAdminSession();
      
      const anyServer = { ...testServer, userId: 'any-user-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(anyServer);
      (db.query.servers.delete as jest.Mock).mockResolvedValue(anyServer);
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.stopContainer as jest.Mock).mockResolvedValue({});
      (dockerClient.deleteContainer as jest.Mock).mockResolvedValue({});

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      expect(response.status).toBe(204);
    });

    it('returns 403 for viewer role', async () => {
      mockViewerSession();
      
      const viewerServer = { ...testServer, userId: 'viewer-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(viewerServer);

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      expect(response.status).toBe(403);
    });

    it('returns 403 for user accessing another users server', async () => {
      mockUserSession();
      
      const otherUsersServer = { ...testServer, userId: 'other-user-id' };
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(otherUsersServer);

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      expect(response.status).toBe(403);
    });

    it('returns 404 for non-existent server', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(null);

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      expect(response.status).toBe(404);
    });

    it('handles Docker deletion errors gracefully', async () => {
      mockUserSession();
      
      (db.query.servers.findFirst as jest.Mock).mockResolvedValue(testServer);
      (db.query.servers.delete as jest.Mock).mockResolvedValue(testServer);
      
      // Docker エラーをモック
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.stopContainer as jest.Mock).mockRejectedValue(new Error('Container not found'));
      (dockerClient.deleteContainer as jest.Mock).mockResolvedValue({});

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      // データベースからは削除されるが、Docker エラーがあってもレスポンスは成功
      expect(response.status).toBe(204);
    });

    it('returns 401 for unauthenticated user', async () => {
      mockSession(null);

      const request = createRequestWithParams('DELETE', `http://localhost/api/v1/servers/${serverId}`, { id: serverId });
      const response = await DELETE(request, context);
      
      expect(response.status).toBe(401);
    });
  });
});