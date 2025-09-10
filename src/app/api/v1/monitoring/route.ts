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
// import { DockerMCPClient } from '@/lib/docker-mcp/client';
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
    // 開発環境では認証をスキップ
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SKIP_AUTH !== 'true') {
      // TODO: 本番環境では認証チェックを実装
      return createErrorResponse('Unauthorized', ERROR_CODES.UNAUTHORIZED, 401);
    }

    // クエリパラメータの手動解析（簡易版）
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || '24h';
    const metricsParam = url.searchParams.get('metrics');
    const metrics = metricsParam ? metricsParam.split(',') : undefined;
    const includeDetails = url.searchParams.get('includeDetails') === 'true';

    // パラメータのバリデーション
    const validPeriods = ['1h', '6h', '24h', '7d', '30d'];
    if (!validPeriods.includes(period)) {
      return createValidationErrorResponse('Invalid period parameter', requestId);
    }

    // サーバー情報の取得
    const serverRepository = new ServerRepository();

    // モックシステム情報（本番環境では実際のDockerクライアントから取得）
    const systemInfo = {
      platform: 'linux',
      architecture: 'x64',
      version: '20.10.0',
      kernelVersion: '5.4.0',
      uptime: Math.floor(Math.random() * 1000000) + 100000,
    };

    const serverStats = {
      cpuUsage: Math.random() * 100,
      memoryUsage: 50 + Math.random() * 40,
      diskUsage: 30 + Math.random() * 50,
      networkRx: Math.floor(Math.random() * 10000),
      networkTx: Math.floor(Math.random() * 10000),
    };

    const containersList: any[] = [];

    // サーバー統計の取得（開発環境では全データ）
    const serversCount = await serverRepository.findAll().then(servers => servers.length);

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
      resources: serverStats ? {
        cpu: {
          usage: serverStats.cpuUsage || 0,
          cores: 4,
        },
        memory: {
          used: Math.floor(serverStats.memoryUsage * 8192 / 100) || 0,
          total: 8192,
          usage: serverStats.memoryUsage || 0,
        },
        disk: {
          used: Math.floor(serverStats.diskUsage * 500 / 100) || 0,
          total: 500,
          usage: serverStats.diskUsage || 0,
        },
        network: {
          bytesReceived: serverStats.networkRx || 0,
          bytesSent: serverStats.networkTx || 0,
        },
      } : null,
    };

    // 詳細情報を含める場合（暫定的に無効化）
    const detailedMetrics = {}; /* false ? {
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
    } : {}; */

    // メトリクス履歴（時系列データのモック）
    const historicalMetrics = generateHistoricalData(period);

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/monitoring', requestId, startTime, 200, {
      userId: 'dev-user',
      userRole: 'admin',
      details: {
        period: period,
        includeDetails: includeDetails,
        containersCount: containersList.length,
        metricsRequested: metrics,
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
        period: period,
        includeDetails: includeDetails,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[API_ERROR] GET /api/v1/monitoring:', error);

    logAPIRequest('GET', '/api/v1/monitoring', requestId, startTime, 500, {
      error: errorMessage,
    });

    return createErrorResponse(
      'Failed to retrieve monitoring data',
      ERROR_CODES.INTERNAL_ERROR,
      500
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
