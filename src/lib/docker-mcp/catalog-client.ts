import { z } from 'zod';
import { EventEmitter } from 'events';
import {
  CatalogEntry,
  CatalogResponse,
  JobResponse,
  ServerConfiguration,
  DockerMCPError,
  catalogResponseSchema,
  catalogEntrySchema,
  jobResponseSchema,
} from '../schemas/docker-mcp-schemas';
import {
  buildSecureCommandArray,
  validateAndSanitizeArgs,
} from '../utils/command-security';
import { ProcessExecutor, ProcessError } from '../utils/process-executor';
import { getJobRepository } from '../../db/repositories';
import { v4 as uuidv4 } from 'uuid';

/**
 * MCP カタログクライアント
 * MCPサーバーカタログの閲覧とインストール機能を提供
 */
export class CatalogClient extends EventEmitter {
  private static instance: CatalogClient | null = null;
  private readonly jobRepository;

  private constructor() {
    super();
    this.jobRepository = getJobRepository();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): CatalogClient {
    if (!CatalogClient.instance) {
      CatalogClient.instance = new CatalogClient();
    }
    return CatalogClient.instance;
  }

  /**
   * カタログからMCPサーバー一覧を取得
   */
  async getCatalog(options: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
  } = {}): Promise<CatalogResponse> {
    try {
      const validatedArgs = validateAndSanitizeArgs(options);
      this.emit('operationStart', { operation: 'getCatalog', args: validatedArgs });

      const args = ['--format', 'json'];
      
      if (validatedArgs.page && validatedArgs.page > 1) {
        args.push('--page', validatedArgs.page.toString());
      }
      
      if (validatedArgs.limit) {
        args.push('--limit', validatedArgs.limit.toString());
      }
      
      if (validatedArgs.search) {
        args.push('--search', validatedArgs.search);
      }
      
      if (validatedArgs.category) {
        args.push('--category', validatedArgs.category);
      }

      const commandArray = buildSecureCommandArray('docker', 'catalog-list', args);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 30000,
        maxRetries: 2,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedResponse = catalogResponseSchema.parse(parsedOutput);

      this.emit('operationComplete', { 
        operation: 'getCatalog',
        entryCount: validatedResponse.entries.length,
        total: validatedResponse.total 
      });

      return validatedResponse;
    } catch (error) {
      this.emit('operationError', { operation: 'getCatalog', error });
      throw this.createCatalogError('GET_CATALOG_ERROR', 'Failed to get catalog entries', error);
    }
  }

  /**
   * カタログから特定のMCPサーバー情報を取得
   */
  async getServerInfo(id: string): Promise<CatalogEntry> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      this.emit('operationStart', { operation: 'getServerInfo', serverId: sanitizedId });

      const commandArray = buildSecureCommandArray('docker', 'catalog-info', [
        sanitizedId,
        '--format', 'json'
      ]);
      
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 20000,
        maxRetries: 1,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedEntry = catalogEntrySchema.parse(parsedOutput);

      this.emit('operationComplete', { operation: 'getServerInfo', serverId: sanitizedId });
      return validatedEntry;
    } catch (error) {
      this.emit('operationError', { operation: 'getServerInfo', serverId: id, error });
      throw this.createCatalogError('GET_SERVER_INFO_ERROR', `Failed to get server info for ${id}`, error);
    }
  }

  /**
   * カタログからMCPサーバーをインストール（非同期ジョブとして実行）
   */
  async installServer(id: string, config: Partial<ServerConfiguration>): Promise<JobResponse> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      
      // 設定の検証とサニタイズ
      const sanitizedConfig = this.validateServerConfiguration(config);
      
      // ジョブを作成
      const jobId = uuidv4();
      const job = await this.jobRepository.create({
        id: jobId,
        type: 'install',
        status: 'pending',
        targetType: 'catalog',
        targetId: sanitizedId,
        progressCurrent: 0,
        progressTotal: 100,
        progressMessage: 'Preparing to install server from catalog...',
      });

      // 非同期でインストールを実行
      this.executeAsyncInstallOperation(jobId, sanitizedId, sanitizedConfig).catch(error => {
        this.emit('jobError', { jobId, error });
      });

      return jobResponseSchema.parse({
        id: jobId,
        status: 'pending',
        message: 'Server installation started from catalog',
        estimatedDuration: 120000, // 2分の推定時間
      });
    } catch (error) {
      throw this.createCatalogError('INSTALL_SERVER_ERROR', `Failed to start installation for server ${id}`, error);
    }
  }

  /**
   * ジョブのステータスを取得
   */
  async getJobStatus(id: string): Promise<any> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      const job = await this.jobRepository.findById(sanitizedId);
      
      if (!job) {
        throw new Error(`Job not found: ${sanitizedId}`);
      }

      return {
        id: job.id,
        status: job.status,
        type: job.type,
        target: {
          type: job.targetType,
          id: job.targetId,
        },
        progress: job.progressCurrent ? {
          current: job.progressCurrent,
          total: job.progressTotal || 100,
          message: job.progressMessage || '',
        } : undefined,
        result: job.result ? JSON.parse(job.result) : undefined,
        error: job.errorCode ? {
          code: job.errorCode,
          message: job.errorMessage || '',
          details: job.errorDetails ? JSON.parse(job.errorDetails) : undefined,
        } : undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      };
    } catch (error) {
      throw this.createCatalogError('GET_JOB_STATUS_ERROR', `Failed to get job status for ${id}`, error);
    }
  }

  /**
   * ジョブをキャンセル
   */
  async cancelJob(id: string): Promise<void> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      const job = await this.jobRepository.findById(sanitizedId);
      
      if (!job) {
        throw new Error(`Job not found: ${sanitizedId}`);
      }

      // 進行中のジョブのみキャンセル可能
      if (!['pending', 'running'].includes(job.status)) {
        throw new Error(`Cannot cancel job in status: ${job.status}`);
      }

      await this.jobRepository.updateStatus(sanitizedId, 'cancelled', {
        progressMessage: 'Job cancelled by user request',
      });

      this.emit('jobCancelled', { jobId: sanitizedId });
    } catch (error) {
      throw this.createCatalogError('CANCEL_JOB_ERROR', `Failed to cancel job ${id}`, error);
    }
  }

  /**
   * カタログ検索
   */
  async searchCatalog(searchTerm: string, options: {
    category?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<CatalogResponse> {
    try {
      const searchOptions = {
        search: searchTerm,
        ...options,
      };

      return await this.getCatalog(searchOptions);
    } catch (error) {
      throw this.createCatalogError('SEARCH_CATALOG_ERROR', `Failed to search catalog for "${searchTerm}"`, error);
    }
  }

  /**
   * 人気のMCPサーバーを取得
   */
  async getPopularServers(limit: number = 10): Promise<CatalogEntry[]> {
    try {
      const validatedLimit = Math.min(Math.max(limit, 1), 50); // 1-50の範囲に制限

      const response = await this.getCatalog({
        limit: validatedLimit,
        // カタログAPIが人気度ソートをサポートしていると仮定
      });

      return response.entries.sort((a, b) => b.popularity - a.popularity);
    } catch (error) {
      throw this.createCatalogError('GET_POPULAR_SERVERS_ERROR', 'Failed to get popular servers', error);
    }
  }

  /**
   * 非同期インストール操作の実行
   */
  private async executeAsyncInstallOperation(
    jobId: string,
    serverId: string,
    config: Partial<ServerConfiguration>
  ): Promise<void> {
    try {
      // ジョブステータスを実行中に更新
      await this.jobRepository.updateStatus(jobId, 'running', {
        progressCurrent: 10,
        progressMessage: `Downloading server ${serverId} from catalog...`,
      });

      // 設定をJSONとしてシリアライズ
      const configJson = JSON.stringify(config);
      
      const args = [serverId, '--config', configJson, '--format', 'json'];
      const commandArray = buildSecureCommandArray('docker', 'catalog-install', args);
      
      const result = await ProcessExecutor.executeLongRunning(
        commandArray[0],
        commandArray.slice(1),
        {
          timeout: 300000, // 5分
          maxRetries: 2,
        }
      );

      // 進行状況の更新
      await this.jobRepository.updateStatus(jobId, 'running', {
        progressCurrent: 80,
        progressMessage: 'Finalizing server installation...',
      });

      // 成功時の処理
      const installResult = this.parseJsonOutput(result.stdout);
      await this.jobRepository.updateStatus(jobId, 'completed', {
        result: JSON.stringify({
          serverId,
          config,
          installResult,
          executionTime: result.executionTime,
        }),
        progressCurrent: 100,
        progressMessage: 'Server installation completed successfully',
      });

      this.emit('installOperationComplete', { jobId, serverId, result: installResult });
    } catch (error) {
      // エラー時の処理
      const processError = error as ProcessError;
      await this.jobRepository.updateStatus(jobId, 'failed', {
        errorCode: processError.code || 'INSTALL_ERROR',
        errorMessage: processError.message,
        errorDetails: JSON.stringify({
          stderr: processError.stderr,
          exitCode: processError.exitCode,
          executionTime: processError.executionTime,
          serverId,
          config,
        }),
      });

      this.emit('installOperationFailed', { jobId, serverId, error: processError });
    }
  }

  /**
   * サーバー設定の検証とサニタイズ
   */
  private validateServerConfiguration(config: Partial<ServerConfiguration>): Partial<ServerConfiguration> {
    const sanitizedConfig: Partial<ServerConfiguration> = {};

    if (config.environment) {
      sanitizedConfig.environment = {};
      for (const [key, value] of Object.entries(config.environment)) {
        // 環境変数名と値のサニタイズ
        const sanitizedKey = key.replace(/[^A-Z0-9_]/g, '').substring(0, 100);
        const sanitizedValue = typeof value === 'string' ? value.substring(0, 1000) : String(value);
        if (sanitizedKey) {
          sanitizedConfig.environment[sanitizedKey] = sanitizedValue;
        }
      }
    }

    if (config.enabledTools && Array.isArray(config.enabledTools)) {
      sanitizedConfig.enabledTools = config.enabledTools
        .filter(tool => typeof tool === 'string')
        .map(tool => tool.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100))
        .filter(tool => tool.length > 0);
    }

    if (config.resourceLimits) {
      sanitizedConfig.resourceLimits = {};
      if (config.resourceLimits.memory) {
        sanitizedConfig.resourceLimits.memory = config.resourceLimits.memory.substring(0, 20);
      }
      if (config.resourceLimits.cpu) {
        sanitizedConfig.resourceLimits.cpu = config.resourceLimits.cpu.substring(0, 20);
      }
      if (config.resourceLimits.disk) {
        sanitizedConfig.resourceLimits.disk = config.resourceLimits.disk.substring(0, 20);
      }
    }

    return sanitizedConfig;
  }

  /**
   * JSON出力を安全に解析
   */
  private parseJsonOutput(output: string): any {
    try {
      const trimmed = output.trim();
      if (!trimmed) {
        throw new Error('Empty output');
      }
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${error}. Output: ${output.substring(0, 200)}`);
    }
  }

  /**
   * カタログエラーを作成
   */
  private createCatalogError(code: string, message: string, originalError?: any): DockerMCPError {
    const processError = originalError as ProcessError;
    
    return {
      error: {
        code,
        message,
        details: processError ? {
          stderr: processError.stderr,
          executionTime: processError.executionTime,
          retryCount: processError.retryCount,
        } : originalError?.message || originalError,
        exitCode: processError?.exitCode,
        stderr: processError?.stderr,
      }
    };
  }
}