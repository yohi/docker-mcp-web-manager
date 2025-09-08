import { NextRequest } from 'next/server';
import { GET } from '../route';
import { db } from '@/db/connection';
import { DockerMCPClient } from '@/lib/docker-mcp/client';

describe('/api/v1/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/health', () => {
    it('returns healthy status when all services are up', async () => {
      // データベース接続をモック
      (db.select as jest.Mock).mockResolvedValue([{ count: 1 }]);
      
      // Docker 接続をモック
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        services: {
          database: {
            status: 'healthy',
            responseTime: expect.any(Number),
          },
          docker: {
            status: 'healthy',
            responseTime: expect.any(Number),
          },
        },
        version: expect.any(String),
        uptime: expect.any(Number),
      });
    });

    it('returns unhealthy status when database is down', async () => {
      // データベースエラーをモック
      (db.select as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      // Docker 接続は正常
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      expect(response.status).toBe(503);
      const data = await response.json();
      
      expect(data).toMatchObject({
        status: 'unhealthy',
        services: {
          database: {
            status: 'unhealthy',
            error: 'Database connection failed',
          },
          docker: {
            status: 'healthy',
            responseTime: expect.any(Number),
          },
        },
      });
    });

    it('returns unhealthy status when Docker is down', async () => {
      // データベース接続は正常
      (db.select as jest.Mock).mockResolvedValue([{ count: 1 }]);
      
      // Docker エラーをモック
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockRejectedValue(new Error('Docker daemon not running'));

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      expect(response.status).toBe(503);
      const data = await response.json();
      
      expect(data).toMatchObject({
        status: 'unhealthy',
        services: {
          database: {
            status: 'healthy',
            responseTime: expect.any(Number),
          },
          docker: {
            status: 'unhealthy',
            error: 'Docker daemon not running',
          },
        },
      });
    });

    it('returns unhealthy status when all services are down', async () => {
      // 両方のサービスでエラー
      (db.select as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockRejectedValue(new Error('Docker error'));

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      expect(response.status).toBe(503);
      const data = await response.json();
      
      expect(data.status).toBe('unhealthy');
      expect(data.services.database.status).toBe('unhealthy');
      expect(data.services.docker.status).toBe('unhealthy');
    });

    it('includes correct metadata', async () => {
      // すべて正常
      (db.select as jest.Mock).mockResolvedValue([{ count: 1 }]);
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      const data = await response.json();
      
      // メタデータの検証
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(data.version).toBe('2.0.0');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThan(0);
      
      // レスポンス時間の検証
      expect(data.services.database.responseTime).toBeGreaterThanOrEqual(0);
      expect(data.services.docker.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('handles partial service failures gracefully', async () => {
      // データベースは正常だが時間がかかる
      (db.select as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ count: 1 }]), 100))
      );
      
      // Docker はすぐに応答
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      const data = await response.json();
      
      expect(data.status).toBe('healthy');
      expect(data.services.database.responseTime).toBeGreaterThan(50);
      expect(data.services.docker.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('includes environment information', async () => {
      // NODE_ENV を設定
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      (db.select as jest.Mock).mockResolvedValue([{ count: 1 }]);
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      const data = await response.json();
      
      expect(data.environment).toBe('test');
      
      // 環境変数を復元
      process.env.NODE_ENV = originalEnv;
    });

    it('measures response times accurately', async () => {
      // 人工的な遅延を追加
      (db.select as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ count: 1 }]), 50))
      );
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 25))
      );

      const request = new NextRequest('http://localhost/api/v1/health');
      const response = await GET(request);
      
      const data = await response.json();
      
      // レスポンス時間が測定されていることを確認
      expect(data.services.database.responseTime).toBeGreaterThanOrEqual(50);
      expect(data.services.docker.responseTime).toBeGreaterThanOrEqual(25);
    });

    it('handles timeout scenarios', async () => {
      // 非常に長い遅延（実際のタイムアウト設定による）
      (db.select as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([{ count: 1 }]), 10000))
      );
      
      const dockerClient = DockerMCPClient.getInstance();
      (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/health');
      
      // タイムアウト時間内でテストを完了させるため、短めの時間でテスト
      const startTime = Date.now();
      const response = await GET(request);
      const endTime = Date.now();
      
      // リクエストが合理的な時間内に完了することを確認
      expect(endTime - startTime).toBeLessThan(5000);
      
      // レスポンスステータスを確認
      expect(response.status).toBeGreaterThanOrEqual(200);
    }, 6000);
  });
});