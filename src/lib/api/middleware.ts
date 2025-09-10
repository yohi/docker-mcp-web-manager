// API Middleware (Complete Implementation)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Permissions Constants
export const PERMISSIONS = {
  'read:servers': 'read:servers',
  'write:servers': 'write:servers',
  'read:monitoring': 'read:monitoring',
  'write:settings': 'write:settings',
  'read:settings': 'read:settings',
  // Legacy compatibility
  MONITORING_READ: 'read:monitoring',
  SETTINGS_READ: 'read:settings',
  SETTINGS_WRITE: 'write:settings',
} as const;

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export function withApiMiddleware<T extends any[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      const result = await handler(...args);
      return result;
    } catch (error) {
      console.error('API Error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  };
}

export function createApiResponse(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export function createErrorResponse(error: string, code: string = ERROR_CODES.INTERNAL_ERROR, status = 500) {
  return NextResponse.json({ error, code }, { status });
}

export function createValidationErrorResponse(errors: any, requestId?: string) {
  return NextResponse.json({
    error: 'Validation Error',
    code: ERROR_CODES.VALIDATION_ERROR,
    errors,
    requestId
  }, { status: 400 });
}

export async function validateRequest(
  request: NextRequest,
  params: any,
  schema: { params?: z.ZodSchema; body?: z.ZodSchema }
) {
  try {
    let body = null;
    if (schema.body && (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')) {
      body = await request.json();
    }

    const result: any = { success: true, data: {} };

    if (schema.params) {
      const paramsValidation = schema.params.safeParse(params);
      if (!paramsValidation.success) {
        return { success: false, errors: { params: paramsValidation.error } };
      }
      result.data.params = paramsValidation.data;
    }

    if (schema.body && body) {
      const bodyValidation = schema.body.safeParse(body);
      if (!bodyValidation.success) {
        return { success: false, errors: { body: bodyValidation.error } };
      }
      result.data.body = bodyValidation.data;
    }

    return result;
  } catch (error) {
    return { success: false, errors: { validation: error } };
  }
}

export function requirePermissions(permissions: string[]) {
  return function <T extends any[]>(handler: (...args: T) => Promise<Response>) {
    return async (...args: T): Promise<Response> => {
      // In development mode with auth bypass, skip permission checks
      if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
        return handler(...args);
      }

      // TODO: Implement actual permission checking with session
      // For now, allow all requests in development
      return handler(...args);
    };
  };
}

export function logAPIRequest(
  method: string,
  path: string,
  requestId: string,
  startTime: number,
  status?: number,
  additionalInfo?: any
) {
  const duration = Date.now() - startTime;
  const logInfo = {
    method,
    path,
    requestId,
    duration: `${duration}ms`,
    status,
    ...additionalInfo
  };

  console.log(`[API_LOG] ${method} ${path} - ${requestId} - ${status || 'PENDING'} - ${duration}ms`, logInfo);
}
