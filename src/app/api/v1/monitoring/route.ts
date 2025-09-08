import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requirePermissions,
  PERMISSIONS,
  validateRequest,
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/middleware';
import { DockerMCPClient } from '@/lib/docker-mcp/client';
import { ServerRepository } from '@/lib/repositories/server-repository';
import { CommonSchemas } from '@/lib/api/schemas';

// =============================================================================
// 監視・メトリクスAPI
// =============================================================================

/**
 * GET /api/v1/monitoring
 * システム全体の監視メトリクス取得
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.MONITORING_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/monitoring', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const validation = await validateRequest(request, {}, {
      query: z.object({
        period: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
        metrics: z.string().optional().transform(val => val ? val.split(',') : undefined),
        includeDetails: z.string().transform(val => val === 'true').default('false'),
      }),
    });

    if (!validation.success) {
      const error = validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    const query = validation.data!.query;
    
    // Docker MCPクライアントでシステム情報取得
    const dockerClient = DockerMCPClient.getInstance();
    const serverRepository = new ServerRepository();

    // 並列でデータを取得
    const [systemInfo, serverStats, containersList] = await Promise.all([
      dockerClient.getSystemInfo().catch(() => null),
      dockerClient.getSystemStats().catch(() => null),
      dockerClient.listContainers().catch(() => []),
    ]);

    // サーバー統計の取得
    const serversCount = await serverRepository.count({
      userId: authResult.session.user.role === 'ADMIN' ? undefined : authResult.session.user.id,
    });

    // 基本メトリクス
    const baseMetrics = {
      system: {
        timestamp: new Date().toISOString(),
        uptime: systemInfo?.uptime || 0,
        version: systemInfo?.version || 'unknown',
        platform: systemInfo?.platform || 'unknown',
      },
      containers: {
        total: containersList.length,
        running: containersList.filter(c => c.status === 'running').length,
        stopped: containersList.filter(c => c.status === 'stopped' || c.status === 'exited').length,
        error: containersList.filter(c => c.status === 'error' || c.status === 'failed').length,
      },
      servers: {
        total: serversCount,
        managed: containersList.length,
        orphaned: Math.max(0, serversCount - containersList.length),
      },
      resources: systemStats ? {
        cpu: {
          usage: systemStats.cpuUsage || 0,
          cores: systemStats.cpuCores || 1,
        },
        memory: {
          used: systemStats.memoryUsed || 0,
          total: systemStats.memoryTotal || 0,
          usage: systemStats.memoryTotal ? (systemStats.memoryUsed / systemStats.memoryTotal) * 100 : 0,
        },
        disk: {
          used: systemStats.diskUsed || 0,
          total: systemStats.diskTotal || 0,
          usage: systemStats.diskTotal ? (systemStats.diskUsed / systemStats.diskTotal) * 100 : 0,
        },
        network: {
          bytesReceived: systemStats.networkBytesReceived || 0,
          bytesSent: systemStats.networkBytesSent || 0,
        },
      } : null,
    };

    // 詳細情報を含める場合
    const detailedMetrics = query.includeDetails ? {
      containerDetails: await Promise.all(
        containersList.slice(0, 10).map(async (container) => {
          try {
            const stats = await dockerClient.getContainerStats(container.name);
            return {
              name: container.name,
              status: container.status,
              image: container.image,
              created: container.created,
              stats: stats ? {
                cpu: stats.cpuUsage || 0,
                memory: {
                  used: stats.memoryUsed || 0,
                  limit: stats.memoryLimit || 0,
                  usage: stats.memoryLimit ? (stats.memoryUsed / stats.memoryLimit) * 100 : 0,
                },
                network: {
                  bytesReceived: stats.networkBytesReceived || 0,
                  bytesSent: stats.networkBytesSent || 0,
                },
              } : null,
            };
          } catch (error) {
            return {
              name: container.name,
              status: container.status,
              image: container.image,
              created: container.created,
              stats: null,
              error: 'Failed to get stats',
            };
          }
        })
      ),
      systemHealth: {
        dockerDaemon: systemInfo ? 'healthy' : 'unavailable',
        database: 'healthy', // TODO: データベースヘルスチェック
        apiResponse: 'healthy',
      },
    } : {};

    // メトリクス履歴（時系列データのモック）
    const historicalMetrics = generateHistoricalData(query.period);

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/monitoring', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        period: query.period,
        includeDetails: query.includeDetails,
        containersCount: containersList.length,
        metricsRequested: query.metrics,
      },
    });

    return Response.json({
      success: true,
      data: {
        ...baseMetrics,
        ...detailedMetrics,
        historical: historicalMetrics,
        alerts: generateActiveAlerts(baseMetrics),
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        period: query.period,
        includeDetails: query.includeDetails,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/monitoring:', error);
    
    logAPIRequest('GET', '/api/v1/monitoring', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve monitoring data',
      { requestId }
    );
  }
}

/**
 * 時系列データの生成（モック）
 */
function generateHistoricalData(period: string) {
  const now = new Date();
  const dataPoints: Array<{
    timestamp: string;
    cpu: number;
    memory: number;
    containers: number;
    network: { in: number; out: number };
  }> = [];

  let intervals: number;
  let intervalMinutes: number;

  switch (period) {
    case '1h':
      intervals = 12;
      intervalMinutes = 5;
      break;
    case '6h':
      intervals = 24;
      intervalMinutes = 15;
      break;
    case '24h':
      intervals = 24;
      intervalMinutes = 60;
      break;
    case '7d':
      intervals = 28;
      intervalMinutes = 360; // 6時間
      break;
    case '30d':
      intervals = 30;
      intervalMinutes = 1440; // 24時間
      break;
    default:
      intervals = 24;
      intervalMinutes = 60;
  }

  for (let i = intervals - 1; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * intervalMinutes * 60000);
    
    // モック データ生成（実際の実装では実データを使用）
    const baseLoad = 30 + Math.sin((i / intervals) * 2 * Math.PI) * 20;
    const variance = (Math.random() - 0.5) * 20;
    
    dataPoints.push({
      timestamp: timestamp.toISOString(),
      cpu: Math.max(0, Math.min(100, baseLoad + variance)),
      memory: Math.max(0, Math.min(100, baseLoad + variance + 10)),
      containers: Math.floor(3 + Math.random() * 5),
      network: {
        in: Math.floor(Math.random() * 1000000),
        out: Math.floor(Math.random() * 500000),
      },
    });
  }

  return dataPoints;
}

/**
 * アクティブなアラートの生成
 */
function generateActiveAlerts(metrics: any) {
  const alerts: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    timestamp: string;
  }> = [];

  if (metrics.resources) {
    // CPU使用率アラート
    if (metrics.resources.cpu.usage > 90) {
      alerts.push({
        id: `cpu-${Date.now()}`,
        severity: 'critical',
        title: 'High CPU Usage',
        description: `CPU使用率が${metrics.resources.cpu.usage.toFixed(1)}%と高い値です`,
        timestamp: new Date().toISOString(),
      });
    } else if (metrics.resources.cpu.usage > 70) {
      alerts.push({
        id: `cpu-warn-${Date.now()}`,
        severity: 'warning',
        title: 'CPU Usage Warning',
        description: `CPU使用率が${metrics.resources.cpu.usage.toFixed(1)}%です`,
        timestamp: new Date().toISOString(),
      });
    }

    // メモリ使用率アラート
    if (metrics.resources.memory.usage > 85) {
      alerts.push({
        id: `memory-${Date.now()}`,
        severity: 'critical',
        title: 'High Memory Usage',
        description: `メモリ使用率が${metrics.resources.memory.usage.toFixed(1)}%と高い値です`,
        timestamp: new Date().toISOString(),
      });
    }

    // ディスク使用率アラート
    if (metrics.resources.disk.usage > 90) {
      alerts.push({
        id: `disk-${Date.now()}`,
        severity: 'critical',
        title: 'Low Disk Space',
        description: `ディスク使用率が${metrics.resources.disk.usage.toFixed(1)}%です`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 停止コンテナアラート
  if (metrics.containers.stopped > metrics.containers.running) {
    alerts.push({
      id: `containers-${Date.now()}`,
      severity: 'warning',
      title: 'Many Stopped Containers',
      description: `停止中のコンテナ(${metrics.containers.stopped})が実行中(${metrics.containers.running})より多くあります`,
      timestamp: new Date().toISOString(),
    });
  }

  // エラーコンテナアラート
  if (metrics.containers.error > 0) {
    alerts.push({
      id: `error-containers-${Date.now()}`,
      severity: 'critical',
      title: 'Failed Containers',
      description: `${metrics.containers.error}個のコンテナでエラーが発生しています`,
      timestamp: new Date().toISOString(),
    });
  }

  return alerts;
}