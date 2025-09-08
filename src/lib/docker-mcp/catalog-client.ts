import { z } from 'zod';
import {
  executeDockerMcpCommand,
  safeParseJsonResponse,
  QUICK_OPTIONS,
  LONG_RUNNING_OPTIONS,
  type CommandError,
  type SafeExecuteOptions,
} from '../utils/command-security';
import { CatalogEntry, CatalogServerInfo } from '../../types/models';

// =============================================================================
// Docker MCP Catalog Response Schemas
// カタログAPI応答の厳格な検証用Zodスキーマ
// =============================================================================

const CatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  image: z.string(),
  author: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  popularity: z.number(),
  lastUpdated: z.string().transform(str => new Date(str)),
  verified: z.boolean(),
  metadata: z.object({
    homepage: z.string().optional(),
    repository: z.string().optional(),
    documentation: z.string().optional(),
    license: z.string().optional(),
  }),
});

const CatalogListResponseSchema = z.object({
  entries: z.array(CatalogEntrySchema),
  total: z.number(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  filters: z.object({
    category: z.string().optional(),
    verified: z.boolean().optional(),
    search: z.string().optional(),
  }).optional(),
  timestamp: z.string(),
});

const CatalogServerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  image: z.string(),
  author: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  supportedConfigurations: z.object({
    environment: z.record(z.object({
      type: z.string(),
      required: z.boolean(),
      description: z.string(),
    })),
    availableTools: z.array(z.string()),
    resourceOptions: z.object({
      minMemory: z.number(),
      maxMemory: z.number(),
      minCpu: z.number(),
      maxCpu: z.number(),
    }),
    networkRequirements: z.object({
      ports: z.array(z.object({
        port: z.number(),
        protocol: z.string(),
        description: z.string(),
      })),
      outboundConnections: z.array(z.string()),
    }),
  }),
  installMetadata: z.object({
    installationTime: z.number(),
    diskSpace: z.number(),
    dependencies: z.array(z.string()),
    preInstallChecks: z.array(z.string()),
    postInstallValidation: z.array(z.string()),
  }),
  documentation: z.object({
    readme: z.string(),
    quickStart: z.string(),
    examples: z.array(z.object({
      name: z.string(),
      description: z.string(),
      configuration: z.any(), // ServerConfiguration - 循環参照のためany
    })),
  }),
  verified: z.boolean(),
  popularity: z.number(),
  lastUpdated: z.string().transform(str => new Date(str)),
  metadata: z.record(z.any()),
});

const CategoriesResponseSchema = z.object({
  categories: z.array(z.object({
    name: z.string(),
    description: z.string(),
    count: z.number(),
    icon: z.string().optional(),
  })),
  timestamp: z.string(),
});

const InstallStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'downloading', 'installing', 'completed', 'failed']),
  progress: z.object({
    current: z.number(),
    total: z.number(),
    message: z.string(),
  }),
  estimatedTimeRemaining: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// Catalog Client Class
// Docker MCPカタログ操作の安全なクライアント
// =============================================================================

export class CatalogClient {
  private readonly defaultOptions: SafeExecuteOptions;

  constructor(options: SafeExecuteOptions = {}) {
    this.defaultOptions = {
      ...QUICK_OPTIONS,
      ...options,
    };
  }

  /**
   * カタログエントリ一覧の取得
   */
  async listEntries(options?: {
    category?: string;
    search?: string;
    verified?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: 'popularity' | 'name' | 'updated' | 'verified';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    entries: CatalogEntry[];
    total: number;
    page?: number;
    pageSize?: number;
  }> {
    try {
      const args = ['catalog', 'list'];
      
      // フィルタオプションの追加
      if (options?.category) {
        args.push('--category', this.validateCategory(options.category));
      }
      
      if (options?.search) {
        args.push('--search', this.validateSearchQuery(options.search));
      }
      
      if (options?.verified !== undefined) {
        args.push('--verified', options.verified.toString());
      }
      
      if (options?.page !== undefined) {
        args.push('--page', this.validatePageNumber(options.page).toString());
      }
      
      if (options?.pageSize !== undefined) {
        args.push('--page-size', this.validatePageSize(options.pageSize).toString());
      }
      
      if (options?.sortBy) {
        args.push('--sort-by', options.sortBy);
      }
      
      if (options?.sortOrder) {
        args.push('--sort-order', options.sortOrder);
      }

      const result = await executeDockerMcpCommand('catalog', args, {
        ...this.defaultOptions,
        timeout: 30000,
      });

      if (!result.success) {
        throw this.createCommandError('LIST_CATALOG_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, CatalogListResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid catalog list response', parseResult.error);
      }

      return {
        entries: parseResult.data.entries,
        total: parseResult.data.total,
        page: parseResult.data.page,
        pageSize: parseResult.data.pageSize,
      };
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('listEntries', error);
    }
  }

  /**
   * 特定のカタログエントリの詳細情報取得
   */
  async getServerInfo(id: string): Promise<CatalogServerInfo> {
    this.validateEntryId(id);

    try {
      const result = await executeDockerMcpCommand('catalog', ['info', id], {
        ...this.defaultOptions,
        timeout: 20000,
      });

      if (!result.success) {
        if (result.exitCode === 1 && result.stderr.includes('not found')) {
          throw this.createNotFoundError(`Catalog entry with ID ${id} not found`);
        }
        throw this.createCommandError('GET_CATALOG_INFO_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, CatalogServerInfoSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid catalog info response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('getServerInfo', error);
    }
  }

  /**
   * カタログからサーバーのインストール
   */
  async installServer(
    entryId: string,
    options?: {
      name?: string;
      environment?: Record<string, string>;
      resourceLimits?: {
        memory?: string;
        cpu?: string;
      };
      networkConfig?: {
        ports?: Array<{ containerPort: number; hostPort?: number }>;
      };
    }
  ): Promise<{ jobId: string; status: string }> {
    this.validateEntryId(entryId);

    try {
      const args = ['catalog', 'install', entryId];

      // オプション引数の追加
      if (options?.name) {
        args.push('--name', this.validateServerName(options.name));
      }

      if (options?.environment) {
        const envJson = JSON.stringify(this.validateEnvironment(options.environment));
        args.push('--environment', envJson);
      }

      if (options?.resourceLimits) {
        const limitsJson = JSON.stringify(options.resourceLimits);
        args.push('--resource-limits', limitsJson);
      }

      if (options?.networkConfig) {
        const networkJson = JSON.stringify(options.networkConfig);
        args.push('--network-config', networkJson);
      }

      const result = await executeDockerMcpCommand('catalog', args, {
        ...LONG_RUNNING_OPTIONS,
        timeout: 300000, // 5分（インストールには時間がかかる）
      });

      if (!result.success) {
        throw this.createCommandError('INSTALL_FROM_CATALOG_FAILED', result.stderr, result.exitCode);
      }

      const response = JSON.parse(result.stdout);
      return {
        jobId: response.jobId,
        status: response.status,
      };
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('installServer', error);
    }
  }

  /**
   * インストール状況の確認
   */
  async getInstallStatus(jobId: string): Promise<{
    status: string;
    progress: { current: number; total: number; message: string };
    estimatedTimeRemaining?: number;
    error?: string;
  }> {
    this.validateJobId(jobId);

    try {
      const result = await executeDockerMcpCommand('catalog', ['install-status', jobId], {
        ...this.defaultOptions,
        timeout: 10000,
      });

      if (!result.success) {
        if (result.exitCode === 1 && result.stderr.includes('not found')) {
          throw this.createNotFoundError(`Install job with ID ${jobId} not found`);
        }
        throw this.createCommandError('GET_INSTALL_STATUS_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, InstallStatusSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid install status response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('getInstallStatus', error);
    }
  }

  /**
   * カタログのカテゴリ一覧取得
   */
  async getCategories(): Promise<Array<{
    name: string;
    description: string;
    count: number;
    icon?: string;
  }>> {
    try {
      const result = await executeDockerMcpCommand('catalog', ['categories'], {
        ...this.defaultOptions,
        timeout: 15000,
      });

      if (!result.success) {
        throw this.createCommandError('GET_CATEGORIES_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, CategoriesResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid categories response', parseResult.error);
      }

      return parseResult.data.categories;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('getCategories', error);
    }
  }

  /**
   * カタログの更新（管理機能）
   */
  async refreshCatalog(): Promise<{ success: boolean; message: string }> {
    try {
      const result = await executeDockerMcpCommand('catalog', ['refresh'], {
        ...LONG_RUNNING_OPTIONS,
        timeout: 180000, // 3分（カタログ更新は時間がかかる）
      });

      if (!result.success) {
        throw this.createCommandError('REFRESH_CATALOG_FAILED', result.stderr, result.exitCode);
      }

      return {
        success: true,
        message: result.stdout.trim() || 'Catalog refreshed successfully',
      };
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('refreshCatalog', error);
    }
  }

  /**
   * カタログの検索（高度な検索機能）
   */
  async searchEntries(query: {
    text?: string;
    categories?: string[];
    tags?: string[];
    verified?: boolean;
    minPopularity?: number;
    author?: string;
  }): Promise<CatalogEntry[]> {
    try {
      const args = ['catalog', 'search'];
      
      if (query.text) {
        args.push('--query', this.validateSearchQuery(query.text));
      }
      
      if (query.categories && query.categories.length > 0) {
        for (const category of query.categories) {
          args.push('--category', this.validateCategory(category));
        }
      }
      
      if (query.tags && query.tags.length > 0) {
        for (const tag of query.tags) {
          args.push('--tag', this.validateTag(tag));
        }
      }
      
      if (query.verified !== undefined) {
        args.push('--verified', query.verified.toString());
      }
      
      if (query.minPopularity !== undefined) {
        args.push('--min-popularity', Math.max(0, query.minPopularity).toString());
      }
      
      if (query.author) {
        args.push('--author', this.validateAuthor(query.author));
      }

      const result = await executeDockerMcpCommand('catalog', args, {
        ...this.defaultOptions,
        timeout: 30000,
      });

      if (!result.success) {
        throw this.createCommandError('SEARCH_CATALOG_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, CatalogListResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid search response', parseResult.error);
      }

      return parseResult.data.entries;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('searchEntries', error);
    }
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  private validateEntryId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw this.createValidationError('Entry ID must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
      throw this.createValidationError('Entry ID contains invalid characters');
    }
    if (id.length > 100) {
      throw this.createValidationError('Entry ID too long (max 100 characters)');
    }
  }

  private validateJobId(jobId: string): void {
    if (!jobId || typeof jobId !== 'string') {
      throw this.createValidationError('Job ID must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      throw this.createValidationError('Job ID contains invalid characters');
    }
    if (jobId.length > 100) {
      throw this.createValidationError('Job ID too long (max 100 characters)');
    }
  }

  private validateServerName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw this.createValidationError('Server name must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw this.createValidationError('Server name contains invalid characters');
    }
    if (name.length > 50) {
      throw this.createValidationError('Server name too long (max 50 characters)');
    }
    return name;
  }

  private validateCategory(category: string): string {
    if (!category || typeof category !== 'string') {
      throw this.createValidationError('Category must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(category)) {
      throw this.createValidationError('Category contains invalid characters');
    }
    if (category.length > 30) {
      throw this.createValidationError('Category too long (max 30 characters)');
    }
    return category;
  }

  private validateTag(tag: string): string {
    if (!tag || typeof tag !== 'string') {
      throw this.createValidationError('Tag must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(tag)) {
      throw this.createValidationError('Tag contains invalid characters');
    }
    if (tag.length > 20) {
      throw this.createValidationError('Tag too long (max 20 characters)');
    }
    return tag;
  }

  private validateAuthor(author: string): string {
    if (!author || typeof author !== 'string') {
      throw this.createValidationError('Author must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(author)) {
      throw this.createValidationError('Author contains invalid characters');
    }
    if (author.length > 50) {
      throw this.createValidationError('Author too long (max 50 characters)');
    }
    return author;
  }

  private validateSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      throw this.createValidationError('Search query must be a non-empty string');
    }
    if (query.length > 100) {
      throw this.createValidationError('Search query too long (max 100 characters)');
    }
    // 基本的なSQLインジェクション対策
    if (/['";\\\x00\x1a]/.test(query)) {
      throw this.createValidationError('Search query contains invalid characters');
    }
    return query;
  }

  private validatePageNumber(page: number): number {
    if (!Number.isInteger(page) || page < 1) {
      throw this.createValidationError('Page number must be a positive integer');
    }
    if (page > 1000) {
      throw this.createValidationError('Page number too large (max 1000)');
    }
    return page;
  }

  private validatePageSize(pageSize: number): number {
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw this.createValidationError('Page size must be a positive integer');
    }
    if (pageSize > 100) {
      throw this.createValidationError('Page size too large (max 100)');
    }
    return pageSize;
  }

  private validateEnvironment(env: Record<string, string>): Record<string, string> {
    const validated: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(env)) {
      // 環境変数名の検証
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        throw this.createValidationError(`Invalid environment variable name: ${key}`);
      }
      
      // 環境変数値の検証
      if (typeof value !== 'string') {
        throw this.createValidationError(`Environment variable value must be string: ${key}`);
      }
      
      if (value.length > 1000) {
        throw this.createValidationError(`Environment variable value too long: ${key}`);
      }
      
      validated[key] = value;
    }
    
    return validated;
  }

  private createCommandError(code: string, stderr: string, exitCode?: number): CommandError {
    return {
      code,
      message: `Catalog command failed: ${stderr || 'Unknown error'}`,
      exitCode,
      stderr,
      context: {
        command: 'docker',
        args: ['mcp', 'catalog'],
        timeout: this.defaultOptions.timeout || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private createParseError(message: string, details?: string): CommandError {
    return {
      code: 'JSON_PARSE_ERROR',
      message: `${message}: ${details || 'Unknown parsing error'}`,
      context: {
        command: 'docker',
        args: ['mcp', 'catalog'],
        timeout: this.defaultOptions.timeout || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private createValidationError(message: string): CommandError {
    return {
      code: 'VALIDATION_ERROR',
      message,
      context: {
        command: 'docker',
        args: ['mcp', 'catalog'],
        timeout: this.defaultOptions.timeout || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private createNotFoundError(message: string): CommandError {
    return {
      code: 'RESOURCE_NOT_FOUND',
      message,
      context: {
        command: 'docker',
        args: ['mcp', 'catalog'],
        timeout: this.defaultOptions.timeout || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private createUnexpectedError(operation: string, error: any): CommandError {
    return {
      code: 'UNEXPECTED_ERROR',
      message: `Unexpected error in ${operation}: ${error instanceof Error ? error.message : String(error)}`,
      context: {
        command: 'docker',
        args: ['mcp', 'catalog'],
        timeout: this.defaultOptions.timeout || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private isCommandError(error: any): error is CommandError {
    return error && typeof error === 'object' && 'code' in error && 'message' in error;
  }
}