import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/response';
import { alertNotificationSystem, AlertSeverity, NotificationChannel } from '@/lib/alerts/notification-system';
import { logger } from '@/lib/logging/structured-logger';

// =============================================================================
// アラート管理 API エンドポイント
// アラート一覧、ルール管理、通知設定の提供
// =============================================================================

/**
 * アラート一覧取得のクエリスキーマ
 */
const AlertsQuerySchema = z.object({
  status: z.enum(['active', 'resolved', 'all']).optional().default('active'),
  severity: z.array(z.nativeEnum(AlertSeverity)).optional(),
  component: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
  timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
});

/**
 * アラートルール作成/更新スキーマ
 */
const AlertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean().default(true),
  conditions: z.object({
    logLevel: z.number().min(0).max(5).optional(),
    component: z.string().optional(),
    message: z.string().optional(),
    errorRate: z.number().min(0).max(1).optional(),
    responseTime: z.number().min(0).optional(),
    frequency: z.number().min(1).optional(),
    timeWindow: z.number().min(60000), // 最低1分
  }),
  severity: z.nativeEnum(AlertSeverity),
  channels: z.array(z.nativeEnum(NotificationChannel)),
  cooldown: z.number().min(60000), // 最低1分
  recipients: z.object({
    email: z.array(z.string().email()).optional(),
    slack: z.array(z.string()).optional(),
    webhook: z.array(z.string().url()).optional(),
    sms: z.array(z.string()).optional(),
  }),
  template: z.string().optional(),
});

/**
 * アラート一覧取得 (GET)
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse({
        message: 'Authentication required',
        details: 'Valid session required to access alerts',
      }, 401);
    }

    // クエリパラメータ解析
    const searchParams = request.nextUrl.searchParams;
    const queryResult = AlertsQuerySchema.safeParse({
      status: searchParams.get('status'),
      severity: searchParams.get('severity')?.split(','),
      component: searchParams.get('component'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      timeRange: searchParams.get('timeRange'),
    });

    if (!queryResult.success) {
      return createErrorResponse({
        message: 'Invalid query parameters',
        details: queryResult.error.errors,
      }, 400);
    }

    const query = queryResult.data;

    logger.info('Fetching alerts', {
      userId: session.user.id,
      query,
      requestId,
    });

    // アラート取得
    let alerts = query.status === 'active' 
      ? alertNotificationSystem.getActiveAlerts()
      : alertNotificationSystem.getAlertHistory(200);

    // フィルタリング
    if (query.severity) {
      alerts = alerts.filter(alert => query.severity!.includes(alert.severity));
    }

    if (query.component) {
      alerts = alerts.filter(alert => 
        alert.metadata.component === query.component
      );
    }

    // 時間範囲フィルタリング
    const timeRangeMs = parseTimeRange(query.timeRange);
    const cutoffTime = new Date(Date.now() - timeRangeMs);
    alerts = alerts.filter(alert => alert.timestamp >= cutoffTime);

    // ページネーション
    const total = alerts.length;
    const paginatedAlerts = alerts.slice(query.offset, query.offset + query.limit);

    // 統計情報取得
    const statistics = alertNotificationSystem.getStatistics();

    const responseData = {
      alerts: paginatedAlerts.map(alert => ({
        ...alert,
        timestamp: alert.timestamp.toISOString(),
        resolvedAt: alert.resolvedAt?.toISOString(),
        notifications: alert.notifications.map(n => ({
          ...n,
          sentAt: n.sentAt.toISOString(),
        })),
      })),
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
      statistics,
      query,
    };

    logger.info('Successfully fetched alerts', {
      userId: session.user.id,
      alertCount: paginatedAlerts.length,
      total,
      requestId,
    });

    return createSuccessResponse(responseData);

  } catch (error) {
    logger.error('Error fetching alerts', error as Error, {
      requestId,
    });

    return createErrorResponse({
      message: 'Failed to fetch alerts',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * アラート手動作成 (POST)
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse({
        message: 'Authentication required',
        details: 'Valid session required to create alerts',
      }, 401);
    }

    // 管理者権限チェック
    if (session.user.role !== 'admin') {
      return createErrorResponse({
        message: 'Administrator access required',
        details: 'Only administrators can create manual alerts',
      }, 403);
    }

    // リクエストボディ解析
    const body = await request.json();
    const alertData = z.object({
      severity: z.nativeEnum(AlertSeverity),
      title: z.string().min(1).max(200),
      message: z.string().min(1).max(1000),
      component: z.string().min(1).max(100),
      metadata: z.record(z.any()).optional(),
    }).parse(body);

    logger.info('Creating manual alert', {
      userId: session.user.id,
      title: alertData.title,
      severity: alertData.severity,
      component: alertData.component,
      requestId,
    });

    // 手動アラート作成
    const alertEvent = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      ruleId: 'manual',
      severity: alertData.severity,
      title: alertData.title,
      message: alertData.message,
      timestamp: new Date(),
      metadata: {
        ...alertData.metadata,
        component: alertData.component,
        createdBy: session.user.id,
        manual: true,
      },
      resolved: false,
      notifications: [],
    };

    // デフォルト通知ルール適用（手動アラート用）
    const defaultRule = {
      id: 'manual-alert-rule',
      name: 'Manual Alert',
      description: 'Rule for manual alerts',
      enabled: true,
      conditions: { timeWindow: 0 },
      severity: alertData.severity,
      channels: [NotificationChannel.EMAIL] as const,
      cooldown: 0,
      recipients: {
        email: [session.user.email!],
      },
    };

    // 通知送信（非同期）
    setTimeout(async () => {
      try {
        // 実際の実装では、alertNotificationSystem を使用
        console.log('Sending manual alert notification:', alertEvent);
      } catch (error) {
        logger.error('Failed to send manual alert notification', error as Error, {
          alertId: alertEvent.id,
          requestId,
        });
      }
    }, 0);

    logger.info('Successfully created manual alert', {
      userId: session.user.id,
      alertId: alertEvent.id,
      requestId,
    });

    return createSuccessResponse({
      message: 'Manual alert created successfully',
      alert: {
        ...alertEvent,
        timestamp: alertEvent.timestamp.toISOString(),
      },
    });

  } catch (error) {
    logger.error('Error creating manual alert', error as Error, {
      requestId,
    });

    return createErrorResponse({
      message: 'Failed to create manual alert',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * 時間範囲をミリ秒に変換
 */
function parseTimeRange(timeRange: string): number {
  switch (timeRange) {
    case '1h': return 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}