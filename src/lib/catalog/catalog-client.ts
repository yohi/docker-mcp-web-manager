import { spawn, SpawnOptions } from 'child_process';
import { z } from 'zod';

// =============================================================================
// カタログクライアント - MCP サーバーカタログへのアクセスを提供
// =============================================================================

/**
 * カタログエントリのスキーマ
 */
export const CatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().url(),
  homepage: z.string().url().optional(),
  documentation: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  downloadCount: z.number().optional(),
  rating: z.number().min(0).max(5).optional(),
  lastUpdated: z.string().datetime().optional(),
  capabilities: z.array(z.string()).default([]),
  requirements: z.object({
    memory: z.string().optional(),
    cpu: z.string().optional(),
    disk: z.string().optional(),
    network: z.boolean().default(false),
  }).optional(),
});

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

/**
 * カタログ検索結果のスキーマ
 */
export const CatalogSearchResultSchema = z.object({
  entries: z.array(CatalogEntrySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  hasNext: z.boolean(),
});

export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;

/**
 * インストール進捗のスキーマ
 */
export const InstallationProgressSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  status: z.enum(['pending', 'downloading', 'installing', 'configuring', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  message: z.string(),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  estimatedTimeRemaining: z.number().optional(),
});

export type InstallationProgress = z.infer<typeof InstallationProgressSchema>;

/**
 * カタログクライアントエラー
 */
export class CatalogClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'CatalogClientError';
  }
}

/**
 * コマンド実行結果インターフェース
 */
interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: Error;
}

/**
 * カタログクライアント - MCP サーバーカタログとの統合
 */
export class CatalogClient {
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: { timeout?: number; maxRetries?: number } = {}) {
    this.timeout = options.timeout || 30000; // 30秒
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * カタログからサーバーを検索
   */
  async searchServers(query: {
    search?: string;
    tags?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
    sortBy?: 'name' | 'popularity' | 'updated' | 'rating';
    sortOrder?: 'asc' | 'desc';
  }): Promise<CatalogSearchResult> {
    try {
      const args = ['catalog', 'search'];
      
      // 検索クエリ
      if (query.search) {
        args.push('--query', query.search);
      }
      
      // タグフィルター
      if (query.tags && query.tags.length > 0) {
        args.push('--tags', query.tags.join(','));
      }
      
      // カテゴリフィルター
      if (query.category) {
        args.push('--category', query.category);
      }
      
      // ページネーション
      if (query.page) {
        args.push('--page', query.page.toString());
      }
      
      if (query.pageSize) {
        args.push('--page-size', query.pageSize.toString());
      }
      
      // ソート
      if (query.sortBy) {
        args.push('--sort-by', query.sortBy);
      }
      
      if (query.sortOrder) {
        args.push('--sort-order', query.sortOrder);
      }

      const result = await this.executeCommand('docker-mcp', args);
      
      if (!result.success) {
        throw new CatalogClientError(
          `Failed to search catalog: ${result.stderr}`,
          'CATALOG_SEARCH_FAILED',
          { exitCode: result.exitCode, stderr: result.stderr }
        );
      }

      const parsedOutput = JSON.parse(result.stdout);
      return CatalogSearchResultSchema.parse(parsedOutput);

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }
      
      throw new CatalogClientError(
        `Catalog search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CATALOG_SEARCH_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * カタログからサーバー詳細を取得
   */
  async getServerDetails(serverId: string): Promise<CatalogEntry> {
    try {
      const args = ['catalog', 'get', serverId];
      const result = await this.executeCommand('docker-mcp', args);
      
      if (!result.success) {
        if (result.stderr.includes('not found') || result.exitCode === 404) {
          throw new CatalogClientError(
            `Server '${serverId}' not found in catalog`,
            'SERVER_NOT_FOUND',
            { serverId }
          );
        }
        
        throw new CatalogClientError(
          `Failed to get server details: ${result.stderr}`,
          'SERVER_DETAILS_FAILED',
          { exitCode: result.exitCode, stderr: result.stderr }
        );
      }

      const parsedOutput = JSON.parse(result.stdout);
      return CatalogEntrySchema.parse(parsedOutput);

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }
      
      throw new CatalogClientError(
        `Failed to get server details: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVER_DETAILS_ERROR',
        { serverId, originalError: error }
      );
    }
  }

  /**
   * カタログからサーバーをインストール
   */
  async installServer(
    serverId: string, 
    options: {
      name?: string;
      version?: string;
      config?: Record<string, any>;
      secrets?: Record<string, string>;
    } = {}
  ): Promise<string> {
    try {
      const args = ['catalog', 'install', serverId];
      
      // インストール名
      if (options.name) {
        args.push('--name', options.name);
      }
      
      // バージョン指定
      if (options.version) {
        args.push('--version', options.version);
      }
      
      // 設定
      if (options.config) {
        args.push('--config', JSON.stringify(options.config));
      }
      
      // シークレット
      if (options.secrets) {
        args.push('--secrets', JSON.stringify(options.secrets));
      }

      const result = await this.executeCommand('docker-mcp', args, { timeout: 300000 }); // 5分
      
      if (!result.success) {
        throw new CatalogClientError(
          `Failed to install server: ${result.stderr}`,
          'SERVER_INSTALL_FAILED',
          { exitCode: result.exitCode, stderr: result.stderr }
        );
      }

      const parsedOutput = JSON.parse(result.stdout);
      
      if (!parsedOutput.installationId) {
        throw new CatalogClientError(
          'Installation started but no installation ID returned',
          'INSTALL_ID_MISSING',
          { output: parsedOutput }
        );
      }

      return parsedOutput.installationId;

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }
      
      throw new CatalogClientError(
        `Server installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SERVER_INSTALL_ERROR',
        { serverId, options, originalError: error }
      );
    }
  }

  /**
   * インストール進捗を取得
   */
  async getInstallationProgress(installationId: string): Promise<InstallationProgress> {
    try {
      const args = ['catalog', 'install-status', installationId];
      const result = await this.executeCommand('docker-mcp', args);
      
      if (!result.success) {
        if (result.stderr.includes('not found') || result.exitCode === 404) {
          throw new CatalogClientError(
            `Installation '${installationId}' not found`,
            'INSTALLATION_NOT_FOUND',
            { installationId }
          );
        }
        
        throw new CatalogClientError(
          `Failed to get installation progress: ${result.stderr}`,
          'INSTALL_PROGRESS_FAILED',
          { exitCode: result.exitCode, stderr: result.stderr }
        );
      }

      const parsedOutput = JSON.parse(result.stdout);
      return InstallationProgressSchema.parse(parsedOutput);

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }
      
      throw new CatalogClientError(
        `Failed to get installation progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INSTALL_PROGRESS_ERROR',
        { installationId, originalError: error }
      );
    }
  }

  /**
   * カタログのカテゴリ一覧を取得
   */
  async getCategories(): Promise<Array<{ id: string; name: string; count: number }>> {
    try {
      const args = ['catalog', 'categories'];
      const result = await this.executeCommand('docker-mcp', args);
      
      if (!result.success) {
        throw new CatalogClientError(
          `Failed to get categories: ${result.stderr}`,
          'CATEGORIES_FAILED',
          { exitCode: result.exitCode, stderr: result.stderr }
        );
      }

      const parsedOutput = JSON.parse(result.stdout);
      
      const CategoriesSchema = z.array(z.object({
        id: z.string(),
        name: z.string(),
        count: z.number(),
      }));
      
      return CategoriesSchema.parse(parsedOutput);

    } catch (error) {
      if (error instanceof CatalogClientError) {
        throw error;
      }
      
      throw new CatalogClientError(
        `Failed to get categories: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CATEGORIES_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Docker MCPコマンドを実行
   */
  private async executeCommand(
    command: string,
    args: string[],
    options: { timeout?: number } = {}
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const timeout = options.timeout || this.timeout;
      const spawnOptions: SpawnOptions = {
        shell: false, // シェルインジェクション防止
        stdio: ['pipe', 'pipe', 'pipe'],
      };

      console.log(`[CATALOG_CMD] Executing: ${command} ${args.join(' ')}`);
      const child = spawn(command, args, spawnOptions);
      
      let stdout = '';
      let stderr = '';
      let isTimedOut = false;

      // タイムアウトの設定
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        child.kill('SIGTERM');
        
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // 標準出力を収集
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // エラー出力を収集
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // プロセス終了時の処理
      child.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        
        if (isTimedOut) {
          resolve({
            success: false,
            stdout,
            stderr: `Command timed out after ${timeout}ms`,
            exitCode: null,
            error: new Error('Command timeout'),
          });
          return;
        }

        const success = exitCode === 0;
        console.log(`[CATALOG_CMD] Exit code: ${exitCode}, Success: ${success}`);
        
        if (!success) {
          console.error(`[CATALOG_CMD] Error: ${stderr}`);
        }

        resolve({
          success,
          stdout,
          stderr,
          exitCode,
        });
      });

      // エラー処理
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        console.error(`[CATALOG_CMD] Spawn error: ${error.message}`);
        
        resolve({
          success: false,
          stdout,
          stderr: error.message,
          exitCode: null,
          error,
        });
      });
    });
  }
}