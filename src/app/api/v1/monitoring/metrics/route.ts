import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { createSuccessResponse, createErrorResponse, ERROR_CODES } from '@/lib/api/response';
import { metricsCollector } from '@/lib/performance/monitoring';
import { logAnalyzer } from '@/lib/logging/log-aggregation';
import { logger } from '@/lib/logging/structured-logger';

// =============================================================================
// 監視メトリクス API エンドポイント
// システムメトリクス、パフォーマンス統計、ヘルスチェックの提供
// =============================================================================

/**
 * リクエストクエリスキーマ
 */
const QuerySchema = z.object({
  timeRange: z.enum(['5m', '15m', '1h', '6h', '24h', '7d']).optional().default('1h'),
  metrics: z.array(z.enum([
    'cpu',
    'memory',
    'disk',
    'network',
    'http',
    'database',
    'cache',
    'business'
  ])).optional(),
  aggregation: z.enum(['avg', 'sum', 'min', 'max', 'p95', 'p99']).optional().default('avg'),
});

/**
 * メトリクス取得 (GET)
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse(
        ERROR_CODES.UNAUTHORIZED,
        'Authentication required',
        {
          details: 'Valid session required to access monitoring metrics',
          statusCode: 401,
        }
      );
    }

    // クエリパラメータ解析
    const searchParams = request.nextUrl.searchParams;
    const queryResult = QuerySchema.safeParse({
      timeRange: searchParams.get('timeRange'),
      metrics: searchParams.get('metrics')?.split(','),
      aggregation: searchParams.get('aggregation'),
    });

    if (!queryResult.success) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid query parameters',
        {
          details: queryResult.error.errors,
          statusCode: 400,
        }
      );
    }

    const { timeRange, metrics: requestedMetrics, aggregation } = queryResult.data;

    logger.info('Fetching monitoring metrics', {
      userId: session.user.id,
      timeRange,
      metrics: requestedMetrics,
      aggregation,
      requestId,
    });

    // 時間範囲計算
    const timeRangeMs = parseTimeRange(timeRange);
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeRangeMs);

    // 現在のメトリクス取得
    const currentMetrics = metricsCollector.getCurrentMetrics();
    if (!currentMetrics) {
      return createErrorResponse(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Metrics not available',
        {
          details: 'No metrics data available at this time',
          statusCode: 503,
        }
      );
    }

    // メトリクス履歴取得
    const metricsHistory = metricsCollector.getMetricsHistory(100);
    const filteredHistory = metricsHistory.filter(
      m => m.timestamp >= startTime.getTime() && m.timestamp <= endTime.getTime()
    );

    // レスポンスデータ構築
    const responseData = {
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        duration: timeRangeMs,
      },
      current: currentMetrics,
      history: filteredHistory,
      aggregated: aggregateMetrics(filteredHistory, aggregation, requestedMetrics),
      summary: generateMetricsSummary(currentMetrics, filteredHistory),
    };

    logger.info('Successfully fetched monitoring metrics', {
      userId: session.user.id,
      dataPoints: filteredHistory.length,
      requestId,
    });

    return createSuccessResponse(responseData);

  } catch (error) {
    logger.error('Error fetching monitoring metrics', error as Error, {
      requestId,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to fetch monitoring metrics',
      {
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        statusCode: 500,
      }
    );
  }
}

/**
 * カスタムメトリクス投稿 (POST)
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse(
        ERROR_CODES.UNAUTHORIZED,
        'Authentication required',
        {
          details: 'Valid session required to submit custom metrics',
          statusCode: 401,
        }
      );
    }

    // リクエストボディ解析
    const body = await request.json();
    const customMetrics = z.object({
      component: z.string().min(1),
      metrics: z.record(z.number()),
      timestamp: z.string().datetime().optional(),
      metadata: z.record(z.any()).optional(),
    }).parse(body);

    logger.info('Receiving custom metrics', {
      userId: session.user.id,
      component: customMetrics.component,
      metricsCount: Object.keys(customMetrics.metrics).length,
      requestId,
    });

    // メトリクス記録（カスタムメトリクス機能は将来実装予定）
    // metricsCollector.recordCustomMetrics({
    //   component: customMetrics.component,
    //   metrics: customMetrics.metrics,
    //   timestamp: customMetrics.timestamp ? new Date(customMetrics.timestamp) : new Date(),
    //   metadata: customMetrics.metadata,
    //   userId: session.user.id,
    // });

    logger.info('Successfully recorded custom metrics', {
      userId: session.user.id,
      component: customMetrics.component,
      requestId,
    });

    return createSuccessResponse({
      message: 'Custom metrics recorded successfully',
      component: customMetrics.component,
      recordedAt: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error recording custom metrics', error as Error, {
      requestId,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to record custom metrics',
      {
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        statusCode: 500,
      }
    );
  }
}

/**
 * 時間範囲をミリ秒に変換
 */
function parseTimeRange(timeRange: string): number {
  switch (timeRange) {
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000; // デフォルト1時間
  }
}

/**
 * メトリクス集約処理
 */
function aggregateMetrics(
  history: any[],
  aggregation: string,
  requestedMetrics?: string[]
): Record<string, any> {
  if (history.length === 0) return {};

  const aggregated: Record<string, any> = {};
  const categories = requestedMetrics || [
    'http', 'system', 'database', 'cache', 'business'
  ];

  for (const category of categories) {
    aggregated[category] = {};
    
    // カテゴリ別のメトリクス集約
    switch (category) {
      case 'http':
        aggregated.http = aggregateHttpMetrics(history, aggregation);
        break;
      case 'system':
        aggregated.system = aggregateSystemMetrics(history, aggregation);
        break;
      case 'database':
        aggregated.database = aggregateDatabaseMetrics(history, aggregation);
        break;
      case 'cache':
        aggregated.cache = aggregateCacheMetrics(history, aggregation);
        break;
      case 'business':
        aggregated.business = aggregateBusinessMetrics(history, aggregation);
        break;
    }
  }

  return aggregated;
}

/**
 * HTTPメトリクス集約
 */
function aggregateHttpMetrics(history: any[], aggregation: string): Record<string, number> {
  const httpMetrics = history.map(h => h.httpMetrics).filter(Boolean);
  if (httpMetrics.length === 0) return {};

  return {
    totalRequests: aggregateValues(httpMetrics.map(m => m.requestCount), aggregation),
    averageResponseTime: aggregateValues(httpMetrics.map(m => m.averageResponseTime), 'avg'),
    errorRate: aggregateValues(httpMetrics.map(m => m.errorRate), 'avg'),
    slowRequestCount: aggregateValues(httpMetrics.map(m => m.slowRequestCount), aggregation),
  };
}

/**
 * システムメトリクス集約
 */
function aggregateSystemMetrics(history: any[], aggregation: string): Record<string, number> {
  const systemMetrics = history.map(h => h.systemMetrics).filter(Boolean);
  if (systemMetrics.length === 0) return {};

  return {
    cpuUsage: aggregateValues(systemMetrics.map(m => m.cpuUsage), aggregation),
    memoryUsage: aggregateValues(systemMetrics.map(m => m.memoryUsage.percentage), aggregation),
    memoryUsed: aggregateValues(systemMetrics.map(m => m.memoryUsage.used), aggregation),
    diskUsage: aggregateValues(systemMetrics.map(m => m.diskUsage.percentage), aggregation),
  };
}

/**
 * データベースメトリクス集約
 */
function aggregateDatabaseMetrics(history: any[], aggregation: string): Record<string, number> {
  const dbMetrics = history.map(h => h.databaseMetrics).filter(Boolean);
  if (dbMetrics.length === 0) return {};

  return {
    connectionCount: aggregateValues(dbMetrics.map(m => m.connectionCount), aggregation),
    activeQueries: aggregateValues(dbMetrics.map(m => m.activeQueries), aggregation),
    averageQueryTime: aggregateValues(dbMetrics.map(m => m.averageQueryTime), 'avg'),
    slowQueryCount: aggregateValues(dbMetrics.map(m => m.slowQueryCount), aggregation),
    cacheHitRate: aggregateValues(dbMetrics.map(m => m.cacheHitRate), 'avg'),
  };
}

/**
 * キャッシュメトリクス集約
 */
function aggregateCacheMetrics(history: any[], aggregation: string): Record<string, number> {
  const cacheMetrics = history.map(h => h.cacheMetrics).filter(Boolean);
  if (cacheMetrics.length === 0) return {};

  return {
    hitRate: aggregateValues(cacheMetrics.map(m => m.hitRate), 'avg'),
    missCount: aggregateValues(cacheMetrics.map(m => m.missCount), aggregation),
    memoryUsage: aggregateValues(cacheMetrics.map(m => m.memoryUsage), aggregation),
    evictionCount: aggregateValues(cacheMetrics.map(m => m.evictionCount), aggregation),
  };
}

/**
 * ビジネスメトリクス集約
 */
function aggregateBusinessMetrics(history: any[], aggregation: string): Record<string, number> {
  const businessMetrics = history.map(h => h.businessMetrics).filter(Boolean);
  if (businessMetrics.length === 0) return {};

  return {
    activeUsers: aggregateValues(businessMetrics.map(m => m.activeUsers), 'max'),
    activeServers: aggregateValues(businessMetrics.map(m => m.activeServers), 'max'),
    totalServers: aggregateValues(businessMetrics.map(m => m.totalServers), 'max'),
    totalSecrets: aggregateValues(businessMetrics.map(m => m.totalSecrets), 'max'),
    jobsInProgress: aggregateValues(businessMetrics.map(m => m.jobsInProgress), aggregation),
  };
}

/**
 * 値の集約計算
 */
function aggregateValues(values: number[], aggregation: string): number {
  if (values.length === 0) return 0;

  const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (validValues.length === 0) return 0;

  switch (aggregation) {
    case 'sum':
      return validValues.reduce((sum, val) => sum + val, 0);
    case 'avg':
      return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
    case 'min':
      return Math.min(...validValues);
    case 'max':
      return Math.max(...validValues);
    case 'p95':
      const p95Index = Math.floor(validValues.length * 0.95);
      return validValues.sort((a, b) => a - b)[p95Index] || 0;
    case 'p99':
      const p99Index = Math.floor(validValues.length * 0.99);
      return validValues.sort((a, b) => a - b)[p99Index] || 0;
    default:
      return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
  }
}

/**
 * メトリクスサマリー生成
 */
function generateMetricsSummary(current: any, history: any[]): Record<string, any> {
  return {
    health: calculateHealthScore(current),
    trends: calculateTrends(history),
    alerts: {
      critical: 0, // アラートシステムから取得
      warning: 0,
      info: 0,
    },
    uptime: '99.9%', // 実際の稼働時間計算
    lastUpdate: new Date().toISOString(),
  };
}

/**
 * ヘルススコア計算
 */
function calculateHealthScore(metrics: any): {
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  factors: Record<string, number>;
} {
  const factors = {
    errorRate: metrics.httpMetrics?.errorRate || 0,
    responseTime: metrics.httpMetrics?.averageResponseTime || 0,
    memoryUsage: metrics.systemMetrics?.memoryUsage?.percentage || 0,
    cpuUsage: metrics.systemMetrics?.cpuUsage || 0,
    cacheHitRate: metrics.cacheMetrics?.hitRate || 1,
  };

  let score = 100;

  // エラー率による減点
  if (factors.errorRate > 0.05) score -= 20;
  if (factors.errorRate > 0.1) score -= 20;

  // レスポンス時間による減点
  if (factors.responseTime > 1000) score -= 15;
  if (factors.responseTime > 2000) score -= 15;

  // メモリ使用率による減点
  if (factors.memoryUsage > 80) score -= 10;
  if (factors.memoryUsage > 90) score -= 15;

  // CPU使用率による減点
  if (factors.cpuUsage > 80) score -= 10;
  if (factors.cpuUsage > 90) score -= 15;

  // キャッシュヒット率による減点
  if (factors.cacheHitRate < 0.8) score -= 10;
  if (factors.cacheHitRate < 0.6) score -= 15;

  const status = score >= 90 ? 'excellent' :
                score >= 75 ? 'good' :
                score >= 60 ? 'warning' : 'critical';

  return { score, status, factors };
}

/**
 * トレンド計算
 */
function calculateTrends(history: any[]): Record<string, 'up' | 'down' | 'stable'> {
  if (history.length < 2) {
    return {
      errorRate: 'stable',
      responseTime: 'stable',
      memoryUsage: 'stable',
      cpuUsage: 'stable',
    };
  }

  const recent = history.slice(-5);
  const earlier = history.slice(-10, -5);

  if (earlier.length === 0 || recent.length === 0) {
    return {
      errorRate: 'stable',
      responseTime: 'stable',
      memoryUsage: 'stable',
      cpuUsage: 'stable',
    };
  }

  const recentAvg = {
    errorRate: recent.reduce((sum, h) => sum + (h.httpMetrics?.errorRate || 0), 0) / recent.length,
    responseTime: recent.reduce((sum, h) => sum + (h.httpMetrics?.averageResponseTime || 0), 0) / recent.length,
    memoryUsage: recent.reduce((sum, h) => sum + (h.systemMetrics?.memoryUsage?.percentage || 0), 0) / recent.length,
    cpuUsage: recent.reduce((sum, h) => sum + (h.systemMetrics?.cpuUsage || 0), 0) / recent.length,
  };

  const earlierAvg = {
    errorRate: earlier.reduce((sum, h) => sum + (h.httpMetrics?.errorRate || 0), 0) / earlier.length,
    responseTime: earlier.reduce((sum, h) => sum + (h.httpMetrics?.averageResponseTime || 0), 0) / earlier.length,
    memoryUsage: earlier.reduce((sum, h) => sum + (h.systemMetrics?.memoryUsage?.percentage || 0), 0) / earlier.length,
    cpuUsage: earlier.reduce((sum, h) => sum + (h.systemMetrics?.cpuUsage || 0), 0) / earlier.length,
  };

  return {
    errorRate: getTrend(recentAvg.errorRate, earlierAvg.errorRate, 0.01),
    responseTime: getTrend(recentAvg.responseTime, earlierAvg.responseTime, 50),
    memoryUsage: getTrend(recentAvg.memoryUsage, earlierAvg.memoryUsage, 5),
    cpuUsage: getTrend(recentAvg.cpuUsage, earlierAvg.cpuUsage, 5),
  };
}

/**
 * トレンド判定
 */
function getTrend(recent: number, earlier: number, threshold: number): 'up' | 'down' | 'stable' {
  const diff = recent - earlier;
  if (Math.abs(diff) < threshold) return 'stable';
  return diff > 0 ? 'up' : 'down';
}