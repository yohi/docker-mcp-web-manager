import { test, expect } from '@playwright/test';
import { performance } from 'perf_hooks';

// =============================================================================
// パフォーマンステスト
// 負荷テスト、応答時間測定、リソース使用量監視
// =============================================================================

/**
 * パフォーマンスメトリクス
 */
interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  timeToInteractive: number;
  memoryUsage: number;
  networkRequests: number;
  totalDataTransferred: number;
}

/**
 * パフォーマンス測定ヘルパー
 */
class PerformanceTestHelper {
  constructor(private page: any) {}

  /**
   * ページロード時間測定
   */
  async measurePageLoad(url: string): Promise<PerformanceMetrics> {
    const startTime = performance.now();
    
    // ナビゲーション開始
    await this.page.goto(url);
    
    // 完全ロード待機
    await this.page.waitForLoadState('networkidle');
    
    const endTime = performance.now();
    const pageLoadTime = endTime - startTime;
    
    // Web Vitals メトリクス取得
    const webVitals = await this.page.evaluate(() => {
      return new Promise((resolve) => {
        const metrics: any = {};
        
        // PerformanceObserver で Web Vitals 収集
        if ('PerformanceObserver' in window) {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach((entry) => {
              if (entry.name === 'first-contentful-paint') {
                metrics.firstContentfulPaint = entry.startTime;
              }
              if (entry.name === 'largest-contentful-paint') {
                metrics.largestContentfulPaint = entry.startTime;
              }
            });
          });
          
          observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
          
          // タイムアウト付きで解決
          setTimeout(() => {
            observer.disconnect();
            resolve(metrics);
          }, 2000);
        } else {
          resolve(metrics);
        }
      });
    });
    
    // メモリ使用量取得
    const memoryInfo = await this.page.evaluate(() => {
      if ('memory' in performance) {
        return {
          used: (performance as any).memory.usedJSHeapSize,
          total: (performance as any).memory.totalJSHeapSize,
        };
      }
      return { used: 0, total: 0 };
    });
    
    // ネットワーク統計取得
    const networkStats = await this.getNetworkStats();
    
    return {
      pageLoadTime,
      firstContentfulPaint: webVitals.firstContentfulPaint || 0,
      largestContentfulPaint: webVitals.largestContentfulPaint || 0,
      timeToInteractive: await this.measureTimeToInteractive(),
      memoryUsage: memoryInfo.used,
      networkRequests: networkStats.requestCount,
      totalDataTransferred: networkStats.totalBytes,
    };
  }

  /**
   * Time To Interactive 測定
   */
  private async measureTimeToInteractive(): Promise<number> {
    return await this.page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            if (entry.name === 'first-input-delay') {
              observer.disconnect();
              resolve(entry.startTime);
              return;
            }
          }
        });
        
        try {
          observer.observe({ type: 'first-input', buffered: true });
        } catch {
          // FID をサポートしていない場合は0を返す
          resolve(0);
        }
        
        // 5秒でタイムアウト
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 5000);
      });
    });
  }

  /**
   * ネットワーク統計取得
   */
  private async getNetworkStats(): Promise<{ requestCount: number; totalBytes: number }> {
    let requestCount = 0;
    let totalBytes = 0;
    
    this.page.on('response', (response: any) => {
      requestCount++;
      const contentLength = response.headers()['content-length'];
      if (contentLength) {
        totalBytes += parseInt(contentLength);
      }
    });
    
    return { requestCount, totalBytes };
  }

  /**
   * リソース使用量監視
   */
  async monitorResourceUsage(duration: number = 10000): Promise<{
    peakMemory: number;
    averageMemory: number;
    cpuUsage: number;
  }> {
    const measurements: number[] = [];
    const startTime = Date.now();
    
    const monitor = setInterval(async () => {
      try {
        const memoryInfo = await this.page.evaluate(() => {
          if ('memory' in performance) {
            return (performance as any).memory.usedJSHeapSize;
          }
          return 0;
        });
        measurements.push(memoryInfo);
      } catch (error) {
        // エラーが発生した場合は測定をスキップ
      }
    }, 100);
    
    // 指定時間待機
    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(monitor);
    
    const peakMemory = Math.max(...measurements);
    const averageMemory = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
    
    // CPU 使用量の推定（簡易版）
    const endTime = Date.now();
    const actualDuration = endTime - startTime;
    const cpuUsage = (measurements.length * 100) / actualDuration; // 簡易推定
    
    return {
      peakMemory,
      averageMemory: averageMemory || 0,
      cpuUsage,
    };
  }

  /**
   * 大量データ処理テスト
   */
  async testLargeDatasetRendering(url: string, expectedItems: number): Promise<{
    renderTime: number;
    scrollPerformance: number;
    memoryIncrease: number;
  }> {
    const initialMemory = await this.page.evaluate(() => {
      return 'memory' in performance ? (performance as any).memory.usedJSHeapSize : 0;
    });
    
    const startTime = performance.now();
    await this.page.goto(url);
    await this.page.waitForSelector('[data-testid="data-list"]');
    
    // データ項目の数を確認
    const itemCount = await this.page.locator('[data-testid^="data-item-"]').count();
    expect(itemCount).toBeGreaterThanOrEqual(expectedItems);
    
    const renderTime = performance.now() - startTime;
    
    // スクロールパフォーマンステスト
    const scrollStartTime = performance.now();
    await this.page.mouse.wheel(0, 5000);
    await this.page.waitForTimeout(100);
    const scrollPerformance = performance.now() - scrollStartTime;
    
    const finalMemory = await this.page.evaluate(() => {
      return 'memory' in performance ? (performance as any).memory.usedJSHeapSize : 0;
    });
    
    return {
      renderTime,
      scrollPerformance,
      memoryIncrease: finalMemory - initialMemory,
    };
  }
}

/**
 * パフォーマンステスト定数
 */
const PERFORMANCE_THRESHOLDS = {
  pageLoadTime: 3000,        // 3秒
  firstContentfulPaint: 1500, // 1.5秒
  largestContentfulPaint: 2500, // 2.5秒
  timeToInteractive: 3000,   // 3秒
  maxMemoryUsage: 50 * 1024 * 1024, // 50MB
  maxNetworkRequests: 50,
  scrollPerformance: 100,    // 100ms
};

test.describe('Performance Tests', () => {
  let helper: PerformanceTestHelper;

  test.beforeEach(async ({ page }) => {
    helper = new PerformanceTestHelper(page);
    
    // 管理者としてログイン
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'admin@test.com');
    await page.fill('[data-testid="password-input"]', 'Admin123!');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  /**
   * ページロードパフォーマンス
   */
  test.describe('Page Load Performance', () => {
    test('dashboard should load within acceptable time', async ({ page }) => {
      const metrics = await helper.measurePageLoad('/dashboard');
      
      console.log('Dashboard Performance Metrics:', metrics);
      
      expect(metrics.pageLoadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.pageLoadTime);
      expect(metrics.firstContentfulPaint).toBeLessThan(PERFORMANCE_THRESHOLDS.firstContentfulPaint);
      expect(metrics.memoryUsage).toBeLessThan(PERFORMANCE_THRESHOLDS.maxMemoryUsage);
      expect(metrics.networkRequests).toBeLessThan(PERFORMANCE_THRESHOLDS.maxNetworkRequests);
    });

    test('servers page should load efficiently', async ({ page }) => {
      const metrics = await helper.measurePageLoad('/servers');
      
      console.log('Servers Page Performance Metrics:', metrics);
      
      expect(metrics.pageLoadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.pageLoadTime);
      expect(metrics.firstContentfulPaint).toBeLessThan(PERFORMANCE_THRESHOLDS.firstContentfulPaint);
    });

    test('monitoring page should handle real-time data efficiently', async ({ page }) => {
      const metrics = await helper.measurePageLoad('/monitoring');
      
      console.log('Monitoring Page Performance Metrics:', metrics);
      
      expect(metrics.pageLoadTime).toBeLessThan(PERFORMANCE_THRESHOLDS.pageLoadTime + 1000); // 監視ページは+1秒許容
      
      // リアルタイム更新中のリソース監視
      const resourceUsage = await helper.monitorResourceUsage(5000);
      console.log('Real-time Resource Usage:', resourceUsage);
      
      expect(resourceUsage.peakMemory).toBeLessThan(PERFORMANCE_THRESHOLDS.maxMemoryUsage);
    });
  });

  /**
   * 大量データ処理パフォーマンス
   */
  test.describe('Large Dataset Performance', () => {
    test('logs page should handle large log datasets', async ({ page }) => {
      const result = await helper.testLargeDatasetRendering('/logs', 100);
      
      console.log('Large Dataset Rendering Performance:', result);
      
      expect(result.renderTime).toBeLessThan(5000); // 5秒以内
      expect(result.scrollPerformance).toBeLessThan(PERFORMANCE_THRESHOLDS.scrollPerformance);
      expect(result.memoryIncrease).toBeLessThan(20 * 1024 * 1024); // 20MB以内の増加
    });

    test('servers list should handle many servers efficiently', async ({ page }) => {
      // 多数のサーバーがある場合のテスト
      await page.goto('/servers');
      
      const startTime = performance.now();
      await page.waitForSelector('[data-testid="servers-list"]');
      const loadTime = performance.now() - startTime;
      
      expect(loadTime).toBeLessThan(3000);
      
      // ページネーションのテスト
      const paginationExists = await page.locator('[data-testid="pagination"]').isVisible();
      if (paginationExists) {
        const nextPageStartTime = performance.now();
        await page.click('[data-testid="next-page"]');
        await page.waitForLoadState('networkidle');
        const nextPageLoadTime = performance.now() - nextPageStartTime;
        
        expect(nextPageLoadTime).toBeLessThan(2000); // ページネーション切り替えは2秒以内
      }
    });
  });

  /**
   * インタラクションパフォーマンス
   */
  test.describe('Interaction Performance', () => {
    test('server creation should be responsive', async ({ page }) => {
      await page.goto('/servers/create');
      
      // フォーム入力のレスポンス時間測定
      const inputStartTime = performance.now();
      await page.fill('[data-testid="server-name-input"]', 'Performance Test Server');
      await page.fill('[data-testid="server-description-input"]', 'Server for performance testing');
      const inputTime = performance.now() - inputStartTime;
      
      expect(inputTime).toBeLessThan(500); // 入力は500ms以内
      
      // フォーム送信のレスポンス時間測定
      const submitStartTime = performance.now();
      await page.click('[data-testid="create-server-button"]');
      // 成功またはエラーメッセージの表示を待機
      await Promise.race([
        page.waitForSelector('[data-testid="success-message"]'),
        page.waitForSelector('[data-testid="error-message"]'),
      ]);
      const submitTime = performance.now() - submitStartTime;
      
      expect(submitTime).toBeLessThan(5000); // 送信は5秒以内
    });

    test('search functionality should be fast', async ({ page }) => {
      await page.goto('/servers');
      
      // 検索のレスポンス時間測定
      const searchStartTime = performance.now();
      await page.fill('[data-testid="search-input"]', 'test');
      await page.waitForTimeout(300); // デバウンス待機
      await page.waitForLoadState('networkidle');
      const searchTime = performance.now() - searchStartTime;
      
      expect(searchTime).toBeLessThan(1000); // 検索は1秒以内
    });

    test('modal dialogs should open quickly', async ({ page }) => {
      await page.goto('/servers');
      
      // サーバー詳細モーダルの表示時間測定
      const serverItem = page.locator('[data-testid^="server-item-"]').first();
      
      if (await serverItem.isVisible()) {
        const modalStartTime = performance.now();
        await serverItem.click();
        await page.waitForSelector('[data-testid="server-details-modal"]');
        const modalTime = performance.now() - modalStartTime;
        
        expect(modalTime).toBeLessThan(500); // モーダル表示は500ms以内
      }
    });
  });

  /**
   * メモリリークテスト
   */
  test.describe('Memory Leak Tests', () => {
    test('should not have memory leaks during navigation', async ({ page }) => {
      const initialMemory = await page.evaluate(() => {
        return 'memory' in performance ? (performance as any).memory.usedJSHeapSize : 0;
      });
      
      // 複数ページの反復ナビゲーション
      const pages = ['/dashboard', '/servers', '/secrets', '/catalog', '/logs'];
      
      for (let i = 0; i < 3; i++) {
        for (const pagePath of pages) {
          await page.goto(pagePath);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(500);
        }
      }
      
      // ガベージコレクション実行
      await page.evaluate(() => {
        if ('gc' in window) {
          (window as any).gc();
        }
      });
      
      const finalMemory = await page.evaluate(() => {
        return 'memory' in performance ? (performance as any).memory.usedJSHeapSize : 0;
      });
      
      const memoryIncrease = finalMemory - initialMemory;
      console.log(`Memory increase after navigation: ${memoryIncrease} bytes`);
      
      // メモリ増加が10MB以内であることを確認
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle real-time updates without memory leaks', async ({ page }) => {
      await page.goto('/monitoring');
      
      const initialMemory = await page.evaluate(() => {
        return 'memory' in performance ? (performance as any).memory.usedJSHeapSize : 0;
      });
      
      // リアルタイム更新を有効にして10秒間監視
      await page.click('[data-testid="auto-refresh-toggle"]');
      await page.waitForTimeout(10000);
      
      const finalMemory = await page.evaluate(() => {
        return 'memory' in performance ? (performance as any).memory.usedJSHeapSize : 0;
      });
      
      const memoryIncrease = finalMemory - initialMemory;
      console.log(`Memory increase during real-time updates: ${memoryIncrease} bytes`);
      
      // リアルタイム更新によるメモリ増加が5MB以内であることを確認
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  /**
   * ネットワークパフォーマンス
   */
  test.describe('Network Performance', () => {
    test('should minimize API calls', async ({ page }) => {
      let apiCallCount = 0;
      
      // API コール数をカウント
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          apiCallCount++;
        }
      });
      
      // ダッシュボード読み込み
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      console.log(`Dashboard API calls: ${apiCallCount}`);
      expect(apiCallCount).toBeLessThan(10); // APIコール数は10回以内
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // エラーレスポンスをシミュレート
      await page.route('**/api/v1/servers', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });
      
      const startTime = performance.now();
      await page.goto('/servers');
      
      // エラーメッセージの表示を待機
      await page.waitForSelector('[data-testid="error-message"]');
      const errorHandlingTime = performance.now() - startTime;
      
      // エラーハンドリングが3秒以内に完了することを確認
      expect(errorHandlingTime).toBeLessThan(3000);
    });

    test('should cache responses effectively', async ({ page }) => {
      let firstLoadRequests = 0;
      let secondLoadRequests = 0;
      
      // 最初のロード
      page.on('request', () => firstLoadRequests++);
      await page.goto('/servers');
      await page.waitForLoadState('networkidle');
      page.removeAllListeners('request');
      
      // ページリロード
      page.on('request', () => secondLoadRequests++);
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      console.log(`First load requests: ${firstLoadRequests}, Second load requests: ${secondLoadRequests}`);
      
      // キャッシュにより2回目のロードでリクエスト数が削減されることを確認
      expect(secondLoadRequests).toBeLessThan(firstLoadRequests);
    });
  });

  /**
   * 並行処理パフォーマンス
   */
  test.describe('Concurrent Operations', () => {
    test('should handle multiple simultaneous operations', async ({ page }) => {
      await page.goto('/servers');
      
      // 複数の同時操作をシミュレート
      const operations = [
        page.click('[data-testid="refresh-button"]'),
        page.fill('[data-testid="search-input"]', 'test'),
        page.selectOption('[data-testid="status-filter"]', 'running'),
      ];
      
      const startTime = performance.now();
      await Promise.all(operations);
      await page.waitForLoadState('networkidle');
      const concurrentOperationTime = performance.now() - startTime;
      
      console.log(`Concurrent operations completed in: ${concurrentOperationTime}ms`);
      
      // 並行操作が5秒以内に完了することを確認
      expect(concurrentOperationTime).toBeLessThan(5000);
    });
  });
});