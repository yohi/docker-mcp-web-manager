import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSuccessResponse,
  createErrorResponse,
  createValidationErrorResponse,
  createHealthCheckResponse,
  processPagination,
  processSorting,
  processFilters,
  ERROR_CODES,
  addCacheHeaders,
} from '../api/response';

// NextResponse のモック
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      data,
      status: init?.status || 200,
      headers: new Map(),
    })),
  },
}));

describe('API Response Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSuccessResponse', () => {
    it('should create a success response with data', () => {
      const testData = { id: 1, name: 'test' };
      const response = createSuccessResponse(testData);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: testData,
          meta: expect.objectContaining({
            version: 'v1',
            requestId: expect.any(String),
            timestamp: expect.any(String),
          }),
        }),
        { status: 200 }
      );
    });

    it('should include pagination when provided', () => {
      const testData = [{ id: 1 }, { id: 2 }];
      const pagination = { page: 1, limit: 20, total: 50 };
      
      createSuccessResponse(testData, { pagination });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: testData,
          pagination: expect.objectContaining({
            page: 1,
            limit: 20,
            total: 50,
            totalPages: 3,
            hasNext: true,
            hasPrev: false,
          }),
        }),
        { status: 200 }
      );
    });

    it('should include duration when provided', () => {
      const testData = { test: true };
      const duration = 150;
      
      createSuccessResponse(testData, { duration });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            duration: 150,
          }),
        }),
        { status: 200 }
      );
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response with default message', () => {
      createErrorResponse(ERROR_CODES.NOT_FOUND);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ERROR_CODES.NOT_FOUND,
            message: 'Resource not found',
            requestId: expect.any(String),
            timestamp: expect.any(String),
          }),
        }),
        { status: 404 }
      );
    });

    it('should create an error response with custom message', () => {
      const customMessage = 'Custom error message';
      createErrorResponse(ERROR_CODES.VALIDATION_ERROR, customMessage);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: customMessage,
          }),
        }),
        { status: 400 }
      );
    });

    it('should include details when provided', () => {
      const details = { field: 'email', reason: 'invalid format' };
      createErrorResponse(ERROR_CODES.VALIDATION_ERROR, undefined, { details });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: details,
          }),
        }),
        { status: 400 }
      );
    });

    it('should use custom status code when provided', () => {
      createErrorResponse(ERROR_CODES.INTERNAL_ERROR, undefined, { statusCode: 503 });

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.anything(),
        { status: 503 }
      );
    });
  });

  describe('createValidationErrorResponse', () => {
    it('should handle Zod validation errors', () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      });

      try {
        schema.parse({ name: '', email: 'invalid-email' });
      } catch (error) {
        if (error instanceof z.ZodError) {
          createValidationErrorResponse(error);

          expect(NextResponse.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: false,
              error: expect.objectContaining({
                code: ERROR_CODES.VALIDATION_ERROR,
                message: 'Request validation failed',
                details: expect.objectContaining({
                  issues: expect.arrayContaining([
                    expect.objectContaining({
                      field: expect.any(String),
                      message: expect.any(String),
                      code: expect.any(String),
                    }),
                  ]),
                }),
              }),
            }),
            { status: 400 }
          );
        }
      }
    });
  });

  describe('createHealthCheckResponse', () => {
    it('should create a healthy response', () => {
      const healthData = {
        status: 'healthy' as const,
        version: '2.0.0',
        uptime: 3600,
        components: {
          database: { status: 'healthy' },
          cache: { status: 'healthy' },
        },
      };

      createHealthCheckResponse(healthData);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          timestamp: expect.any(String),
          version: '2.0.0',
          uptime: 3600,
          components: healthData.components,
        }),
        { status: 200 }
      );
    });

    it('should create an unhealthy response with 503 status', () => {
      const healthData = { status: 'unhealthy' as const };

      createHealthCheckResponse(healthData);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.anything(),
        { status: 503 }
      );
    });

    it('should create a degraded response with 200 status', () => {
      const healthData = { status: 'degraded' as const };

      createHealthCheckResponse(healthData);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.anything(),
        { status: 200 }
      );
    });
  });

  describe('processPagination', () => {
    it('should process pagination parameters with defaults', () => {
      const query = new URLSearchParams();
      const result = processPagination(query);

      expect(result).toEqual({
        page: 1,
        limit: 20,
        offset: 0,
      });
    });

    it('should process custom pagination parameters', () => {
      const query = new URLSearchParams('page=3&limit=10');
      const result = processPagination(query);

      expect(result).toEqual({
        page: 3,
        limit: 10,
        offset: 20,
      });
    });

    it('should enforce maximum limit', () => {
      const query = new URLSearchParams('limit=200');
      const result = processPagination(query, { page: 1, limit: 20, maxLimit: 100 });

      expect(result).toEqual({
        page: 1,
        limit: 100,
        offset: 0,
      });
    });

    it('should handle invalid parameters gracefully', () => {
      const query = new URLSearchParams('page=-1&limit=abc');
      const result = processPagination(query);

      expect(result).toEqual({
        page: 1,
        limit: 20,
        offset: 0,
      });
    });
  });

  describe('processSorting', () => {
    const allowedFields = ['name', 'createdAt', 'updatedAt'];

    it('should process sorting parameters with defaults', () => {
      const query = new URLSearchParams();
      const result = processSorting(query, allowedFields);

      expect(result).toEqual({
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });

    it('should process custom sorting parameters', () => {
      const query = new URLSearchParams('sort_by=name&sort_order=asc');
      const result = processSorting(query, allowedFields);

      expect(result).toEqual({
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });

    it('should reject invalid sort fields', () => {
      const query = new URLSearchParams('sort_by=malicious_field');
      const result = processSorting(query, allowedFields);

      expect(result).toEqual({
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });

    it('should reject invalid sort order', () => {
      const query = new URLSearchParams('sort_order=invalid');
      const result = processSorting(query, allowedFields);

      expect(result).toEqual({
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });
  });

  describe('processFilters', () => {
    const allowedFilters = ['status', 'name', 'category'];

    it('should process valid filters', () => {
      const query = new URLSearchParams('status=active&name=test&category=server');
      const result = processFilters(query, allowedFilters);

      expect(result).toEqual({
        status: 'active',
        name: 'test',
        category: 'server',
      });
    });

    it('should ignore empty filters', () => {
      const query = new URLSearchParams('status=&name=test&category= ');
      const result = processFilters(query, allowedFilters);

      expect(result).toEqual({
        name: 'test',
      });
    });

    it('should ignore non-allowed filters', () => {
      const query = new URLSearchParams('status=active&malicious=value');
      const result = processFilters(query, allowedFilters);

      expect(result).toEqual({
        status: 'active',
      });
    });

    it('should trim whitespace from filter values', () => {
      const query = new URLSearchParams('status= active &name=  test  ');
      const result = processFilters(query, allowedFilters);

      expect(result).toEqual({
        status: 'active',
        name: 'test',
      });
    });
  });

  describe('addCacheHeaders', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        headers: {
          set: jest.fn(),
        },
      };
    });

    it('should set no-cache headers when noCache is true', () => {
      addCacheHeaders(mockResponse, { noCache: true });

      expect(mockResponse.headers.set).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(mockResponse.headers.set).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockResponse.headers.set).toHaveBeenCalledWith('Expires', '0');
    });

    it('should set cache headers with maxAge', () => {
      addCacheHeaders(mockResponse, { maxAge: 3600 });

      expect(mockResponse.headers.set).toHaveBeenCalledWith('Cache-Control', 'max-age=3600');
    });

    it('should set cache headers with stale-while-revalidate', () => {
      addCacheHeaders(mockResponse, { maxAge: 3600, staleWhileRevalidate: 86400 });

      expect(mockResponse.headers.set).toHaveBeenCalledWith(
        'Cache-Control', 
        'max-age=3600, stale-while-revalidate=86400'
      );
    });

    it('should set cache headers with must-revalidate', () => {
      addCacheHeaders(mockResponse, { maxAge: 3600, mustRevalidate: true });

      expect(mockResponse.headers.set).toHaveBeenCalledWith(
        'Cache-Control', 
        'max-age=3600, must-revalidate'
      );
    });

    it('should not set cache headers when no options provided', () => {
      addCacheHeaders(mockResponse, {});

      expect(mockResponse.headers.set).not.toHaveBeenCalled();
    });
  });
});