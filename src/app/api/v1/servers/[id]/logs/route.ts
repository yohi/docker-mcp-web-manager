import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../../lib/api/middleware';
import { getDockerMCPClient } from '../../../../../../lib/docker-mcp';
import { validateAndSanitizeArgs } from '../../../../../../lib/utils/command-security';

/**
 * ログ取得用のクエリスキーマ
 */
const logsQuerySchema = z.object({
  tail: z.coerce.number().min(1).max(10000).default(100),
  since: z.string().optional(),
  follow: z.coerce.boolean().default(false),
  search: z.string().max(500).optional(),
});

type LogsQuery = z.infer<typeof logsQuerySchema>;

/**
 * GET /api/v1/servers/[id]/logs - サーバーログ取得
 */
async function handleGetServerLogs(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    logsQuerySchema,
    async (req: NextRequest, query: LogsQuery) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        const dockerMCPClient = getDockerMCPClient();
        
        // followモードはServer-Sent Eventsで別途実装が必要
        if (query.follow) {
          return createApiErrorResponse(
            'LOG_001',
            'Real-time log streaming not implemented yet. Use SSE endpoint instead.',
            501,
            { 
              serverId: params.id,
              suggestion: 'Use /api/v1/servers/[id]/logs/stream for real-time logs'
            }
          );
        }
        
        const logsResponse = await dockerMCPClient.getServerLogs(sanitizedId, {
          tail: query.tail,
          since: query.since,
          follow: false,
        });
        
        // 検索フィルタリング
        let filteredEntries = logsResponse.entries;
        if (query.search) {
          const searchTerm = query.search.toLowerCase();
          filteredEntries = logsResponse.entries.filter(entry =>
            entry.message.toLowerCase().includes(searchTerm) ||
            entry.level.toLowerCase().includes(searchTerm) ||
            (entry.source && entry.source.toLowerCase().includes(searchTerm))
          );
        }
        
        return NextResponse.json({
          data: {
            serverId: sanitizedId,
            entries: filteredEntries,
            totalEntries: filteredEntries.length,
            originalTotalEntries: logsResponse.entries.length,
            query: {
              tail: query.tail,
              since: query.since,
              search: query.search,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error(`Error fetching logs for server ${params.id}:`, error);
        return createApiErrorResponse(
          'LOG_002',
          `Failed to fetch logs for server ${params.id}`,
          500,
          { 
            serverId: params.id,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(
  (request: NextRequest, context: any) => handleGetServerLogs(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 60, windowMs: 60 * 1000 }, // ログアクセスは少し制限
  }
);