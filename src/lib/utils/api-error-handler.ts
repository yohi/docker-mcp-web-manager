import { NextResponse } from 'next/server';

// =============================================================================
// API Error Handler
// 構造化されたAPIエラーレスポンスを生成
// =============================================================================

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
  timestamp?: string;
}

/**
 * 構造化されたエラーレスポンスを作成
 */
export function createErrorResponse(
  code: string,
  message: string,
  status: number = 500,
  details?: any
): NextResponse<ApiErrorResponse> {
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(errorResponse, { status });
}

/**
 * 成功レスポンスを作成
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse {
  const response = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response, { status });
}

/**
 * Errorオブジェクトから構造化されたエラーレスポンスを作成
 */
export function createErrorFromException(
  error: Error,
  code: string = 'INTERNAL_ERROR',
  status: number = 500
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(
    code,
    error.message,
    status,
    process.env.NODE_ENV === 'development' ? error.stack : undefined
  );
}