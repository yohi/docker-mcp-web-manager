import { NextRequest, NextResponse } from 'next/server';
import { apiHandler } from '../../../lib/api/middleware';

/**
 * GET /api/v1 - API情報とエンドポイント一覧
 */
async function handleApiInfo(request: NextRequest): Promise<NextResponse> {
  const apiInfo = {
    name: 'Docker MCP Web Manager API',
    version: 'v1',
    description: 'RESTful API for managing Docker MCP servers and configurations',
    timestamp: new Date().toISOString(),
    endpoints: {
      servers: {
        description: 'MCP server management',
        endpoints: [
          'GET /api/v1/servers - List all servers',
          'GET /api/v1/servers/{id} - Get server details',
          'POST /api/v1/servers/{id} - Execute server actions',
          'GET /api/v1/servers/{id}/logs - Get server logs',
          'GET /api/v1/servers/{id}/test - Get test history',
          'POST /api/v1/servers/{id}/test - Execute server tests',
        ],
      },
      catalog: {
        description: 'MCP server catalog browsing and installation',
        endpoints: [
          'GET /api/v1/catalog - Browse server catalog',
          'GET /api/v1/catalog/{id} - Get catalog item details',
          'POST /api/v1/catalog/{id} - Install server from catalog',
          'GET /api/v1/catalog/popular - Get popular servers',
        ],
      },
      jobs: {
        description: 'Asynchronous job management',
        endpoints: [
          'GET /api/v1/jobs/{id} - Get job status',
          'DELETE /api/v1/jobs/{id} - Cancel job',
        ],
      },
      config: {
        description: 'Configuration management',
        endpoints: [
          'GET /api/v1/config/export - Export configuration',
          'POST /api/v1/config/import - Import configuration',
        ],
      },
      secrets: {
        description: 'Secrets management with Bitwarden integration',
        endpoints: [
          'GET /api/v1/secrets/bitwarden - Get Bitwarden status',
          'POST /api/v1/secrets/bitwarden - Unlock Bitwarden vault',
          'GET /api/v1/secrets/bitwarden/items - List Bitwarden items',
          'GET /api/v1/secrets/bitwarden/items/{id}/value - Get item value',
        ],
      },
    },
    authentication: {
      type: 'JWT-based authentication via NextAuth.js',
      providers: ['credentials', 'bitwarden'],
      authEndpoint: '/api/auth/signin',
    },
    rateLimit: {
      default: '100 requests per minute',
      admin: 'Higher limits for admin users',
      note: 'Rate limiting headers included in responses',
    },
    errorCodes: {
      format: 'Structured error responses with timestamps',
      categories: [
        'AUTH_* - Authentication errors',
        'SERVER_* - Server management errors', 
        'CATALOG_* - Catalog operation errors',
        'CONFIG_* - Configuration management errors',
        'SECRET_* - Secrets management errors',
        'JOB_* - Job management errors',
        'LOG_* - Logging errors',
        'TEST_* - Testing errors',
      ],
    },
    security: {
      headers: ['X-Content-Type-Options', 'X-Frame-Options', 'X-XSS-Protection'],
      validation: 'Zod schema validation for all inputs',
      sanitization: 'Input sanitization and command injection prevention',
      rateLimiting: 'Per-IP and per-user rate limiting',
    },
  };

  return NextResponse.json(apiInfo);
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(handleApiInfo, {
  requireAuth: false, // API情報は認証不要
  rateLimit: { maxRequests: 200, windowMs: 60 * 1000 },
});