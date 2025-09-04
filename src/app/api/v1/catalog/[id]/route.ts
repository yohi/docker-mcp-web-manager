import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';
import { getCatalogClient } from '../../../../../lib/docker-mcp';
import { validateAndSanitizeArgs } from '../../../../../lib/utils/command-security';

/**
 * サーバーインストール用のボディスキーマ
 */
const installServerSchema = z.object({
  configuration: z.object({
    environment: z.record(z.string()).optional(),
    enabledTools: z.array(z.string()).optional(),
    resourceLimits: z.object({
      memory: z.string().optional(),
      cpu: z.string().optional(),
      disk: z.string().optional(),
    }).optional(),
  }).optional(),
});

type InstallServerRequest = z.infer<typeof installServerSchema>;

/**
 * GET /api/v1/catalog/[id] - カタログアイテム詳細取得
 */
async function handleGetCatalogItem(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
    const catalogClient = getCatalogClient();
    
    const serverInfo = await catalogClient.getServerInfo(sanitizedId);
    
    return NextResponse.json({
      data: serverInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching catalog item ${params.id}:`, error);
    return createApiErrorResponse(
      'CATALOG_002',
      `Failed to fetch catalog item ${params.id}`,
      500,
      { 
        catalogId: params.id,
        error: error instanceof Error ? error.message : String(error) 
      }
    );
  }
}

/**
 * POST /api/v1/catalog/[id] - カタログからサーバーインストール
 */
async function handleInstallServer(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    installServerSchema,
    async (req: NextRequest, installData: InstallServerRequest) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        const catalogClient = getCatalogClient();
        
        // カタログクライアントでサーバーインストール
        const jobResponse = await catalogClient.installServer(
          sanitizedId,
          installData.configuration || {}
        );
        
        return NextResponse.json({
          data: {
            catalogId: sanitizedId,
            configuration: installData.configuration,
            job: jobResponse,
            message: `Installation started for server ${sanitizedId}`,
            estimatedDuration: jobResponse.estimatedDuration,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error(`Error installing server from catalog ${params.id}:`, error);
        return createApiErrorResponse(
          'INSTALL_001',
          `Failed to install server from catalog ${params.id}`,
          500,
          { 
            catalogId: params.id,
            configuration: installData.configuration,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(
  (request: NextRequest, context: any) => handleGetCatalogItem(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 200, windowMs: 60 * 1000 },
  }
);

export const POST = apiHandler(
  (request: NextRequest, context: any) => handleInstallServer(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 }, // インストールは制限を厳しく
  }
);