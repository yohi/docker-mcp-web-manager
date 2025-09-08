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
import { SSEManager, DockerMCPClient } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/logs/stream - ログストリーミングAPI
// MCPサーバーのリアルタイムログストリーミング機能（Server-Sent Events）
// =============================================================================

/**
 * ログストリーミング開始
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
      query: LogSchemas.streamQuery,
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data!.params.id;
    const queryParams = validation.data!.query;

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

    // SSEストリーミング開始
    const sseManager = new SSEManager();
    const dockerClient = new DockerMCPClient();

    // 監査ログ（開始）
    logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      statusCode: 200,
      details: { action: 'stream_started' },
    });

    // ReadableStreamを作成してSSEレスポンスを構築
    const stream = new ReadableStream({
      start(controller) {
        // SSE初期設定
        const encoder = new TextEncoder();
        
        // 初期接続確認メッセージ
        const initMessage = `data: ${JSON.stringify({
          type: 'connected',
          serverId,
          serverName: server.name,
          timestamp: new Date().toISOString(),
          requestId,
        })}\n\n`;
        controller.enqueue(encoder.encode(initMessage));

        // ログストリーミング開始
        const startLogStream = async () => {
          try {
            const logStream = await dockerClient.streamServerLogs(serverId, {
              follow: true,
              tail: queryParams.tail || 100,
              since: queryParams.since,
              level: queryParams.level,
            });

            // ログエントリを順次ストリーミング
            logStream.on('log', (logEntry) => {
              try {
                const message = `data: ${JSON.stringify({
                  type: 'log',
                  serverId,
                  timestamp: logEntry.timestamp,
                  level: logEntry.level,
                  message: logEntry.message,
                  source: logEntry.source,
                })}\n\n`;
                controller.enqueue(encoder.encode(message));
              } catch (error) {
                console.error('[SSE_LOG_ERROR] Failed to send log entry:', error);
              }
            });

            // エラーハンドリング
            logStream.on('error', (error) => {
              console.error(`[LOG_STREAM_ERROR] Stream error for server ${serverId}:`, error);
              
              const errorMessage = `data: ${JSON.stringify({
                type: 'error',
                serverId,
                error: error.message,
                timestamp: new Date().toISOString(),
              })}\n\n`;
              controller.enqueue(encoder.encode(errorMessage));
              
              // エラー時は接続を閉じる
              controller.close();
            });

            // ストリーム終了時
            logStream.on('end', () => {
              const endMessage = `data: ${JSON.stringify({
                type: 'disconnected',
                serverId,
                reason: 'stream_ended',
                timestamp: new Date().toISOString(),
              })}\n\n`;
              controller.enqueue(encoder.encode(endMessage));
              controller.close();
            });

          } catch (error) {
            console.error(`[LOG_STREAM_INIT_ERROR] Failed to initialize log stream for ${serverId}:`, error);
            
            const errorMessage = `data: ${JSON.stringify({
              type: 'error',
              serverId,
              error: error instanceof Error ? error.message : 'Stream initialization failed',
              timestamp: new Date().toISOString(),
            })}\n\n`;
            controller.enqueue(encoder.encode(errorMessage));
            controller.close();
          }
        };

        // 非同期でストリーミング開始
        startLogStream();
      },

      cancel() {
        // クライアント切断時の処理
        const duration = Date.now() - startTime;
        logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/stream`, requestId, {
          userId: authResult.session.user.id,
          duration,
          statusCode: 200,
          details: { action: 'stream_cancelled' },
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
        // セキュリティヘッダー
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
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