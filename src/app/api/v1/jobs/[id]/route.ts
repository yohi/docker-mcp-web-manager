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
  CommonSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { JobRepository } from '@/db/repositories/job-repository';
import { DockerMCPClient } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/jobs/[id] - 個別ジョブ管理API
// 特定のジョブの詳細情報と操作
// =============================================================================

/**
 * ジョブ詳細取得
 * GET /api/v1/jobs/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.JOBS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/jobs/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid job ID format',
        { requestId }
      );
    }

    const jobId = paramsValidation.data.params.id;

    // ジョブリポジトリからジョブを取得
    const jobRepository = new JobRepository();
    let job;

    try {
      job = await jobRepository.findById(jobId);
    } catch (error) {
      console.error(`[JOB_ERROR] Failed to fetch job ${jobId}:`, error);
      
      logAPIRequest('GET', `/api/v1/jobs/${jobId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.JOB_001,
        'Failed to retrieve job details',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    if (!job) {
      logAPIRequest('GET', `/api/v1/jobs/${jobId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Job not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.JOB_002,
        `Job with ID '${jobId}' not found`,
        { requestId }
      );
    }

    // 実行中のジョブの場合、リアルタイムステータスを取得
    if (job.status === 'running' || job.status === 'pending') {
      const dockerClient = new DockerMCPClient();
      
      try {
        const liveStatus = await dockerClient.getJobStatus(jobId);
        if (liveStatus) {
          // データベースの状態と Docker MCP の状態を同期
          if (liveStatus.status !== job.status) {
            await jobRepository.update(jobId, {
              status: liveStatus.status,
              progress: liveStatus.progress,
              error: liveStatus.error,
            });
            
            // 更新されたジョブ情報を再取得
            job = await jobRepository.findById(jobId);
          }
        }
      } catch (error) {
        console.warn(`[JOB_SYNC_WARNING] Failed to sync job status for ${jobId}:`, error);
        // ライブステータス取得の失敗は警告として扱い、処理を続行
      }
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/jobs/${jobId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return createSuccessResponse(job, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/jobs/[id]:', error);
    
    logAPIRequest('GET', `/api/v1/jobs/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve job details',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * ジョブキャンセル
 * DELETE /api/v1/jobs/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.JOBS_CANCEL], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('DELETE', `/api/v1/jobs/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid job ID format',
        { requestId }
      );
    }

    const jobId = paramsValidation.data.params.id;

    // ジョブの存在確認
    const jobRepository = new JobRepository();
    const job = await jobRepository.findById(jobId);

    if (!job) {
      logAPIRequest('DELETE', `/api/v1/jobs/${jobId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Job not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.JOB_002,
        `Job with ID '${jobId}' not found`,
        { requestId }
      );
    }

    // 既に完了・失敗・キャンセル済みのジョブはキャンセル不可
    if (!['running', 'pending'].includes(job.status)) {
      logAPIRequest('DELETE', `/api/v1/jobs/${jobId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Job cannot be cancelled',
      });
      
      return createErrorResponse(
        ERROR_CODES.JOB_003,
        `Cannot cancel job in '${job.status}' status`,
        { requestId }
      );
    }

    // Docker MCPでジョブをキャンセル
    const dockerClient = new DockerMCPClient();
    let cancelResult;

    try {
      cancelResult = await dockerClient.cancelJob(jobId);
    } catch (error) {
      console.error(`[JOB_CANCEL_ERROR] Failed to cancel job ${jobId}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const jobError = error as any;
        
        if (jobError.code === 'JOB_NOT_FOUND') {
          // Docker MCP側でジョブが見つからない場合、DBの状態を更新
          await jobRepository.update(jobId, {
            status: 'failed',
            error: {
              code: 'JOB_NOT_FOUND',
              message: 'Job not found in execution environment',
            },
          });
          
          logAPIRequest('DELETE', `/api/v1/jobs/${jobId}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Job not found in execution environment',
          });
          
          return createErrorResponse(
            ERROR_CODES.JOB_004,
            'Job not found in execution environment',
            { requestId }
          );
        }
        
        if (jobError.code === 'JOB_NOT_CANCELLABLE') {
          logAPIRequest('DELETE', `/api/v1/jobs/${jobId}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 409,
            error: 'Job cannot be cancelled at this stage',
          });
          
          return createErrorResponse(
            ERROR_CODES.JOB_005,
            'Job cannot be cancelled at this stage',
            { requestId }
          );
        }
      }
      
      logAPIRequest('DELETE', `/api/v1/jobs/${jobId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Job cancellation failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.JOB_001,
        `Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    // データベースの状態を更新
    const updatedJob = await jobRepository.update(jobId, {
      status: 'cancelled',
      progress: {
        current: job.progress?.current || 0,
        total: job.progress?.total || 100,
        message: 'Job cancelled by user',
      },
    });

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('DELETE', `/api/v1/jobs/${jobId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        jobType: job.type,
        previousStatus: job.status,
      },
    });

    const responseData = {
      jobId,
      status: 'cancelled',
      message: 'Job cancelled successfully',
      cancelledAt: new Date().toISOString(),
      originalType: job.type,
      progress: updatedJob.progress,
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] DELETE /api/v1/jobs/[id]:', error);
    
    logAPIRequest('DELETE', `/api/v1/jobs/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to cancel job',
      { requestId, details: errorMessage }
    );
  }
}