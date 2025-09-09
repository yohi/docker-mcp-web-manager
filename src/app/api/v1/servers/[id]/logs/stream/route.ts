import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
  LogSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ServerRepository } from '@/db/repositories/server-repository';
import { DockerMCPClient } from '@/lib/docker-mcp';
import { sseSecurityManager } from '@/lib/utils/sse-security';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/logs/stream - ログストリーミングAPI
// MCPサーバーのリアルタイムログストリーミング機能（Server-Sent Events）
// =============================================================================

/**
 * ログストリーミング
 * GET /api/v1/servers/[id]/logs/stream
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.LOGS_STREAM], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/servers/${params.id}/logs/stream`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとクエリのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      query: LogSchemas.getServerLogs,
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    if (!validation.data || !validation.data.params || !validation.data.query) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request data', { requestId });
    }

    const serverId = validation.data.params.id;
    const queryParams = validation.data.query;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Server not found',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_001,
        `Server with ID '${serverId}' not found`,
        { requestId }
      );
    }

    // サーバーが実行中でない場合はストリーミング不可
    if (server.status !== 'running') {
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Server not running',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_005,
        'Cannot stream logs from stopped server. Start the server first.',
        { requestId }
      );
    }

    // クライアントIP取得
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                     request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // SSEセキュリティ認証
    const sseAuthResult = sseSecurityManager.authenticateConnection({
      ip: clientIp,
      userAgent,
      userId: authResult.session.user.id,
      headers: Object.fromEntries(request.headers.entries()),
    });

    if (!sseAuthResult.allowed) {
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 429,
        error: sseAuthResult.error,
      });
      
      return new Response(sseAuthResult.error, {
        status: 429,
        headers: {
          'Content-Type': 'text/plain',
          'Retry-After': '60',
          'X-Request-ID': requestId,
        },
      });
    }

    const connectionId = sseAuthResult.connectionId!;

    // Docker MCPクライアント初期化
    const dockerClient = new DockerMCPClient();

    // 監査ログ（開始）
    logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      statusCode: 200,
    });

    // ReadableStreamを作成してSSEレスポンスを構築
    const stream = new ReadableStream({
      start(controller) {
        // 接続状態を「接続中」に更新
        sseSecurityManager.updateConnectionState(connectionId, 'connected');
        
        // 初期接続確認メッセージ
        const initMessage = sseSecurityManager.formatSSEMessage({
          event: 'connected',
          data: JSON.stringify({
            serverId,
            serverName: server.name,
            timestamp: new Date().toISOString(),
            requestId,
            connectionId,
          }),
        });
        
        controller.enqueue(new TextEncoder().encode(initMessage));

        // ログストリーミング開始
        const startLogStream = async () => {
          try {
            const logs = await dockerClient.getServerLogs(serverId, {
              lines: queryParams.lines || 100,
              since: queryParams.since,
              follow: true,
            });

            // ログエントリを順次ストリーミング（実際の実装では非同期ストリーム）
            for (const logLine of logs) {
              try {
                // セキュリティマネージャーを通してメッセージをキューイング
                const queueResult = sseSecurityManager.queueMessage(connectionId, {
                  event: 'log',
                  data: JSON.stringify({
                    serverId,
                    timestamp: new Date().toISOString(),
                    level: 'info',
                    message: logLine,
                    source: 'container',
                  }),
                });

                if (queueResult.success) {
                  // キューからメッセージを取り出して送信
                  const message = sseSecurityManager.dequeueMessage(connectionId);
                  if (message) {
                    const formattedMessage = sseSecurityManager.formatSSEMessage(message);
                    controller.enqueue(new TextEncoder().encode(formattedMessage));
                  }
                } else {
                  console.warn(`[SSE_BACKPRESSURE] ${queueResult.error} for connection ${connectionId}`);
                }
              } catch (error) {
                console.error('[SSE_LOG_ERROR] Failed to send log entry:', error);
              }
            }

          } catch (error) {
            console.error(`[LOG_STREAM_INIT_ERROR] Failed to initialize log stream for ${serverId}:`, error);
            
            const errorMessage = sseSecurityManager.formatSSEMessage({
              event: 'error',
              data: JSON.stringify({
                serverId,
                error: error instanceof Error ? error.message : 'Stream initialization failed',
                timestamp: new Date().toISOString(),
              }),
            });
            
            controller.enqueue(new TextEncoder().encode(errorMessage));
            sseSecurityManager.updateConnectionState(connectionId, 'closed');
            controller.close();
          }
        };

        // 非同期でストリーミング開始
        startLogStream();

        // ハートビートの設定
        const heartbeatInterval = setInterval(() => {
          const heartbeat = sseSecurityManager.generateHeartbeat();
          const formattedMessage = sseSecurityManager.formatSSEMessage(heartbeat);
          controller.enqueue(new TextEncoder().encode(formattedMessage));
        }, 30000); // 30秒間隔

        // クリーンアップ関数を保存
        (controller as any)._cleanup = () => {
          clearInterval(heartbeatInterval);
          sseSecurityManager.updateConnectionState(connectionId, 'closed');
        };
      },

      cancel() {
        // クライアント切断時の処理
        const duration = Date.now() - startTime;
        
        if ((this as any)._cleanup) {
          (this as any)._cleanup();
        }
        
        sseSecurityManager.updateConnectionState(connectionId, 'closed');
        
        logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
          userId: authResult.session?.user.id,
          duration,
          statusCode: 200,
        });
      },
    });

    // SSEレスポンスを返す
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization',
        'X-Request-ID': requestId,
        'X-Connection-ID': connectionId,
        // セキュリティヘッダー
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'none'",
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/servers/[id]/logs/stream:', error);
    
    logAPIRequest('GET', `/api/v1/servers/${params.id}/logs/stream`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to start log streaming',
      { requestId, details: errorMessage }
    );
  }
}