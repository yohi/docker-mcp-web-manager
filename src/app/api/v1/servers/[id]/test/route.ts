import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  ERROR_CODES,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
} from '@/lib/api/validation';
import { apiHandler } from '@/lib/api/middleware';
import { DockerMCPClient } from '@/lib/docker-mcp/docker-mcp-client';
import { TestResultRepository } from '@/db/repositories';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/test - サーバーツールテストAPI
// MCPサーバーのツールテスト実行とテスト履歴取得機能
// =============================================================================

// テスト実行リクエストスキーマ
const TestExecutionRequestSchema = z.object({
  toolName: z.string().min(1, 'Tool name is required'),
  input: z.record(z.any()).optional().default({}),
  timeout: z.number().min(1000).max(300000).optional().default(60000), // 1秒-5分
  description: z.string().optional(),
});

// テスト履歴クエリスキーマ
const TestHistoryQuerySchema = z.object({
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
  sort_by: z.enum(['created_at', 'duration', 'status', 'tool_name']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  tool_name: z.string().optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
});

type TestExecutionRequest = z.infer<typeof TestExecutionRequestSchema>;
type TestHistoryQuery = z.infer<typeof TestHistoryQuerySchema>;

/**
 * テスト履歴取得
 * GET /api/v1/servers/[id]/test
 */
async function handleGetTestHistory(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータとクエリパラメータのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      query: TestHistoryQuerySchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id: serverId } = validation.data.params;
    const query = validation.data.query;
    
    const testResultRepository = new TestResultRepository();
    
    // テスト履歴を取得
    const offset = (query.page - 1) * query.limit;
    const whereConditions: any[] = [{ serverId }];
    
    // フィルター条件の追加
    if (query.status) {
      whereConditions.push({ status: query.status });
    }
    if (query.tool_name) {
      whereConditions.push({ toolName: { like: `%${query.tool_name}%` } });
    }
    if (query.from_date) {
      whereConditions.push({ createdAt: { gte: new Date(query.from_date) } });
    }
    if (query.to_date) {
      whereConditions.push({ createdAt: { lte: new Date(query.to_date) } });
    }
    
    const [testResults, total] = await Promise.all([
      testResultRepository.findMany({
        where: whereConditions,
        orderBy: { [query.sort_by]: query.sort_order },
        limit: query.limit,
        offset,
      }),
      testResultRepository.count({ where: whereConditions }),
    ]);
    
    // レスポンスデータの構築
    const response = {
      data: testResults.map(result => ({
        id: result.id,
        serverId: result.serverId,
        toolName: result.toolName,
        status: result.status,
        input: result.input,
        output: result.output,
        error: result.error,
        duration: result.duration,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasNext: offset + query.limit < total,
        hasPrev: query.page > 1,
      },
      metadata: {
        requestId,
        serverId,
        filters: {
          status: query.status,
          tool_name: query.tool_name,
          from_date: query.from_date,
          to_date: query.to_date,
        },
        sort: {
          sort_by: query.sort_by,
          sort_order: query.sort_order,
        },
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Test history retrieval failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to retrieve test history',
      { requestId }
    );
  }
}

/**
 * ツールテスト実行
 * POST /api/v1/servers/[id]/test
 */
async function handleExecuteTest(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      body: TestExecutionRequestSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id: serverId } = validation.data.params;
    const testRequest = validation.data.body;
    
    const dockerMCPClient = new DockerMCPClient();
    
    // サーバーの存在確認
    try {
      await dockerMCPClient.getServerDetails(serverId);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'RESOURCE_NOT_FOUND') {
        return createErrorResponse(
          ERROR_CODES.RESOURCE_NOT_FOUND,
          `Server with ID ${serverId} not found`,
          { requestId }
        );
      }
      throw error;
    }
    
    // テスト実行（非同期ジョブとして実行）
    const jobResponse = await dockerMCPClient.testServerTool(
      serverId,
      testRequest.toolName,
      testRequest.input
    );
    
    // レスポンスデータの構築
    const response = {
      jobId: jobResponse.id,
      serverId,
      toolName: testRequest.toolName,
      status: jobResponse.status,
      message: jobResponse.message || `Test execution started for tool: ${testRequest.toolName}`,
      estimatedDuration: jobResponse.estimatedDuration,
      input: testRequest.input,
      metadata: {
        requestId,
        timeout: testRequest.timeout,
        description: testRequest.description,
        createdAt: new Date().toISOString(),
      },
    };
    
    return createSuccessResponse(response, { 
      requestId,
      statusCode: 202 // Accepted - 非同期処理開始
    });
    
  } catch (error) {
    console.error('Test execution failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to execute test',
      { requestId }
    );
  }
}

// API handlers with security & governance requirements
export const GET = apiHandler(handleGetTestHistory, {
  requireAuth: true,
  rateLimit: { maxRequests: 100, windowMs: 60 * 1000 },
  enableAuditLog: false, // GET操作は監査ログ不要
});

export const POST = apiHandler(handleExecuteTest, {
  requireAuth: true,
  rateLimit: { maxRequests: 50, windowMs: 60 * 1000 }, // テスト実行は制限を厳しく
  enableAuditLog: true, // テスト実行は監査ログが必要
});