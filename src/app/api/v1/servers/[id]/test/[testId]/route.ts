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
import { TestResultRepository, JobRepository } from '@/db/repositories';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/test/[testId] - 個別テスト結果API
// 特定のテスト実行結果の取得・管理機能
// =============================================================================

/**
 * テスト結果詳細取得
 * GET /api/v1/servers/[id]/test/[testId]
 */
async function handleGetTestResult(
  request: NextRequest,
  { params }: { params: { id: string; testId: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ 
        id: CommonSchemas.id, 
        testId: CommonSchemas.id 
      }),
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id: serverId, testId } = validation.data.params;
    
    const testResultRepository = new TestResultRepository();
    const jobRepository = new JobRepository();
    
    // テスト結果を取得（サーバーIDとテストIDの両方で検索）
    const testResult = await testResultRepository.findFirst({
      where: [
        { id: testId },
        { serverId: serverId }
      ]
    });
    
    if (!testResult) {
      return createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `Test result with ID ${testId} not found for server ${serverId}`,
        { requestId }
      );
    }
    
    // 関連するジョブ情報も取得
    let jobInfo = null;
    if (testResult.jobId) {
      try {
        jobInfo = await jobRepository.findById(testResult.jobId);
      } catch (error) {
        // ジョブが見つからない場合はログに記録するが、テスト結果は返す
        console.warn(`Job ${testResult.jobId} not found for test ${testId}`);
      }
    }
    
    // レスポンスデータの構築
    const response = {
      id: testResult.id,
      serverId: testResult.serverId,
      jobId: testResult.jobId,
      toolName: testResult.toolName,
      status: testResult.status,
      input: testResult.input,
      output: testResult.output,
      error: testResult.error,
      duration: testResult.duration,
      createdAt: testResult.createdAt.toISOString(),
      updatedAt: testResult.updatedAt.toISOString(),
      jobInfo: jobInfo ? {
        id: jobInfo.id,
        type: jobInfo.type,
        status: jobInfo.status,
        progressCurrent: jobInfo.progressCurrent,
        progressTotal: jobInfo.progressTotal,
        progressMessage: jobInfo.progressMessage,
        estimatedCompletion: jobInfo.estimatedCompletion?.toISOString(),
      } : null,
      metadata: {
        requestId,
        hasOutput: !!testResult.output,
        hasError: !!testResult.error,
        isCompleted: ['completed', 'failed', 'cancelled'].includes(testResult.status),
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Test result retrieval failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to retrieve test result',
      { requestId }
    );
  }
}

/**
 * テスト実行キャンセル
 * DELETE /api/v1/servers/[id]/test/[testId]
 */
async function handleCancelTest(
  request: NextRequest,
  { params }: { params: { id: string; testId: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ 
        id: CommonSchemas.id, 
        testId: CommonSchemas.id 
      }),
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id: serverId, testId } = validation.data.params;
    
    const testResultRepository = new TestResultRepository();
    const jobRepository = new JobRepository();
    
    // テスト結果を取得
    const testResult = await testResultRepository.findFirst({
      where: [
        { id: testId },
        { serverId: serverId }
      ]
    });
    
    if (!testResult) {
      return createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `Test result with ID ${testId} not found for server ${serverId}`,
        { requestId }
      );
    }
    
    // 実行中でない場合はキャンセル不可
    if (!['pending', 'running'].includes(testResult.status)) {
      return createErrorResponse(
        ERROR_CODES.INVALID_REQUEST,
        `Test ${testId} cannot be cancelled (current status: ${testResult.status})`,
        { requestId }
      );
    }
    
    // テスト結果とジョブの両方をキャンセル状態に更新
    const updateData = {
      status: 'cancelled' as const,
      error: 'Test cancelled by user request',
      updatedAt: new Date(),
    };
    
    await testResultRepository.update(testResult.id, updateData);
    
    // 関連するジョブもキャンセル
    if (testResult.jobId) {
      try {
        await jobRepository.update(testResult.jobId, {
          status: 'cancelled',
          progressMessage: 'Test cancelled by user',
          updatedAt: new Date(),
        });
      } catch (error) {
        console.warn(`Failed to cancel job ${testResult.jobId}:`, error);
      }
    }
    
    // レスポンスデータの構築
    const response = {
      id: testResult.id,
      serverId: testResult.serverId,
      status: 'cancelled',
      message: 'Test execution has been cancelled',
      cancelledAt: new Date().toISOString(),
      metadata: {
        requestId,
        previousStatus: testResult.status,
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Test cancellation failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to cancel test',
      { requestId }
    );
  }
}

// API handlers with security & governance requirements
export const GET = apiHandler(handleGetTestResult, {
  requireAuth: true,
  rateLimit: { maxRequests: 200, windowMs: 60 * 1000 },
  enableAuditLog: false, // GET操作は監査ログ不要
});

export const DELETE = apiHandler(handleCancelTest, {
  requireAuth: true,
  rateLimit: { maxRequests: 50, windowMs: 60 * 1000 },
  enableAuditLog: true, // キャンセル操作は監査ログが必要
});