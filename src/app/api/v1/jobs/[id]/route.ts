import { NextRequest, NextResponse } from 'next/server';
import {
  apiHandler,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';
import { getCatalogClient } from '../../../../../lib/docker-mcp';
import { validateAndSanitizeArgs } from '../../../../../lib/utils/command-security';

/**
 * GET /api/v1/jobs/[id] - ジョブステータス取得
 */
async function handleGetJobStatus(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
    const catalogClient = getCatalogClient();
    
    const jobStatus = await catalogClient.getJobStatus(sanitizedId);
    
    return NextResponse.json({
      data: jobStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error fetching job status ${params.id}:`, error);
    return createApiErrorResponse(
      'JOB_001',
      `Failed to fetch job status ${params.id}`,
      500,
      { 
        jobId: params.id,
        error: error instanceof Error ? error.message : String(error) 
      }
    );
  }
}

/**
 * DELETE /api/v1/jobs/[id] - ジョブキャンセル
 */
async function handleCancelJob(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
    const catalogClient = getCatalogClient();
    
    await catalogClient.cancelJob(sanitizedId);
    
    return NextResponse.json({
      data: {
        jobId: sanitizedId,
        status: 'cancelled',
        message: `Job ${sanitizedId} has been cancelled`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`Error cancelling job ${params.id}:`, error);
    return createApiErrorResponse(
      'JOB_002',
      `Failed to cancel job ${params.id}`,
      500,
      { 
        jobId: params.id,
        error: error instanceof Error ? error.message : String(error) 
      }
    );
  }
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(
  (request: NextRequest, context: any) => handleGetJobStatus(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 300, windowMs: 60 * 1000 }, // ポーリング用に高い制限
  }
);

export const DELETE = apiHandler(
  (request: NextRequest, context: any) => handleCancelJob(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 60 * 1000 },
  }
);