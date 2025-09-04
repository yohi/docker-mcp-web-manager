import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
  createPaginatedResponse,
  paginationQuerySchema,
} from '../../../../lib/api/middleware';
import { getDockerMCPClient } from '../../../../lib/docker-mcp';

/**
 * サーバー一覧取得用のクエリスキーマ
 */
const serversQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(100).optional(),
  status: z.enum(['running', 'stopped', 'error']).optional(),
});

type ServersQuery = z.infer<typeof serversQuerySchema>;

/**
 * GET /api/v1/servers - MCPサーバー一覧取得
 */
async function handleGetServers(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    serversQuerySchema,
    async (req: NextRequest, query: ServersQuery) => {
      try {
        const dockerMCPClient = getDockerMCPClient();
        
        // Docker MCPクライアントからサーバー一覧を取得
        const allServers = await dockerMCPClient.listServers();
        
        // フィルタリング
        let filteredServers = allServers;
        
        if (query.search) {
          const searchTerm = query.search.toLowerCase();
          filteredServers = filteredServers.filter(server =>
            server.name.toLowerCase().includes(searchTerm) ||
            server.image.toLowerCase().includes(searchTerm)
          );
        }
        
        if (query.status) {
          filteredServers = filteredServers.filter(server => server.status === query.status);
        }
        
        // ソート
        if (query.sort_by) {
          const sortKey = query.sort_by as keyof typeof filteredServers[0];
          filteredServers.sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
              const comparison = aVal.localeCompare(bVal);
              return query.sort_order === 'desc' ? -comparison : comparison;
            }
            
            if (aVal < bVal) return query.sort_order === 'desc' ? 1 : -1;
            if (aVal > bVal) return query.sort_order === 'desc' ? -1 : 1;
            return 0;
          });
        }
        
        // ページネーション
        const total = filteredServers.length;
        const startIndex = (query.page - 1) * query.limit;
        const endIndex = startIndex + query.limit;
        const paginatedServers = filteredServers.slice(startIndex, endIndex);
        
        const response = createPaginatedResponse(
          paginatedServers,
          total,
          query.page,
          query.limit
        );
        
        return NextResponse.json(response);
      } catch (error) {
        console.error('Error fetching servers:', error);
        return createApiErrorResponse(
          'SERVER_001',
          'Failed to fetch servers',
          500,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );
}

/**
 * POST /api/v1/servers - 新規サーバー作成（予約）
 * 実際の実装では、サーバー設定の保存やDocker MCP設定管理が必要
 */
async function handleCreateServer(request: NextRequest): Promise<NextResponse> {
  return createApiErrorResponse(
    'SERVER_002',
    'Server creation not implemented yet',
    501
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(handleGetServers, {
  requireAuth: true,
  rateLimit: { maxRequests: 100, windowMs: 60 * 1000 },
});

export const POST = apiHandler(handleCreateServer, {
  requireAuth: true,
  rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
});