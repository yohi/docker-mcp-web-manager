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
import { 
  ServerRepository,
  ConfigurationRepository,
  SecretRepository,
  createSecretRepository,
} from '@/db/repositories';
import { z } from 'zod';
import { NextResponse } from 'next/server';

// =============================================================================
// /api/v1/config/export - 設定エクスポートAPI
// システム設定のエクスポート機能（サーバー、設定、シークレットなど）
// =============================================================================

// エクスポートリクエストスキーマ
const ExportRequestSchema = z.object({
  include: z.object({
    servers: z.boolean().optional().default(true),
    configurations: z.boolean().optional().default(true),
    secrets: z.boolean().optional().default(false), // セキュリティ上デフォルトはfalse
    jobs: z.boolean().optional().default(false),
    testResults: z.boolean().optional().default(false),
  }).optional().default({}),
  filters: z.object({
    serverIds: z.array(z.string()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    includeInactive: z.boolean().optional().default(false),
  }).optional().default({}),
  format: z.enum(['json', 'yaml']).optional().default('json'),
  compression: z.boolean().optional().default(true),
}).optional().default({});

type ExportRequest = z.infer<typeof ExportRequestSchema>;

/**
 * 設定エクスポート
 * POST /api/v1/config/export
 */
async function handleExportConfiguration(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // リクエストのバリデーション
    const validation = await validateRequest(request, {}, {
      body: ExportRequestSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const exportRequest = validation.data.body;
    const include = exportRequest.include;
    const filters = exportRequest.filters;
    
    const serverRepository = new ServerRepository();
    const configurationRepository = new ConfigurationRepository();
    const secretRepository = createSecretRepository();
    
    const exportData: any = {
      metadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: 'system', // TODO: ユーザー情報を追加
        version: '2.0.0',
        requestId,
        format: exportRequest.format,
        filters,
        include,
      },
      data: {},
    };
    
    // サーバー情報のエクスポート
    if (include.servers) {
      const whereConditions: any[] = [];
      
      if (filters.serverIds?.length) {
        whereConditions.push({ id: { in: filters.serverIds } });
      }
      if (filters.dateFrom) {
        whereConditions.push({ createdAt: { gte: new Date(filters.dateFrom) } });
      }
      if (filters.dateTo) {
        whereConditions.push({ createdAt: { lte: new Date(filters.dateTo) } });
      }
      if (!filters.includeInactive) {
        whereConditions.push({ status: { not: 'stopped' } });
      }
      
      const servers = await serverRepository.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
      });
      
      exportData.data.servers = servers.map(server => ({
        id: server.id,
        name: server.name,
        image: server.image,
        status: server.status,
        version: server.version,
        description: server.description,
        createdAt: server.createdAt.toISOString(),
        updatedAt: server.updatedAt.toISOString(),
      }));
    }
    
    // 設定情報のエクスポート
    if (include.configurations) {
      const whereConditions: any[] = [];
      
      if (filters.serverIds?.length) {
        whereConditions.push({ serverId: { in: filters.serverIds } });
      }
      
      const configurations = await configurationRepository.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
      });
      
      exportData.data.configurations = configurations.map(config => ({
        id: config.id,
        serverId: config.serverId,
        environment: config.environment,
        enabledTools: config.enabledTools,
        resourceLimits: config.resourceLimits,
        networkConfig: config.networkConfig,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      }));
    }
    
    // シークレット情報のエクスポート（注意: 暗号化された状態で）
    if (include.secrets) {
      const whereConditions: any[] = [];
      
      if (filters.serverIds?.length) {
        whereConditions.push({ serverId: { in: filters.serverIds } });
      }
      
      const secrets = await secretRepository.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
      });
      
      exportData.data.secrets = secrets.map(secret => ({
        id: secret.id,
        serverId: secret.serverId,
        name: secret.name,
        type: secret.type,
        // 注意: 値は暗号化された状態でエクスポート
        encryptedValue: secret.encryptedValue,
        createdAt: secret.createdAt.toISOString(),
        updatedAt: secret.updatedAt.toISOString(),
      }));
      
      // セキュリティ警告を追加
      exportData.metadata.securityWarning = 'This export contains encrypted secrets. Handle with extreme care.';
    }
    
    // エクスポートデータの統計情報
    exportData.metadata.statistics = {
      totalServers: exportData.data.servers?.length || 0,
      totalConfigurations: exportData.data.configurations?.length || 0,
      totalSecrets: exportData.data.secrets?.length || 0,
    };
    
    // フォーマットに応じてレスポンスを生成
    if (exportRequest.format === 'yaml') {
      // YAMLフォーマットの場合（簡単な実装）
      const yamlContent = JSON.stringify(exportData, null, 2);
      
      return new NextResponse(yamlContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-yaml',
          'Content-Disposition': `attachment; filename="docker-mcp-config-${new Date().toISOString().split('T')[0]}.yaml"`,
          'X-Request-ID': requestId,
        },
      });
    } else {
      // JSONフォーマット（デフォルト）
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="docker-mcp-config-${new Date().toISOString().split('T')[0]}.json"`,
          'X-Request-ID': requestId,
        },
      });
    }
    
  } catch (error) {
    console.error('Configuration export failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to export configuration',
      { requestId }
    );
  }
}

// API handler with security & governance requirements
export const POST = apiHandler(handleExportConfiguration, {
  requireAuth: true,
  rateLimit: { maxRequests: 10, windowMs: 60 * 1000 }, // エクスポートは制限を厳しく
  enableAuditLog: true, // エクスポート操作は監査ログが必要
});