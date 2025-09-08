import { NextRequest } from 'next/server';

// =============================================================================
// パフォーマンス監視システム
// メトリクス収集、アラート、レポート生成の包括的実装
// =============================================================================

/**
 * パフォーマンスメトリクス
 */
interface PerformanceMetrics {
  timestamp: number;
  
  // HTTP メトリクス
  httpMetrics: {
    requestCount: number;
    averageResponseTime: number;
    errorRate: number;
    slowRequestCount: number;
    statusCodeCounts: Record<number, number>;
    endpointMetrics: Record<string, {
      count: number;
      averageTime: number;
      errorCount: number;
    }>;
  };

  // システムメトリクス
  systemMetrics: {
    cpuUsage: number;
    memoryUsage: {
      used: number;
      total: number;
      percentage: number;
    };
    diskUsage: {
      used: number;
      total: number;
      percentage: number;
    };
  };

  // データベースメトリクス
  databaseMetrics: {
    connectionCount: number;
    activeQueries: number;
    slowQueryCount: number;
    averageQueryTime: number;
    cacheHitRate: number;
  };

  // キャッシュメトリクス
  cacheMetrics: {
    hitRate: number;
    missCount: number;
    memoryUsage: number;
    evictionCount: number;
  };

  // ビジネスメトリクス
  businessMetrics: {
    activeUsers: number;
    activeServers: number;
    totalServers: number;
    totalSecrets: number;
    jobsInProgress: number;
  };
}

/**
 * アラート設定
 */
interface AlertConfig {
  name: string;
  condition: (metrics: PerformanceMetrics) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldown: number;
  enabled: boolean;
  webhookUrl?: string;
  emailRecipients?: string[];
}

/**
 * メトリクス収集器
 */
export class MetricsCollector {
  private metrics: PerformanceMetrics[] = [];
  private currentWindow: Partial<PerformanceMetrics> = {};
  private requestStartTimes = new Map<string, number>();
  private intervalId: NodeJS.Timeout | null = null;
  private readonly maxMetricsHistory = 1000; // 最大1000件の履歴を保持

  constructor() {
    this.initializeMetrics();
    this.startCollection();
  }

  /**
   * メトリクス初期化
   */
  private initializeMetrics(): void {
    this.currentWindow = {
      timestamp: Date.now(),
      httpMetrics: {
        requestCount: 0,
        averageResponseTime: 0,
        errorRate: 0,
        slowRequestCount: 0,
        statusCodeCounts: {},
        endpointMetrics: {},
      },
      systemMetrics: {
        cpuUsage: 0,
        memoryUsage: { used: 0, total: 0, percentage: 0 },
        diskUsage: { used: 0, total: 0, percentage: 0 },
      },
      databaseMetrics: {
        connectionCount: 0,
        activeQueries: 0,
        slowQueryCount: 0,
        averageQueryTime: 0,
        cacheHitRate: 0,
      },
      cacheMetrics: {
        hitRate: 0,
        missCount: 0,
        memoryUsage: 0,
        evictionCount: 0,
      },
      businessMetrics: {
        activeUsers: 0,
        activeServers: 0,
        totalServers: 0,
        totalSecrets: 0,
        jobsInProgress: 0,
      },
    };
  }

  /**
   * メトリクス収集開始
   */
  private startCollection(): void {
    // 60秒間隔でメトリクスを収集
    this.intervalId = setInterval(async () => {
      await this.collectSystemMetrics();
      await this.collectBusinessMetrics();
      this.saveMetricsWindow();
    }, 60000);
  }

  /**
   * HTTPリクエスト開始を記録
   */
  recordRequestStart(requestId: string, request: NextRequest): void {
    this.requestStartTimes.set(requestId, Date.now());
    
    if (this.currentWindow.httpMetrics) {
      this.currentWindow.httpMetrics.requestCount++;
      
      // エンドポイント別メトリクス
      const endpoint = this.extractEndpoint(request);
      if (!this.currentWindow.httpMetrics.endpointMetrics[endpoint]) {
        this.currentWindow.httpMetrics.endpointMetrics[endpoint] = {
          count: 0,
          averageTime: 0,
          errorCount: 0,
        };
      }
      this.currentWindow.httpMetrics.endpointMetrics[endpoint].count++;
    }
  }

  /**
   * HTTPリクエスト終了を記録
   */
  recordRequestEnd(
    requestId: string,
    statusCode: number,
    request: NextRequest,
    error?: Error
  ): void {
    const startTime = this.requestStartTimes.get(requestId);
    if (!startTime || !this.currentWindow.httpMetrics) return;

    const duration = Date.now() - startTime;
    this.requestStartTimes.delete(requestId);

    // レスポンス時間更新
    const totalRequests = this.currentWindow.httpMetrics.requestCount;
    const currentAvg = this.currentWindow.httpMetrics.averageResponseTime;
    this.currentWindow.httpMetrics.averageResponseTime = 
      ((currentAvg * (totalRequests - 1)) + duration) / totalRequests;

    // スローリクエストカウント
    if (duration > 2000) { // 2秒以上
      this.currentWindow.httpMetrics.slowRequestCount++;
    }

    // ステータスコード別カウント
    this.currentWindow.httpMetrics.statusCodeCounts[statusCode] = 
      (this.currentWindow.httpMetrics.statusCodeCounts[statusCode] || 0) + 1;

    // エラーレート更新
    if (statusCode >= 400 || error) {
      const errorCount = Object.keys(this.currentWindow.httpMetrics.statusCodeCounts)
        .filter(code => parseInt(code) >= 400)
        .reduce((sum, code) => sum + this.currentWindow.httpMetrics!.statusCodeCounts[parseInt(code)], 0);
      
      this.currentWindow.httpMetrics.errorRate = errorCount / totalRequests;

      // エンドポイント別エラーカウント
      const endpoint = this.extractEndpoint(request);
      if (this.currentWindow.httpMetrics.endpointMetrics[endpoint]) {
        this.currentWindow.httpMetrics.endpointMetrics[endpoint].errorCount++;
      }
    }

    // エンドポイント別平均時間更新
    const endpoint = this.extractEndpoint(request);
    const endpointMetrics = this.currentWindow.httpMetrics.endpointMetrics[endpoint];
    if (endpointMetrics) {
      const endpointCount = endpointMetrics.count;
      const currentEndpointAvg = endpointMetrics.averageTime;
      endpointMetrics.averageTime = 
        ((currentEndpointAvg * (endpointCount - 1)) + duration) / endpointCount;
    }
  }

  /**
   * データベースメトリクス記録
   */
  recordDatabaseMetrics(metrics: {
    queryTime?: number;
    isSlowQuery?: boolean;
    connectionCount?: number;
    activeQueries?: number;
    cacheHit?: boolean;
  }): void {
    if (!this.currentWindow.databaseMetrics) return;

    if (metrics.queryTime !== undefined) {
      // 平均クエリ時間更新（簡略化）
      this.currentWindow.databaseMetrics.averageQueryTime = 
        (this.currentWindow.databaseMetrics.averageQueryTime + metrics.queryTime) / 2;
    }

    if (metrics.isSlowQuery) {
      this.currentWindow.databaseMetrics.slowQueryCount++;
    }

    if (metrics.connectionCount !== undefined) {
      this.currentWindow.databaseMetrics.connectionCount = metrics.connectionCount;
    }

    if (metrics.activeQueries !== undefined) {
      this.currentWindow.databaseMetrics.activeQueries = metrics.activeQueries;
    }
  }

  /**
   * キャッシュメトリクス記録
   */
  recordCacheMetrics(metrics: {
    hit?: boolean;
    miss?: boolean;
    eviction?: boolean;
    memoryUsage?: number;
  }): void {
    if (!this.currentWindow.cacheMetrics) return;

    if (metrics.hit !== undefined) {
      // ヒット率更新（簡略化）
      this.currentWindow.cacheMetrics.hitRate = 
        (this.currentWindow.cacheMetrics.hitRate + (metrics.hit ? 1 : 0)) / 2;
    }

    if (metrics.miss) {
      this.currentWindow.cacheMetrics.missCount++;
    }

    if (metrics.eviction) {
      this.currentWindow.cacheMetrics.evictionCount++;
    }

    if (metrics.memoryUsage !== undefined) {
      this.currentWindow.cacheMetrics.memoryUsage = metrics.memoryUsage;
    }
  }

  /**
   * システムメトリクス収集
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // Node.js プロセスメトリクス
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      if (this.currentWindow.systemMetrics) {
        this.currentWindow.systemMetrics.memoryUsage = {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
          percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        };

        // CPU使用率の計算は簡略化
        this.currentWindow.systemMetrics.cpuUsage = 
          (cpuUsage.user + cpuUsage.system) / 1000000; // マイクロ秒からミリ秒へ
      }
    } catch (error) {
      console.error('[Metrics] Error collecting system metrics:', error);
    }
  }

  /**
   * ビジネスメトリクス収集
   */
  private async collectBusinessMetrics(): Promise<void> {
    try {
      // 実際の実装では、データベースクエリでビジネスメトリクスを取得
      // ここでは例として固定値を設定

      if (this.currentWindow.businessMetrics) {
        // this.currentWindow.businessMetrics.activeUsers = await getUserCount();
        // this.currentWindow.businessMetrics.activeServers = await getActiveServerCount();
        // this.currentWindow.businessMetrics.totalServers = await getTotalServerCount();
        // this.currentWindow.businessMetrics.totalSecrets = await getTotalSecretCount();
        // this.currentWindow.businessMetrics.jobsInProgress = await getJobsInProgressCount();
      }
    } catch (error) {
      console.error('[Metrics] Error collecting business metrics:', error);
    }
  }

  /**
   * メトリクス窓保存
   */
  private saveMetricsWindow(): void {
    if (this.currentWindow.timestamp) {
      this.metrics.push(this.currentWindow as PerformanceMetrics);
      
      // 履歴制限
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics.shift();
      }
    }

    // 新しい窓を初期化
    this.initializeMetrics();
  }

  /**
   * エンドポイント抽出
   */
  private extractEndpoint(request: NextRequest): string {
    const url = new URL(request.url);
    return `${request.method} ${url.pathname}`;
  }

  /**
   * 現在のメトリクス取得
   */
  getCurrentMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * メトリクス履歴取得
   */
  getMetricsHistory(limit?: number): PerformanceMetrics[] {
    return limit ? this.metrics.slice(-limit) : this.metrics;
  }

  /**
   * 収集停止
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

/**
 * アラートマネージャー
 */
export class AlertManager {
  private alerts: AlertConfig[] = [];
  private lastAlertTimes = new Map<string, number>();

  constructor() {
    this.initializeDefaultAlerts();
  }

  /**
   * デフォルトアラート初期化
   */
  private initializeDefaultAlerts(): void {
    this.alerts = [
      {
        name: 'High Error Rate',
        condition: (metrics) => metrics.httpMetrics.errorRate > 0.1, // 10%以上
        severity: 'high',
        cooldown: 5 * 60 * 1000, // 5分
        enabled: true,
      },
      {
        name: 'High Response Time',
        condition: (metrics) => metrics.httpMetrics.averageResponseTime > 5000, // 5秒以上
        severity: 'medium',
        cooldown: 5 * 60 * 1000,
        enabled: true,
      },
      {
        name: 'High Memory Usage',
        condition: (metrics) => metrics.systemMetrics.memoryUsage.percentage > 90, // 90%以上
        severity: 'high',
        cooldown: 10 * 60 * 1000, // 10分
        enabled: true,
      },
      {
        name: 'Database Connection Issues',
        condition: (metrics) => metrics.databaseMetrics.connectionCount === 0,
        severity: 'critical',
        cooldown: 1 * 60 * 1000, // 1分
        enabled: true,
      },
      {
        name: 'Low Cache Hit Rate',
        condition: (metrics) => metrics.cacheMetrics.hitRate < 0.5, // 50%未満
        severity: 'low',
        cooldown: 15 * 60 * 1000, // 15分
        enabled: true,
      },
    ];
  }

  /**
   * アラートチェック実行
   */
  checkAlerts(metrics: PerformanceMetrics): void {
    for (const alert of this.alerts) {
      if (!alert.enabled) continue;

      const lastAlertTime = this.lastAlertTimes.get(alert.name) || 0;
      const now = Date.now();

      // クールダウン期間チェック
      if (now - lastAlertTime < alert.cooldown) {
        continue;
      }

      // アラート条件チェック
      if (alert.condition(metrics)) {
        this.triggerAlert(alert, metrics);
        this.lastAlertTimes.set(alert.name, now);
      }
    }
  }

  /**
   * アラート発火
   */
  private async triggerAlert(alert: AlertConfig, metrics: PerformanceMetrics): Promise<void> {
    console.warn(`[Alert] ${alert.severity.toUpperCase()}: ${alert.name}`);

    const alertData = {
      name: alert.name,
      severity: alert.severity,
      timestamp: new Date().toISOString(),
      metrics,
    };

    // Webhook通知
    if (alert.webhookUrl) {
      await this.sendWebhookAlert(alert.webhookUrl, alertData);
    }

    // メール通知
    if (alert.emailRecipients && alert.emailRecipients.length > 0) {
      await this.sendEmailAlert(alert.emailRecipients, alertData);
    }
  }

  /**
   * Webhook アラート送信
   */
  private async sendWebhookAlert(webhookUrl: string, alertData: any): Promise<void> {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertData),
      });
    } catch (error) {
      console.error('[Alert] Failed to send webhook alert:', error);
    }
  }

  /**
   * メールアラート送信
   */
  private async sendEmailAlert(recipients: string[], alertData: any): Promise<void> {
    try {
      // 実際の実装では、メール送信サービスを使用
      console.log('[Alert] Email alert would be sent to:', recipients);
    } catch (error) {
      console.error('[Alert] Failed to send email alert:', error);
    }
  }

  /**
   * アラート設定追加
   */
  addAlert(alert: AlertConfig): void {
    this.alerts.push(alert);
  }

  /**
   * アラート設定更新
   */
  updateAlert(name: string, updates: Partial<AlertConfig>): boolean {
    const index = this.alerts.findIndex(alert => alert.name === name);
    if (index !== -1) {
      this.alerts[index] = { ...this.alerts[index], ...updates };
      return true;
    }
    return false;
  }

  /**
   * アラート無効化
   */
  disableAlert(name: string): boolean {
    return this.updateAlert(name, { enabled: false });
  }

  /**
   * アラート有効化
   */
  enableAlert(name: string): boolean {
    return this.updateAlert(name, { enabled: true });
  }
}

/**
 * パフォーマンスレポート生成器
 */
export class PerformanceReportGenerator {
  constructor(private metricsCollector: MetricsCollector) {}

  /**
   * 時間範囲レポート生成
   */
  generateTimeRangeReport(
    startTime: Date,
    endTime: Date
  ): {
    summary: any;
    httpMetrics: any;
    systemMetrics: any;
    databaseMetrics: any;
    cacheMetrics: any;
    businessMetrics: any;
  } {
    const metrics = this.metricsCollector.getMetricsHistory()
      .filter(m => m.timestamp >= startTime.getTime() && m.timestamp <= endTime.getTime());

    if (metrics.length === 0) {
      throw new Error('No metrics found for the specified time range');
    }

    return {
      summary: this.generateSummary(metrics),
      httpMetrics: this.aggregateHttpMetrics(metrics),
      systemMetrics: this.aggregateSystemMetrics(metrics),
      databaseMetrics: this.aggregateDatabaseMetrics(metrics),
      cacheMetrics: this.aggregateCacheMetrics(metrics),
      businessMetrics: this.aggregateBusinessMetrics(metrics),
    };
  }

  /**
   * サマリー生成
   */
  private generateSummary(metrics: PerformanceMetrics[]): any {
    return {
      timeRange: {
        start: new Date(metrics[0].timestamp).toISOString(),
        end: new Date(metrics[metrics.length - 1].timestamp).toISOString(),
        duration: metrics[metrics.length - 1].timestamp - metrics[0].timestamp,
      },
      dataPoints: metrics.length,
      overallHealth: this.calculateOverallHealth(metrics),
    };
  }

  /**
   * 全体的な健全性計算
   */
  private calculateOverallHealth(metrics: PerformanceMetrics[]): 'excellent' | 'good' | 'fair' | 'poor' {
    const latest = metrics[metrics.length - 1];
    let score = 100;

    // エラー率による減点
    if (latest.httpMetrics.errorRate > 0.05) score -= 20;
    if (latest.httpMetrics.errorRate > 0.1) score -= 30;

    // レスポンス時間による減点
    if (latest.httpMetrics.averageResponseTime > 2000) score -= 15;
    if (latest.httpMetrics.averageResponseTime > 5000) score -= 25;

    // メモリ使用率による減点
    if (latest.systemMetrics.memoryUsage.percentage > 80) score -= 10;
    if (latest.systemMetrics.memoryUsage.percentage > 90) score -= 20;

    // キャッシュヒット率による減点
    if (latest.cacheMetrics.hitRate < 0.7) score -= 10;
    if (latest.cacheMetrics.hitRate < 0.5) score -= 20;

    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  }

  /**
   * HTTPメトリクス集約
   */
  private aggregateHttpMetrics(metrics: PerformanceMetrics[]): any {
    const totalRequests = metrics.reduce((sum, m) => sum + m.httpMetrics.requestCount, 0);
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.httpMetrics.averageResponseTime, 0) / metrics.length;
    const avgErrorRate = metrics.reduce((sum, m) => sum + m.httpMetrics.errorRate, 0) / metrics.length;

    return {
      totalRequests,
      averageResponseTime: Math.round(avgResponseTime),
      averageErrorRate: Math.round(avgErrorRate * 10000) / 100, // パーセント
      slowRequestsRate: metrics.reduce((sum, m) => sum + m.httpMetrics.slowRequestCount, 0) / totalRequests,
    };
  }

  /**
   * システムメトリクス集約
   */
  private aggregateSystemMetrics(metrics: PerformanceMetrics[]): any {
    return {
      averageCpuUsage: Math.round(metrics.reduce((sum, m) => sum + m.systemMetrics.cpuUsage, 0) / metrics.length),
      averageMemoryUsage: Math.round(metrics.reduce((sum, m) => sum + m.systemMetrics.memoryUsage.percentage, 0) / metrics.length),
      peakMemoryUsage: Math.max(...metrics.map(m => m.systemMetrics.memoryUsage.percentage)),
    };
  }

  /**
   * データベースメトリクス集約
   */
  private aggregateDatabaseMetrics(metrics: PerformanceMetrics[]): any {
    return {
      averageQueryTime: Math.round(metrics.reduce((sum, m) => sum + m.databaseMetrics.averageQueryTime, 0) / metrics.length),
      totalSlowQueries: metrics.reduce((sum, m) => sum + m.databaseMetrics.slowQueryCount, 0),
      averageCacheHitRate: Math.round(metrics.reduce((sum, m) => sum + m.databaseMetrics.cacheHitRate, 0) / metrics.length * 100),
    };
  }

  /**
   * キャッシュメトリクス集約
   */
  private aggregateCacheMetrics(metrics: PerformanceMetrics[]): any {
    return {
      averageHitRate: Math.round(metrics.reduce((sum, m) => sum + m.cacheMetrics.hitRate, 0) / metrics.length * 100),
      totalMisses: metrics.reduce((sum, m) => sum + m.cacheMetrics.missCount, 0),
      totalEvictions: metrics.reduce((sum, m) => sum + m.cacheMetrics.evictionCount, 0),
    };
  }

  /**
   * ビジネスメトリクス集約
   */
  private aggregateBusinessMetrics(metrics: PerformanceMetrics[]): any {
    const latest = metrics[metrics.length - 1];
    return {
      currentActiveUsers: latest.businessMetrics.activeUsers,
      currentActiveServers: latest.businessMetrics.activeServers,
      totalServers: latest.businessMetrics.totalServers,
      totalSecrets: latest.businessMetrics.totalSecrets,
      jobsInProgress: latest.businessMetrics.jobsInProgress,
    };
  }
}

/**
 * グローバルパフォーマンス監視インスタンス
 */
export const metricsCollector = new MetricsCollector();
export const alertManager = new AlertManager();
export const reportGenerator = new PerformanceReportGenerator(metricsCollector);

/**
 * パフォーマンス監視ミドルウェア
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  name?: string
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36);

    try {
      const result = await fn(...args);
      
      // 成功メトリクスを記録
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (duration > 2000) {
        console.warn(`[Performance] Slow operation: ${name || fn.name} took ${duration}ms`);
      }

      return result;
    } catch (error) {
      // エラーメトリクスを記録
      console.error(`[Performance] Error in ${name || fn.name}:`, error);
      throw error;
    }
  }) as T;
}

/**
 * 定期的なアラートチェック開始
 */
export function startAlertMonitoring(): void {
  setInterval(() => {
    const currentMetrics = metricsCollector.getCurrentMetrics();
    if (currentMetrics) {
      alertManager.checkAlerts(currentMetrics);
    }
  }, 60000); // 1分間隔
}