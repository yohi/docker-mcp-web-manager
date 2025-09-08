import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/response';
import { logAnalyzer } from '@/lib/logging/log-aggregation';
import { LogLevel } from '@/lib/logging/structured-logger';
import { logger } from '@/lib/logging/structured-logger';

// =============================================================================
// ログ管理 API エンドポイント
// ログクエリ、分析、エクスポートの提供
// =============================================================================

/**
 * ログクエリスキーマ
 */
const LogQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  level: z.array(z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'])).optional(),
  component: z.array(z.string()).optional(),
  user: z.array(z.string()).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
  sortBy: z.enum(['timestamp', 'level', 'component']).optional().default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * ログ分析クエリスキーマ
 */
const LogAnalysisQuerySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  includeDetails: z.coerce.boolean().optional().default(false),
});

/**
 * ログクエリ・検索 (GET)
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse({
        message: 'Authentication required',
        details: 'Valid session required to access logs',
      }, 401);
    }

    // クエリパラメータ解析
    const searchParams = request.nextUrl.searchParams;
    
    // 分析クエリかどうかチェック
    const isAnalysis = searchParams.get('analyze') === 'true';
    
    if (isAnalysis) {
      return handleLogAnalysis(request, session, requestId);
    }

    const queryResult = LogQuerySchema.safeParse({
      startTime: searchParams.get('startTime'),
      endTime: searchParams.get('endTime'),
      level: searchParams.get('level')?.split(','),
      component: searchParams.get('component')?.split(','),
      user: searchParams.get('user')?.split(','),
      search: searchParams.get('search'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      sortBy: searchParams.get('sortBy'),
      sortOrder: searchParams.get('sortOrder'),
    });

    if (!queryResult.success) {
      return createErrorResponse({
        message: 'Invalid query parameters',
        details: queryResult.error.errors,
      }, 400);
    }

    const query = queryResult.data;

    logger.info('Querying logs', {
      userId: session.user.id,
      query,
      requestId,
    });

    // ログクエリ実行
    const logQuery = {
      startTime: query.startTime ? new Date(query.startTime) : undefined,
      endTime: query.endTime ? new Date(query.endTime) : undefined,
      levels: query.level?.map(level => LogLevel[level as keyof typeof LogLevel]).filter(l => l !== undefined),
      components: query.component,
      users: query.user,
      searchTerm: query.search,
      limit: query.limit + query.offset, // オフセット分も取得
      offset: 0,
    };

    const allLogs = await logAnalyzer.queryLogs(logQuery);
    
    // ソート処理
    const sortedLogs = sortLogs(allLogs, query.sortBy, query.sortOrder);
    
    // ページネーション
    const total = sortedLogs.length;
    const paginatedLogs = sortedLogs.slice(query.offset, query.offset + query.limit);

    // レスポンス形式に変換
    const formattedLogs = paginatedLogs.map(log => ({
      ...log,
      timestamp: log.timestamp.toISOString(),
      level: LogLevel[log.level],
    }));

    const responseData = {
      logs: formattedLogs,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
      query,
      metadata: {
        queryTime: new Date().toISOString(),
        componentsFound: [...new Set(allLogs.map(log => log.component))],
        levelsFound: [...new Set(allLogs.map(log => LogLevel[log.level]))],
      },
    };

    logger.info('Successfully queried logs', {
      userId: session.user.id,
      logCount: paginatedLogs.length,
      total,
      requestId,
    });

    return createSuccessResponse(responseData);

  } catch (error) {
    logger.error('Error querying logs', error as Error, {
      requestId,
    });

    return createErrorResponse({
      message: 'Failed to query logs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * ログ分析処理
 */
async function handleLogAnalysis(
  request: NextRequest,
  session: any,
  requestId: string
): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  
  const queryResult = LogAnalysisQuerySchema.safeParse({
    startTime: searchParams.get('startTime'),
    endTime: searchParams.get('endTime'),
    includeDetails: searchParams.get('includeDetails'),
  });

  if (!queryResult.success) {
    return createErrorResponse({
      message: 'Invalid analysis parameters',
      details: queryResult.error.errors,
    }, 400);
  }

  const { startTime, endTime, includeDetails } = queryResult.data;

  logger.info('Analyzing logs', {
    userId: session.user.id,
    startTime,
    endTime,
    includeDetails,
    requestId,
  });

  try {
    // ログ分析実行
    const analysis = await logAnalyzer.analyzeTimeRange(
      new Date(startTime),
      new Date(endTime)
    );

    // 詳細情報を含める場合の追加データ
    let additionalData = {};
    if (includeDetails) {
      const [recentErrors, slowRequests, activeUsers] = await Promise.all([
        logAnalyzer.getRecentErrors(1), // 1時間以内のエラー
        logAnalyzer.detectSlowRequests(1), // 1時間以内のスローリクエスト
        logAnalyzer.analyzeActiveUsers(1), // 1時間以内のアクティブユーザー
      ]);

      additionalData = {
        recentErrors: recentErrors.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
          level: LogLevel[log.level],
        })),
        slowRequests: slowRequests.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
          level: LogLevel[log.level],
        })),
        activeUsers,
      };
    }

    const responseData = {
      analysis: {
        ...analysis,
        timeRange: {
          start: analysis.timeRange.start.toISOString(),
          end: analysis.timeRange.end.toISOString(),
          duration: analysis.timeRange.duration,
        },
      },
      ...additionalData,
      generatedAt: new Date().toISOString(),
    };

    logger.info('Successfully analyzed logs', {
      userId: session.user.id,
      totalLogs: analysis.totalLogs,
      totalErrors: analysis.errorAnalysis.totalErrors,
      requestId,
    });

    return createSuccessResponse(responseData);

  } catch (error) {
    logger.error('Error analyzing logs', error as Error, {
      requestId,
    });

    return createErrorResponse({
      message: 'Failed to analyze logs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * ログエクスポート (POST)
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse({
        message: 'Authentication required',
        details: 'Valid session required to export logs',
      }, 401);
    }

    // リクエストボディ解析
    const body = await request.json();
    const exportRequest = z.object({
      format: z.enum(['json', 'csv', 'txt']),
      query: LogQuerySchema.omit({ limit: true, offset: true }),
      maxRecords: z.number().min(1).max(10000).optional().default(1000),
    }).parse(body);

    logger.info('Exporting logs', {
      userId: session.user.id,
      format: exportRequest.format,
      maxRecords: exportRequest.maxRecords,
      requestId,
    });

    // ログクエリ実行
    const logQuery = {
      startTime: exportRequest.query.startTime ? new Date(exportRequest.query.startTime) : undefined,
      endTime: exportRequest.query.endTime ? new Date(exportRequest.query.endTime) : undefined,
      levels: exportRequest.query.level?.map(level => LogLevel[level as keyof typeof LogLevel]).filter(l => l !== undefined),
      components: exportRequest.query.component,
      users: exportRequest.query.user,
      searchTerm: exportRequest.query.search,
      limit: exportRequest.maxRecords,
    };

    const logs = await logAnalyzer.queryLogs(logQuery);
    
    // ソート処理
    const sortedLogs = sortLogs(logs, exportRequest.query.sortBy, exportRequest.query.sortOrder);

    // フォーマット別エクスポート
    let exportData: string;
    let contentType: string;
    let filename: string;

    switch (exportRequest.format) {
      case 'json':
        exportData = JSON.stringify(
          sortedLogs.map(log => ({
            ...log,
            timestamp: log.timestamp.toISOString(),
            level: LogLevel[log.level],
          })),
          null,
          2
        );
        contentType = 'application/json';
        filename = `logs-${new Date().toISOString().split('T')[0]}.json`;
        break;

      case 'csv':
        exportData = formatLogsAsCsv(sortedLogs);
        contentType = 'text/csv';
        filename = `logs-${new Date().toISOString().split('T')[0]}.csv`;
        break;

      case 'txt':
        exportData = formatLogsAsText(sortedLogs);
        contentType = 'text/plain';
        filename = `logs-${new Date().toISOString().split('T')[0]}.txt`;
        break;

      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }

    logger.info('Successfully exported logs', {
      userId: session.user.id,
      format: exportRequest.format,
      logCount: sortedLogs.length,
      requestId,
    });

    // ファイルダウンロードレスポンス
    return new NextResponse(exportData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': exportData.length.toString(),
      },
    });

  } catch (error) {
    logger.error('Error exporting logs', error as Error, {
      requestId,
    });

    return createErrorResponse({
      message: 'Failed to export logs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * ログソート処理
 */
function sortLogs(logs: any[], sortBy: string, sortOrder: string): any[] {
  return logs.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case 'timestamp':
        comparison = a.timestamp.getTime() - b.timestamp.getTime();
        break;
      case 'level':
        comparison = a.level - b.level;
        break;
      case 'component':
        comparison = a.component.localeCompare(b.component);
        break;
      default:
        comparison = a.timestamp.getTime() - b.timestamp.getTime();
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });
}

/**
 * CSV形式フォーマット
 */
function formatLogsAsCsv(logs: any[]): string {
  const header = 'Timestamp,Level,Component,Message,User ID,Request ID\n';
  
  const rows = logs.map(log => {
    const timestamp = log.timestamp.toISOString();
    const level = LogLevel[log.level];
    const component = log.component || '';
    const message = (log.message || '').replace(/"/g, '""'); // CSV エスケープ
    const userId = log.userId || '';
    const requestId = log.requestId || '';
    
    return `"${timestamp}","${level}","${component}","${message}","${userId}","${requestId}"`;
  }).join('\n');

  return header + rows;
}

/**
 * テキスト形式フォーマット
 */
function formatLogsAsText(logs: any[]): string {
  return logs.map(log => {
    const timestamp = log.timestamp.toISOString();
    const level = LogLevel[log.level].padEnd(5);
    const component = (log.component || '').padEnd(20);
    const message = log.message || '';
    
    return `[${timestamp}] ${level} ${component} ${message}`;
  }).join('\n');
}