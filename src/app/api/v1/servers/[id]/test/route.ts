import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  TestSchemas,
  CommonSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ServerRepository } from '@/db/repositories/server-repository';
import { TestResultRepository } from '@/db/repositories/test-result-repository';
import { DockerMCPClient } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/test - サーバーツールテストAPI
// MCPサーバーのツール実行とテスト機能
// =============================================================================

/**
 * ツールテスト実行
 * POST /api/v1/servers/[id]/test
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.TOOLS_TEST], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', `/api/v1/servers/${params.id}/test`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      body: TestSchemas.executeTest,
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data!.params.id;
    const testData = validation.data!.body;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('POST', `/api/v1/servers/${serverId}/test`, requestId, {
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

    // サーバーが実行中でない場合は拒否
    if (server.status !== 'running') {
      logAPIRequest('POST', `/api/v1/servers/${serverId}/test`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Server not running',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_005,
        'Cannot test tools on stopped server. Start the server first.',
        { requestId }
      );
    }

    // Docker MCPでツールテスト実行
    const dockerClient = new DockerMCPClient();
    let testResult;
    const testStartTime = Date.now();

    try {
      const jobResponse = await dockerClient.testServerTool(
        serverId,
        testData.toolName,
        testData.input || {}
      );

      // テスト結果の記録用データを準備
      testResult = {
        success: jobResponse.status === 'completed',
        output: jobResponse,
        executionTime: Date.now() - testStartTime,
        error: jobResponse.status === 'failed' ? jobResponse.message : undefined,
      };

    } catch (error) {
      console.error(`[TOOL_TEST_ERROR] Failed to execute tool ${testData.toolName} on server ${serverId}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const commandError = error as any;
        
        if (commandError.code === 'RESOURCE_NOT_FOUND') {
          logAPIRequest('POST', `/api/v1/servers/${serverId}/test`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Tool not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.TEST_001,
            `Tool '${testData.toolName}' not found on server '${serverId}'`,
            { requestId }
          );
        }
        
        if (commandError.code === 'COMMAND_TIMEOUT') {
          logAPIRequest('POST', `/api/v1/servers/${serverId}/test`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 408,
            error: 'Tool execution timed out',
          });
          
          return createErrorResponse(
            ERROR_CODES.TEST_003,
            `Tool execution timed out: ${testData.toolName}`,
            { requestId }
          );
        }
      }
      
      testResult = {
        success: false,
        output: null,
        executionTime: Date.now() - testStartTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // テスト結果をデータベースに記録
    const testResultRepository = new TestResultRepository();
    const savedTestResult = await testResultRepository.create({
      serverId,
      toolName: testData.toolName,
      input: testData.input || {},
      output: testResult.output,
      success: testResult.success,
      error: testResult.error,
      executionTime: testResult.executionTime,
    });

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('POST', `/api/v1/servers/${serverId}/test`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: testResult.success ? 200 : 500,
      error: testResult.error,
    });

    // テストが失敗した場合は500エラーとして返す
    if (!testResult.success) {
      return createErrorResponse(
        ERROR_CODES.TEST_002,
        `Tool execution failed: ${testResult.error}`,
        { 
          requestId, 
          details: {
            testResultId: savedTestResult.id,
            toolName: testData.toolName,
            executionTime: testResult.executionTime,
          }
        }
      );
    }

    const responseData = {
      testResultId: savedTestResult.id,
      success: testResult.success,
      output: testResult.output,
      executionTime: testResult.executionTime,
      toolName: testData.toolName,
      serverId,
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/servers/[id]/test:', error);
    
    logAPIRequest('POST', `/api/v1/servers/${params.id}/test`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to execute tool test',
      { requestId, details: errorMessage }
    );
  }
}