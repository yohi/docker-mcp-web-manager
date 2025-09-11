import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  ERROR_CODES,
} from '@/lib/api/response';
import {
  validateRequest,
} from '@/lib/api/validation';
import { apiHandler } from '@/lib/api/middleware';
import { 
  ServerRepository,
  ConfigurationRepository,
  SecretRepository,
  createSecretRepository,
  JobRepository,
} from '@/db/repositories';
import { z } from 'zod';

// =============================================================================
// /api/v1/config/import - 設定インポートAPI
// システム設定のインポート機能（サーバー、設定、シークレットなど）
// =============================================================================

// インポートリクエストスキーマ
const ImportRequestSchema = z.object({
  data: z.any(), // インポートデータは動的に検証
  options: z.object({
    overwriteExisting: z.boolean().optional().default(false),
    validateOnly: z.boolean().optional().default(false), // 検証のみでインポートしない
    skipSecrets: z.boolean().optional().default(true), // セキュリティ上デフォルトはtrue
    mergeMode: z.enum(['replace', 'merge', 'skip']).optional().default('skip'),
  }).optional().default({}),
});

// エクスポートデータ検証スキーマ
const ExportDataSchema = z.object({
  metadata: z.object({
    exportedAt: z.string().datetime(),
    version: z.string(),
    format: z.string().optional().default('json'),
  }),
  data: z.object({
    servers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      image: z.string(),
      status: z.string(),
      version: z.string().optional(),
      description: z.string().optional(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })).optional(),
    configurations: z.array(z.object({
      id: z.string(),
      serverId: z.string(),
      environment: z.record(z.any()).optional(),
      enabledTools: z.array(z.string()).optional(),
      resourceLimits: z.record(z.any()).optional(),
      networkConfig: z.record(z.any()).optional(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })).optional(),
    secrets: z.array(z.object({
      id: z.string(),
      serverId: z.string(),
      name: z.string(),
      type: z.string(),
      encryptedValue: z.string(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    })).optional(),
  }),
});

type ImportRequest = z.infer<typeof ImportRequestSchema>;
type ExportData = z.infer<typeof ExportDataSchema>;

/**
 * 設定インポート
 * POST /api/v1/config/import
 */
async function handleImportConfiguration(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // リクエストのバリデーション
    const validation = await validateRequest(request, {}, {
      body: ImportRequestSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const importRequest = validation.data.body;
    const options = importRequest.options;
    
    // エクスポートデータの検証
    const dataValidation = ExportDataSchema.safeParse(importRequest.data);
    if (!dataValidation.success) {
      return createValidationErrorResponse(
        'Invalid export data format', 
        { requestId, details: dataValidation.error.issues }
      );
    }
    
    const exportData = dataValidation.data;
    const importResults = {
      servers: { imported: 0, skipped: 0, errors: 0 },
      configurations: { imported: 0, skipped: 0, errors: 0 },
      secrets: { imported: 0, skipped: 0, errors: 0 },
      errors: [] as string[],
    };
    
    // 検証のみモードの場合
    if (options.validateOnly) {
      return createSuccessResponse({
        valid: true,
        statistics: {
          totalServers: exportData.data.servers?.length || 0,
          totalConfigurations: exportData.data.configurations?.length || 0,
          totalSecrets: exportData.data.secrets?.length || 0,
        },
        metadata: exportData.metadata,
        message: 'Configuration data is valid and ready for import',
      }, { requestId });
    }
    
    const serverRepository = new ServerRepository();
    const configurationRepository = new ConfigurationRepository();
    const secretRepository = createSecretRepository();
    const jobRepository = new JobRepository();
    
    // サーバー情報のインポート
    if (exportData.data.servers) {
      for (const serverData of exportData.data.servers) {
        try {
          const existingServer = await serverRepository.findById(serverData.id).catch(() => null);
          
          if (existingServer) {
            if (options.mergeMode === 'skip') {
              importResults.servers.skipped++;
              continue;
            } else if (options.mergeMode === 'replace' || options.overwriteExisting) {
              await serverRepository.update(serverData.id, {
                name: serverData.name,
                image: serverData.image,
                status: serverData.status,
                version: serverData.version || '',
                description: serverData.description || '',
                updatedAt: new Date(),
              });
              importResults.servers.imported++;
            } else {
              // mergeMode === 'merge' の場合
              const updateData: any = {};
              if (serverData.name !== existingServer.name) updateData.name = serverData.name;
              if (serverData.image !== existingServer.image) updateData.image = serverData.image;
              if (serverData.description !== existingServer.description) updateData.description = serverData.description;
              
              if (Object.keys(updateData).length > 0) {
                updateData.updatedAt = new Date();
                await serverRepository.update(serverData.id, updateData);
                importResults.servers.imported++;
              } else {
                importResults.servers.skipped++;
              }
            }
          } else {
            // 新規作成
            await serverRepository.create({
              id: serverData.id,
              name: serverData.name,
              image: serverData.image,
              status: serverData.status,
              version: serverData.version || '',
              description: serverData.description || '',
              tools: [],
              resources: [],
              prompts: [],
            });
            importResults.servers.imported++;
          }
        } catch (error) {
          importResults.servers.errors++;
          importResults.errors.push(`Server ${serverData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    // 設定情報のインポート
    if (exportData.data.configurations) {
      for (const configData of exportData.data.configurations) {
        try {
          const existingConfig = await configurationRepository.findFirst({
            where: [{ id: configData.id }]
          }).catch(() => null);
          
          if (existingConfig) {
            if (options.mergeMode === 'skip') {
              importResults.configurations.skipped++;
              continue;
            } else if (options.mergeMode === 'replace' || options.overwriteExisting) {
              await configurationRepository.update(configData.id, {
                environment: configData.environment || {},
                enabledTools: configData.enabledTools || [],
                resourceLimits: configData.resourceLimits || {},
                networkConfig: configData.networkConfig || { mode: 'bridge', ports: [] },
                updatedAt: new Date(),
              });
              importResults.configurations.imported++;
            } else {
              // merge mode
              const updateData: any = {
                environment: { ...existingConfig.environment, ...configData.environment },
                enabledTools: [...new Set([...existingConfig.enabledTools, ...(configData.enabledTools || [])])],
                resourceLimits: { ...existingConfig.resourceLimits, ...configData.resourceLimits },
                networkConfig: { ...existingConfig.networkConfig, ...configData.networkConfig },
                updatedAt: new Date(),
              };
              
              await configurationRepository.update(configData.id, updateData);
              importResults.configurations.imported++;
            }
          } else {
            // 新規作成
            await configurationRepository.create({
              id: configData.id,
              serverId: configData.serverId,
              environment: configData.environment || {},
              enabledTools: configData.enabledTools || [],
              secrets: [],
              resourceLimits: configData.resourceLimits || {},
              networkConfig: configData.networkConfig || { mode: 'bridge', ports: [] },
            });
            importResults.configurations.imported++;
          }
        } catch (error) {
          importResults.configurations.errors++;
          importResults.errors.push(`Configuration ${configData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    // シークレット情報のインポート（オプション）
    if (exportData.data.secrets && !options.skipSecrets) {
      for (const secretData of exportData.data.secrets) {
        try {
          const existingSecret = await secretRepository.findById(secretData.id).catch(() => null);
          
          if (existingSecret && !options.overwriteExisting) {
            importResults.secrets.skipped++;
            continue;
          }
          
          if (existingSecret) {
            await secretRepository.update(secretData.id, {
              name: secretData.name,
              type: secretData.type,
              encryptedValue: secretData.encryptedValue,
              updatedAt: new Date(),
            });
          } else {
            await secretRepository.create({
              id: secretData.id,
              serverId: secretData.serverId,
              name: secretData.name,
              type: secretData.type,
              encryptedValue: secretData.encryptedValue,
            });
          }
          importResults.secrets.imported++;
        } catch (error) {
          importResults.secrets.errors++;
          importResults.errors.push(`Secret ${secretData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    // インポート結果のレスポンス
    const response = {
      success: true,
      importResults,
      summary: {
        totalImported: importResults.servers.imported + importResults.configurations.imported + importResults.secrets.imported,
        totalSkipped: importResults.servers.skipped + importResults.configurations.skipped + importResults.secrets.skipped,
        totalErrors: importResults.servers.errors + importResults.configurations.errors + importResults.secrets.errors,
      },
      metadata: {
        requestId,
        importedAt: new Date().toISOString(),
        sourceMetadata: exportData.metadata,
        options,
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Configuration import failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to import configuration',
      { requestId }
    );
  }
}

// API handler with security & governance requirements
export const POST = apiHandler(handleImportConfiguration, {
  requireAuth: true,
  rateLimit: { maxRequests: 5, windowMs: 60 * 1000 }, // インポートは制限を非常に厳しく
  enableAuditLog: true, // インポート操作は監査ログが必要
});