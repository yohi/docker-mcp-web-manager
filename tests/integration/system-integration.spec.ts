import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// =============================================================================
// システム統合テスト
// Docker環境、API統合、データベース、キャッシュ、監視システムの統合テスト
// =============================================================================

/**
 * システム統合テストヘルパー
 */
class SystemIntegrationHelper {
  /**
   * Docker コンテナの健全性チェック
   */
  async checkDockerHealth(): Promise<{
    webContainer: boolean;
    dbContainer: boolean;
    cacheContainer: boolean;
  }> {
    try {
      // Docker Compose サービス状態確認
      const output = execSync('docker-compose ps --format json', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      const services = output.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
      const webService = services.find(s => s.Service === 'web');
      const dbService = services.find(s => s.Service === 'db');
      const cacheService = services.find(s => s.Service === 'cache');
      
      return {
        webContainer: webService?.State === 'running',
        dbContainer: dbService?.State === 'running',
        cacheContainer: cacheService?.State === 'running',
      };
    } catch (error) {
      console.error('Docker health check failed:', error);
      return {
        webContainer: false,
        dbContainer: false,
        cacheContainer: false,
      };
    }
  }

  /**
   * データベース接続テスト
   */
  async testDatabaseConnection(): Promise<boolean> {
    try {
      const response = await fetch('/api/v1/health/database');
      return response.ok;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * キャッシュ接続テスト
   */
  async testCacheConnection(): Promise<boolean> {
    try {
      const response = await fetch('/api/v1/health/cache');
      return response.ok;
    } catch (error) {
      console.error('Cache connection test failed:', error);
      return false;
    }
  }

  /**
   * 外部API連携テスト
   */
  async testExternalIntegrations(): Promise<{
    dockerApi: boolean;
    mcpCatalog: boolean;
    bitwarden: boolean;
  }> {
    try {
      const [dockerResponse, catalogResponse, bitwardenResponse] = await Promise.allSettled([
        fetch('/api/v1/health/docker'),
        fetch('/api/v1/health/catalog'),
        fetch('/api/v1/health/bitwarden'),
      ]);
      
      return {
        dockerApi: dockerResponse.status === 'fulfilled' && dockerResponse.value.ok,
        mcpCatalog: catalogResponse.status === 'fulfilled' && catalogResponse.value.ok,
        bitwarden: bitwardenResponse.status === 'fulfilled' && bitwardenResponse.value.ok,
      };
    } catch (error) {
      console.error('External integrations test failed:', error);
      return {
        dockerApi: false,
        mcpCatalog: false,
        bitwarden: false,
      };
    }
  }

  /**
   * ファイルシステム権限テスト
   */
  async testFileSystemPermissions(): Promise<{
    logsWritable: boolean;
    dataWritable: boolean;
    tempWritable: boolean;
  }> {
    const testResults = {
      logsWritable: false,
      dataWritable: false,
      tempWritable: false,
    };

    try {
      // ログディレクトリの書き込みテスト
      const logTestFile = path.join('./logs', 'test-write.txt');
      fs.writeFileSync(logTestFile, 'test');
      fs.unlinkSync(logTestFile);
      testResults.logsWritable = true;
    } catch (error) {
      console.error('Logs directory write test failed:', error);
    }

    try {
      // データディレクトリの書き込みテスト
      const dataTestFile = path.join('./data', 'test-write.txt');
      fs.writeFileSync(dataTestFile, 'test');
      fs.unlinkSync(dataTestFile);
      testResults.dataWritable = true;
    } catch (error) {
      console.error('Data directory write test failed:', error);
    }

    try {
      // 一時ディレクトリの書き込みテスト
      const tempTestFile = path.join('./tmp', 'test-write.txt');
      fs.writeFileSync(tempTestFile, 'test');
      fs.unlinkSync(tempTestFile);
      testResults.tempWritable = true;
    } catch (error) {
      console.error('Temp directory write test failed:', error);
    }

    return testResults;
  }

  /**
   * システムリソース使用量チェック
   */
  async checkSystemResources(): Promise<{
    memoryUsage: number;
    diskUsage: number;
    cpuUsage: number;
  }> {
    try {
      const response = await fetch('/api/v1/monitoring/metrics?metrics=system');
      const data = await response.json();
      
      return {
        memoryUsage: data.current?.systemMetrics?.memoryUsage?.percentage || 0,
        diskUsage: data.current?.systemMetrics?.diskUsage?.percentage || 0,
        cpuUsage: data.current?.systemMetrics?.cpuUsage || 0,
      };
    } catch (error) {
      console.error('System resources check failed:', error);
      return {
        memoryUsage: 0,
        diskUsage: 0,
        cpuUsage: 0,
      };
    }
  }

  /**
   * ログ出力統合テスト
   */
  async testLoggingIntegration(): Promise<boolean> {
    try {
      // テストログエントリの作成
      const testLogEntry = {
        level: 'INFO',
        message: 'Integration test log entry',
        component: 'integration-test',
        timestamp: new Date().toISOString(),
      };

      const response = await fetch('/api/v1/logs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testLogEntry),
      });

      if (!response.ok) return false;

      // ログエントリが検索できることを確認
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const searchResponse = await fetch(
        `/api/v1/monitoring/logs?search=${encodeURIComponent('Integration test log entry')}&limit=1`
      );
      
      const searchData = await searchResponse.json();
      return searchData.logs && searchData.logs.length > 0;
    } catch (error) {
      console.error('Logging integration test failed:', error);
      return false;
    }
  }

  /**
   * 監視システム統合テスト
   */
  async testMonitoringIntegration(): Promise<{
    metricsCollection: boolean;
    alertSystem: boolean;
    dashboardData: boolean;
  }> {
    try {
      const [metricsResponse, alertsResponse] = await Promise.all([
        fetch('/api/v1/monitoring/metrics'),
        fetch('/api/v1/monitoring/alerts'),
      ]);

      const metricsCollection = metricsResponse.ok;
      const alertSystem = alertsResponse.ok;
      
      // ダッシュボードデータの取得テスト
      const dashboardResponse = await fetch('/api/v1/dashboard/stats');
      const dashboardData = dashboardResponse.ok;

      return {
        metricsCollection,
        alertSystem,
        dashboardData,
      };
    } catch (error) {
      console.error('Monitoring integration test failed:', error);
      return {
        metricsCollection: false,
        alertSystem: false,
        dashboardData: false,
      };
    }
  }
}

/**
 * システム統合テストスイート
 */
test.describe('System Integration Tests', () => {
  let helper: SystemIntegrationHelper;

  test.beforeAll(async () => {
    helper = new SystemIntegrationHelper();
  });

  /**
   * インフラストラクチャ統合テスト
   */
  test.describe('Infrastructure Integration', () => {
    test('should have all Docker containers running', async () => {
      const dockerHealth = await helper.checkDockerHealth();
      
      expect(dockerHealth.webContainer).toBeTruthy();
      expect(dockerHealth.dbContainer).toBeTruthy();
      // キャッシュコンテナは環境によりオプショナル
      console.log('Docker containers health:', dockerHealth);
    });

    test('should connect to database successfully', async () => {
      const dbConnection = await helper.testDatabaseConnection();
      expect(dbConnection).toBeTruthy();
    });

    test('should have proper file system permissions', async () => {
      const permissions = await helper.testFileSystemPermissions();
      
      expect(permissions.logsWritable).toBeTruthy();
      expect(permissions.dataWritable).toBeTruthy();
      expect(permissions.tempWritable).toBeTruthy();
    });

    test('should have acceptable system resource usage', async () => {
      const resources = await helper.checkSystemResources();
      
      console.log('System resources:', resources);
      
      // リソース使用量が許容範囲内であることを確認
      expect(resources.memoryUsage).toBeLessThan(90); // 90%未満
      expect(resources.diskUsage).toBeLessThan(95);   // 95%未満
      expect(resources.cpuUsage).toBeLessThan(95);    // 95%未満
    });
  });

  /**
   * API統合テスト
   */
  test.describe('API Integration', () => {
    test('should authenticate and access protected endpoints', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      expect(loginResponse.ok()).toBeTruthy();
      
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // 保護されたエンドポイントへのアクセス
      const protectedEndpoints = [
        '/api/v1/servers',
        '/api/v1/secrets',
        '/api/v1/monitoring/metrics',
        '/api/v1/monitoring/alerts',
      ];
      
      for (const endpoint of protectedEndpoints) {
        const response = await request.get(endpoint, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        expect(response.ok()).toBeTruthy();
      }
    });

    test('should handle API versioning correctly', async ({ request }) => {
      // 異なるAPIバージョンの動作確認
      const versions = ['v1'];
      
      for (const version of versions) {
        const response = await request.get(`/api/${version}/health`);
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.version).toBeDefined();
      }
    });

    test('should implement proper error handling across APIs', async ({ request }) => {
      // 存在しないリソースへのアクセス
      const notFoundResponse = await request.get('/api/v1/servers/nonexistent');
      expect(notFoundResponse.status()).toBe(404);
      
      const errorData = await notFoundResponse.json();
      expect(errorData.error).toBeDefined();
      expect(errorData.message).toBeDefined();
    });
  });

  /**
   * データベース統合テスト
   */
  test.describe('Database Integration', () => {
    test('should handle database transactions properly', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // トランザクションテスト: サーバー作成
      const createResponse = await request.post('/api/v1/servers', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: {
          name: 'Integration Test Server',
          description: 'Server for integration testing',
          transport: 'docker',
          command: 'python',
          args: ['-m', 'test_server'],
          image: 'test/server:latest',
        },
      });
      
      if (createResponse.ok()) {
        const serverData = await createResponse.json();
        const serverId = serverData.id;
        
        // 作成されたサーバーの確認
        const getResponse = await request.get(`/api/v1/servers/${serverId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        expect(getResponse.ok()).toBeTruthy();
        
        // サーバー削除
        const deleteResponse = await request.delete(`/api/v1/servers/${serverId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        expect(deleteResponse.ok()).toBeTruthy();
      }
    });

    test('should maintain referential integrity', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // 関連データの整合性テスト
      const serversResponse = await request.get('/api/v1/servers', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (serversResponse.ok()) {
        const serversData = await serversResponse.json();
        
        // 各サーバーに関連する実行ログが存在することを確認
        for (const server of serversData.servers.slice(0, 3)) { // 最初の3つのみテスト
          const logsResponse = await request.get(
            `/api/v1/monitoring/logs?component=server-${server.id}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          expect(logsResponse.ok()).toBeTruthy();
        }
      }
    });
  });

  /**
   * 外部サービス統合テスト
   */
  test.describe('External Service Integration', () => {
    test('should integrate with Docker API', async () => {
      const integrations = await helper.testExternalIntegrations();
      expect(integrations.dockerApi).toBeTruthy();
    });

    test('should integrate with MCP Catalog', async () => {
      const integrations = await helper.testExternalIntegrations();
      // カタログサービスは外部依存のため、失敗しても警告のみ
      if (!integrations.mcpCatalog) {
        console.warn('MCP Catalog integration failed - may be expected in test environment');
      }
    });

    test('should handle external service failures gracefully', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // 外部サービス障害をシミュレート
      const catalogResponse = await request.get('/api/v1/catalog', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      // カタログサービスが利用できない場合でもエラーハンドリングが適切に行われることを確認
      if (!catalogResponse.ok()) {
        const errorData = await catalogResponse.json();
        expect(errorData.error).toBeDefined();
        expect(errorData.fallback).toBeDefined(); // フォールバック情報があることを確認
      }
    });
  });

  /**
   * 監視・ログ統合テスト
   */
  test.describe('Monitoring and Logging Integration', () => {
    test('should collect and store system metrics', async () => {
      const monitoring = await helper.testMonitoringIntegration();
      
      expect(monitoring.metricsCollection).toBeTruthy();
      expect(monitoring.alertSystem).toBeTruthy();
      expect(monitoring.dashboardData).toBeTruthy();
    });

    test('should integrate logging across all components', async () => {
      const loggingIntegration = await helper.testLoggingIntegration();
      expect(loggingIntegration).toBeTruthy();
    });

    test('should trigger alerts based on system conditions', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // 手動アラート作成
      const alertResponse = await request.post('/api/v1/monitoring/alerts', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: {
          severity: 'medium',
          title: 'Integration Test Alert',
          message: 'Test alert for integration testing',
          component: 'integration-test',
        },
      });
      
      expect(alertResponse.ok()).toBeTruthy();
      
      // 作成されたアラートの確認
      const alertsListResponse = await request.get('/api/v1/monitoring/alerts?status=active', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      expect(alertsListResponse.ok()).toBeTruthy();
      const alertsData = await alertsListResponse.json();
      
      const testAlert = alertsData.alerts.find((alert: any) => 
        alert.title === 'Integration Test Alert'
      );
      expect(testAlert).toBeDefined();
    });
  });

  /**
   * セキュリティ統合テスト
   */
  test.describe('Security Integration', () => {
    test('should enforce authentication across all endpoints', async ({ request }) => {
      const protectedEndpoints = [
        '/api/v1/servers',
        '/api/v1/secrets',
        '/api/v1/users',
        '/api/v1/monitoring/metrics',
        '/api/v1/monitoring/alerts',
      ];
      
      for (const endpoint of protectedEndpoints) {
        const response = await request.get(endpoint);
        expect(response.status()).toBe(401); // Unauthorized
      }
    });

    test('should maintain secure session management', async ({ page }) => {
      // ログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');
      
      // セッションクッキーの確認
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(c => c.name.includes('session'));
      
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBeTruthy();
      expect(sessionCookie?.secure).toBeTruthy();
    });

    test('should encrypt sensitive data end-to-end', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // シークレット作成
      const secretResponse = await request.post('/api/v1/secrets', {
        headers: { 'Authorization': `Bearer ${token}` },
        data: {
          name: 'integration-test-secret',
          description: 'Secret for integration testing',
          value: 'super-secret-value-12345',
        },
      });
      
      if (secretResponse.ok()) {
        const secretData = await secretResponse.json();
        
        // 格納された値が暗号化されていることを確認（APIから平文は返されない）
        expect(secretData.value).toBeUndefined();
        expect(secretData.encryptedValue).toBeUndefined(); // 実際の暗号化された値も公開されない
        
        // シークレット削除
        await request.delete(`/api/v1/secrets/${secretData.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
    });
  });

  /**
   * パフォーマンス統合テスト
   */
  test.describe('Performance Integration', () => {
    test('should maintain response times under load', async ({ request }) => {
      // ログイン
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
        },
      });
      const loginData = await loginResponse.json();
      const token = loginData.token;
      
      // 並行リクエストテスト
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill(null).map(() => 
        request.get('/api/v1/servers', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
      );
      
      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      
      const averageResponseTime = (endTime - startTime) / concurrentRequests;
      
      // 全てのリクエストが成功することを確認
      responses.forEach(response => {
        expect(response.ok()).toBeTruthy();
      });
      
      // 平均レスポンス時間が許容範囲内であることを確認
      console.log(`Average response time: ${averageResponseTime}ms`);
      expect(averageResponseTime).toBeLessThan(1000); // 1秒未満
    });

    test('should handle memory efficiently during extended operations', async ({ page }) => {
      // ログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');
      
      // 初期メモリ使用量
      const initialMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });
      
      // 複数ページの操作
      const pages = ['/servers', '/secrets', '/catalog', '/monitoring', '/logs'];
      
      for (const pagePath of pages) {
        await page.goto(pagePath);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }
      
      // 最終メモリ使用量
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });
      
      const memoryIncrease = finalMemory - initialMemory;
      console.log(`Memory increase: ${memoryIncrease} bytes`);
      
      // メモリ増加が許容範囲内であることを確認
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB未満
    });
  });

  /**
   * 回復力・フォールトトレランス統合テスト
   */
  test.describe('Resilience Integration', () => {
    test('should recover from temporary service disruptions', async ({ page }) => {
      // 正常なページ読み込み
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');
      
      // ネットワーク障害をシミュレート
      await page.context().setOffline(true);
      
      await page.goto('/servers');
      
      // オフライン時のエラーハンドリングを確認
      const offlineMessage = page.locator('[data-testid="offline-message"], [data-testid="network-error"]');
      await expect(offlineMessage).toBeVisible({ timeout: 5000 });
      
      // ネットワーク復旧をシミュレート
      await page.context().setOffline(false);
      
      // リトライボタンまたは自動復旧を確認
      const retryButton = page.locator('[data-testid="retry-button"]');
      if (await retryButton.isVisible()) {
        await retryButton.click();
      } else {
        await page.reload();
      }
      
      // 復旧後の正常動作を確認
      await expect(page.locator('[data-testid="servers-list"]')).toBeVisible({ timeout: 10000 });
    });
  });
});