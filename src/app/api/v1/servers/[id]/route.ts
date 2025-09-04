import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';
import { getDockerMCPClient } from '../../../../../lib/docker-mcp';
import { validateAndSanitizeArgs } from '../../../../../lib/utils/command-security';

/**
 * サーバー操作用のボディスキーマ
 */
const serverActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'enable', 'disable']),
});

type ServerAction = z.infer<typeof serverActionSchema>;

/**
 * GET /api/v1/servers/[id] - 特定サーバーの詳細取得
 */
async function handleGetServer(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
    const dockerMCPClient = getDockerMCPClient();
    
    const server = await dockerMCPClient.getServerDetails(sanitizedId);
    
    return NextResponse.json({
      data: server,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching server ${params.id}:`, error);
    return createApiErrorResponse(
      'SERVER_003',
      `Failed to fetch server details for ${params.id}`,
      500,
      { serverId: params.id, error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * POST /api/v1/servers/[id] - サーバー操作実行
 */
async function handleServerAction(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    serverActionSchema,
    async (req: NextRequest, actionData: ServerAction) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        const dockerMCPClient = getDockerMCPClient();
        
        let jobResponse;
        
        switch (actionData.action) {
          case 'enable':
            jobResponse = await dockerMCPClient.enableServer(sanitizedId);
            break;
          case 'disable':
            jobResponse = await dockerMCPClient.disableServer(sanitizedId);
            break;
          case 'start':
            // 実際の実装ではstartGatewayまたは個別サーバー開始機能が必要
            return createApiErrorResponse(
              'SERVER_004',
              'Server start operation not implemented yet',
              501
            );
          case 'stop':
            // 実際の実装ではstopGatewayまたは個別サーバー停止機能が必要
            return createApiErrorResponse(
              'SERVER_005',
              'Server stop operation not implemented yet',
              501
            );
          case 'restart':
            // 実際の実装では再起動ロジックが必要
            return createApiErrorResponse(
              'SERVER_006',
              'Server restart operation not implemented yet',
              501
            );
          default:
            return createApiErrorResponse(
              'SERVER_007',
              `Unknown action: ${actionData.action}`,
              400
            );
        }
        
        return NextResponse.json({
          data: jobResponse,
          message: `Server ${actionData.action} operation initiated`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Error executing ${actionData.action} on server ${params.id}:`, error);
        return createApiErrorResponse(
          'SERVER_008',
          `Failed to execute ${actionData.action} on server ${params.id}`,
          500,
          { 
            serverId: params.id, 
            action: actionData.action,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * PUT /api/v1/servers/[id] - サーバー設定更新
 */
async function handleUpdateServer(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return createApiErrorResponse(
    'SERVER_009',
    'Server configuration update not implemented yet',
    501
  );
}

/**
 * DELETE /api/v1/servers/[id] - サーバー削除
 */
async function handleDeleteServer(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return createApiErrorResponse(
    'SERVER_010',
    'Server deletion not implemented yet',
    501
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(
  (request: NextRequest, context: any) => handleGetServer(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 200, windowMs: 60 * 1000 },
  }
);

export const POST = apiHandler(
  (request: NextRequest, context: any) => handleServerAction(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 50, windowMs: 60 * 1000 },
  }
);

export const PUT = apiHandler(
  (request: NextRequest, context: any) => handleUpdateServer(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 60 * 1000 },
  }
);

export const DELETE = apiHandler(
  (request: NextRequest, context: any) => handleDeleteServer(request, context),
  {
    requireAdmin: true,
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 },
  }
);