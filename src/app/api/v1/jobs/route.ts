import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  ERROR_CODES,
  processPagination,
  processSorting,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
  JobSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { JobRepository } from '@/db/repositories/job-repository';

// =============================================================================
// /api/v1/jobs - ジョブ管理API
// システム内のジョブ（タスク）管理機能
// =============================================================================

/**
 * ジョブ一覧取得
 * GET /api/v1/jobs
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.JOBS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/jobs', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const querySchema = CommonSchemas.pagination
      .merge(CommonSchemas.sorting)
      .merge(JobSchemas.jobQuery);

    const validation = await validateRequest(request, undefined, { query: querySchema });
    if (!validation.success || !validation.data?.query) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid query parameters',
        { requestId }
      );
    }

    const { page, limit } = processPagination(request.nextUrl.searchParams);
    const { sortBy, sortOrder } = processSorting(
      request.nextUrl.searchParams,
      ['createdAt', 'updatedAt', 'type', 'status'],
      { sortBy: 'createdAt', sortOrder: 'desc' }
    );

    const queryParams = validation.data.query;

    // ジョブリポジトリからジョブを取得
    const jobRepository = new JobRepository();
    let jobResult;

    try {
      const filters = {
        type: queryParams.type,
        status: queryParams.status,
        serverId: queryParams.serverId,
        createdAfter: queryParams.createdAfter,
        createdBefore: queryParams.createdBefore,
      };

      jobResult = await jobRepository.findWithFilters(filters, {
        page,
        limit,
        sortBy,
        sortOrder,
      });
    } catch (error) {
      console.error('[JOB_ERROR] Failed to fetch jobs:', error);
      
      logAPIRequest('GET', '/api/v1/jobs', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.JOB_001,
        'Failed to retrieve jobs',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/jobs', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return createSuccessResponse(jobResult.jobs, {
      pagination: {
        page,
        limit,
        total: jobResult.total,
        totalPages: Math.ceil(jobResult.total / limit),
        hasNext: page * limit < jobResult.total,
        hasPrev: page > 1,
      },
      requestId,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/jobs:', error);
    
    logAPIRequest('GET', '/api/v1/jobs', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve jobs',
      { requestId, details: errorMessage }
    );
  }
}