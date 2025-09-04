import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../../lib/api/middleware';
import { getDockerMCPClient } from '../../../../../../lib/docker-mcp';
import { validateAndSanitizeArgs } from '../../../../../../lib/utils/command-security';

/**
 * テスト実行用のボディスキーマ
 */
const testExecutionSchema = z.object({
  toolName: z.string().min(1).max(100),
  input: z.record(z.any()).default({}),
  timeout: z.number().min(1000).max(300000).default(60000), // 1秒〜5分
});

type TestExecution = z.infer<typeof testExecutionSchema>;

/**
 * テスト履歴取得用のクエリスキーマ
 */
const testHistoryQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  toolName: z.string().max(100).optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  since: z.string().optional(),
});

type TestHistoryQuery = z.infer<typeof testHistoryQuerySchema>;

/**
 * GET /api/v1/servers/[id]/test - テスト履歴取得
 */
async function handleGetTestHistory(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    testHistoryQuerySchema,
    async (req: NextRequest, query: TestHistoryQuery) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        
        // 実際の実装では、テスト履歴データベースからの取得が必要
        // ここでは仮の実装
        return NextResponse.json({
          data: {
            serverId: sanitizedId,
            tests: [], // 実際にはデータベースから取得
            pagination: {
              page: query.page,
              limit: query.limit,
              total: 0,
              totalPages: 0,
              hasNext: false,
              hasPrev: false,
            },
            filters: {
              toolName: query.toolName,
              status: query.status,
              since: query.since,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error(`Error fetching test history for server ${params.id}:`, error);
        return createApiErrorResponse(
          'TEST_001',
          `Failed to fetch test history for server ${params.id}`,
          500,
          { 
            serverId: params.id,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * POST /api/v1/servers/[id]/test - テスト実行
 */
async function handleExecuteTest(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    testExecutionSchema,
    async (req: NextRequest, testData: TestExecution) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        const dockerMCPClient = getDockerMCPClient();
        
        // Docker MCPクライアントでテスト実行
        const jobResponse = await dockerMCPClient.testServerTool(
          sanitizedId,
          testData.toolName,
          testData.input
        );
        
        return NextResponse.json({
          data: {
            serverId: sanitizedId,
            toolName: testData.toolName,
            input: testData.input,
            job: jobResponse,
            message: `Test execution started for tool ${testData.toolName}`,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error(`Error executing test for server ${params.id}:`, error);
        return createApiErrorResponse(
          'TEST_002',
          `Failed to execute test for server ${params.id}`,
          500,
          { 
            serverId: params.id,
            toolName: testData.toolName,
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
  (request: NextRequest, context: any) => handleGetTestHistory(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 100, windowMs: 60 * 1000 },
  }
);

export const POST = apiHandler(
  (request: NextRequest, context: any) => handleExecuteTest(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 }, // テスト実行は制限を厳しく
  }
);