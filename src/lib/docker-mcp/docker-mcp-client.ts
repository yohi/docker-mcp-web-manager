import { z } from 'zod';
import { EventEmitter } from 'events';
import {
  MCPServer,
  JobResponse,
  TestResult,
  LogsResponse,
  GatewayStatus,
  DockerMCPError,
  dockerMCPListResponseSchema,
  mcpServerSchema,
  jobResponseSchema,
  testResultSchema,
  logsResponseSchema,
  gatewayStatusSchema,
  dockerMCPErrorSchema,
} from '../schemas/docker-mcp-schemas';
import {
  buildSecureCommandArray,
  validateAndSanitizeArgs,
  validateFilePath,
} from '../utils/command-security';
import { ProcessExecutor, ProcessResult, ProcessError } from '../utils/process-executor';
import { getJobRepository } from '../../db/repositories';
import { v4 as uuidv4 } from 'uuid';

/**
 * Docker MCP Gateway統合クライアント
 * セキュリティファーストの実装でDocker MCP CLIコマンドを安全に実行
 */
export class DockerMCPClient extends EventEmitter {
  private static instance: DockerMCPClient | null = null;
  private readonly jobRepository;

  private constructor() {
    super();
    this.jobRepository = getJobRepository();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): DockerMCPClient {
    if (!DockerMCPClient.instance) {
      DockerMCPClient.instance = new DockerMCPClient();
    }
    return DockerMCPClient.instance;
  }

  /**
   * MCPサーバー一覧を取得
   */
  async listServers(): Promise<MCPServer[]> {
    try {
      this.emit('operationStart', { operation: 'listServers' });

      const commandArray = buildSecureCommandArray('docker', 'list', ['--format', 'json']);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 30000,
        maxRetries: 2,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedResponse = dockerMCPListResponseSchema.parse(parsedOutput);

      this.emit('operationComplete', { 
        operation: 'listServers',
        serverCount: validatedResponse.servers.length 
      });

      return validatedResponse.servers;
    } catch (error) {
      this.emit('operationError', { operation: 'listServers', error });
      throw this.createDockerMCPError('LIST_SERVERS_ERROR', 'Failed to list servers', error);
    }
  }

  /**
   * MCPサーバー詳細を取得
   */
  async getServerDetails(id: string): Promise<MCPServer> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      this.emit('operationStart', { operation: 'getServerDetails', serverId: sanitizedId });

      const commandArray = buildSecureCommandArray('docker', 'inspect', [sanitizedId, '--format', 'json']);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 15000,
        maxRetries: 1,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedServer = mcpServerSchema.parse(parsedOutput);

      this.emit('operationComplete', { operation: 'getServerDetails', serverId: sanitizedId });
      return validatedServer;
    } catch (error) {
      this.emit('operationError', { operation: 'getServerDetails', serverId: id, error });
      throw this.createDockerMCPError('GET_SERVER_DETAILS_ERROR', `Failed to get server details for ${id}`, error);
    }
  }

  /**
   * MCPサーバーを有効化（非同期ジョブとして実行）
   */
  async enableServer(id: string): Promise<JobResponse> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      
      // ジョブを作成
      const jobId = uuidv4();
      const job = await this.jobRepository.create({
        id: jobId,
        type: 'enable',
        status: 'pending',
        targetType: 'server',
        targetId: sanitizedId,
        progressCurrent: 0,
        progressTotal: 100,
        progressMessage: 'Preparing to enable server...',
      });

      // 非同期でサーバー有効化を実行
      this.executeAsyncServerOperation(jobId, 'enable', sanitizedId).catch(error => {
        this.emit('jobError', { jobId, error });
      });

      return jobResponseSchema.parse({
        id: jobId,
        status: 'pending',
        message: 'Server enable operation started',
        estimatedDuration: 30000,
      });
    } catch (error) {
      throw this.createDockerMCPError('ENABLE_SERVER_ERROR', `Failed to start enable operation for server ${id}`, error);
    }
  }

  /**
   * MCPサーバーを無効化（非同期ジョブとして実行）
   */
  async disableServer(id: string): Promise<JobResponse> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      
      const jobId = uuidv4();
      const job = await this.jobRepository.create({
        id: jobId,
        type: 'disable',
        status: 'pending',
        targetType: 'server',
        targetId: sanitizedId,
        progressCurrent: 0,
        progressTotal: 100,
        progressMessage: 'Preparing to disable server...',
      });

      this.executeAsyncServerOperation(jobId, 'disable', sanitizedId).catch(error => {
        this.emit('jobError', { jobId, error });
      });

      return jobResponseSchema.parse({
        id: jobId,
        status: 'pending',
        message: 'Server disable operation started',
        estimatedDuration: 15000,
      });
    } catch (error) {
      throw this.createDockerMCPError('DISABLE_SERVER_ERROR', `Failed to start disable operation for server ${id}`, error);
    }
  }

  /**
   * MCPゲートウェイを開始（非同期ジョブとして実行）
   */
  async startGateway(): Promise<JobResponse> {
    try {
      const jobId = uuidv4();
      const job = await this.jobRepository.create({
        id: jobId,
        type: 'start',
        status: 'pending',
        targetType: 'gateway',
        targetId: 'mcp-gateway',
        progressCurrent: 0,
        progressTotal: 100,
        progressMessage: 'Starting MCP Gateway...',
      });

      this.executeAsyncGatewayOperation(jobId, 'start').catch(error => {
        this.emit('jobError', { jobId, error });
      });

      return jobResponseSchema.parse({
        id: jobId,
        status: 'pending',
        message: 'MCP Gateway start operation initiated',
        estimatedDuration: 45000,
      });
    } catch (error) {
      throw this.createDockerMCPError('START_GATEWAY_ERROR', 'Failed to start MCP Gateway operation', error);
    }
  }

  /**
   * MCPゲートウェイを停止（非同期ジョブとして実行）
   */
  async stopGateway(): Promise<JobResponse> {
    try {
      const jobId = uuidv4();
      const job = await this.jobRepository.create({
        id: jobId,
        type: 'stop',
        status: 'pending',
        targetType: 'gateway',
        targetId: 'mcp-gateway',
        progressCurrent: 0,
        progressTotal: 100,
        progressMessage: 'Stopping MCP Gateway...',
      });

      this.executeAsyncGatewayOperation(jobId, 'stop').catch(error => {
        this.emit('jobError', { jobId, error });
      });

      return jobResponseSchema.parse({
        id: jobId,
        status: 'pending',
        message: 'MCP Gateway stop operation initiated',
        estimatedDuration: 20000,
      });
    } catch (error) {
      throw this.createDockerMCPError('STOP_GATEWAY_ERROR', 'Failed to stop MCP Gateway operation', error);
    }
  }

  /**
   * MCPサーバーのログを取得
   */
  async getServerLogs(
    id: string, 
    options: { tail?: number; since?: string; follow?: boolean } = {}
  ): Promise<LogsResponse> {
    try {
      const sanitizedId = validateAndSanitizeArgs({ serverId: id }).serverId!;
      const validatedOptions = validateAndSanitizeArgs({ logs: options }).logs!;

      const args = [sanitizedId, '--format', 'json'];
      if (validatedOptions.tail) {
        args.push('--tail', validatedOptions.tail.toString());
      }
      if (validatedOptions.since) {
        args.push('--since', validatedOptions.since);
      }

      const commandArray = buildSecureCommandArray('docker', 'logs', args);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: validatedOptions.follow ? 0 : 30000, // フォローモードではタイムアウトなし
        maxRetries: 1,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      return logsResponseSchema.parse(parsedOutput);
    } catch (error) {
      throw this.createDockerMCPError('GET_LOGS_ERROR', `Failed to get logs for server ${id}`, error);
    }
  }

  /**
   * MCPサーバーのツールをテスト（非同期ジョブとして実行）
   */
  async testServerTool(id: string, toolName: string, input: any): Promise<JobResponse> {
    try {
      const validatedArgs = validateAndSanitizeArgs({ serverId: id, toolName, input });
      
      const jobId = uuidv4();
      const job = await this.jobRepository.create({
        id: jobId,
        type: 'test',
        status: 'pending',
        targetType: 'server',
        targetId: validatedArgs.serverId!,
        progressCurrent: 0,
        progressTotal: 100,
        progressMessage: `Preparing to test tool ${validatedArgs.toolName}...`,
      });

      this.executeAsyncTestOperation(
        jobId,
        validatedArgs.serverId!,
        validatedArgs.toolName!,
        validatedArgs.input!
      ).catch(error => {
        this.emit('jobError', { jobId, error });
      });

      return jobResponseSchema.parse({
        id: jobId,
        status: 'pending',
        message: `Tool test ${toolName} started`,
        estimatedDuration: 60000,
      });
    } catch (error) {
      throw this.createDockerMCPError('TEST_TOOL_ERROR', `Failed to start tool test for ${toolName}`, error);
    }
  }

  /**
   * ゲートウェイの状態を取得
   */
  async getGatewayStatus(): Promise<GatewayStatus> {
    try {
      const commandArray = buildSecureCommandArray('docker', 'gateway-status', ['--format', 'json']);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 10000,
        maxRetries: 1,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      return gatewayStatusSchema.parse(parsedOutput);
    } catch (error) {
      throw this.createDockerMCPError('GET_GATEWAY_STATUS_ERROR', 'Failed to get gateway status', error);
    }
  }

  /**
   * 非同期サーバー操作の実行
   */
  private async executeAsyncServerOperation(
    jobId: string,
    operation: 'enable' | 'disable',
    serverId: string
  ): Promise<void> {
    try {
      // ジョブステータスを実行中に更新
      await this.jobRepository.updateStatus(jobId, 'running', {
        progressCurrent: 10,
        progressMessage: `${operation === 'enable' ? 'Enabling' : 'Disabling'} server ${serverId}...`,
      });

      const commandArray = buildSecureCommandArray('docker', operation, [serverId]);
      const result = await ProcessExecutor.executeLongRunning(
        commandArray[0], 
        commandArray.slice(1),
        {
          timeout: operation === 'enable' ? 60000 : 30000,
          maxRetries: 2,
        }
      );

      // 成功時の処理
      await this.jobRepository.updateStatus(jobId, 'completed', {
        result: JSON.stringify({ serverId, operation, output: result.stdout }),
        progressCurrent: 100,
        progressMessage: `Server ${operation} completed successfully`,
      });

      this.emit('serverOperationComplete', { jobId, serverId, operation });
    } catch (error) {
      // エラー時の処理
      const processError = error as ProcessError;
      await this.jobRepository.updateStatus(jobId, 'failed', {
        errorCode: processError.code,
        errorMessage: processError.message,
        errorDetails: JSON.stringify({
          stderr: processError.stderr,
          exitCode: processError.exitCode,
          executionTime: processError.executionTime,
        }),
      });

      this.emit('serverOperationFailed', { jobId, serverId, operation, error: processError });
    }
  }

  /**
   * 非同期ゲートウェイ操作の実行
   */
  private async executeAsyncGatewayOperation(
    jobId: string,
    operation: 'start' | 'stop'
  ): Promise<void> {
    try {
      await this.jobRepository.updateStatus(jobId, 'running', {
        progressCurrent: 20,
        progressMessage: `${operation === 'start' ? 'Starting' : 'Stopping'} MCP Gateway...`,
      });

      const commandArray = buildSecureCommandArray('docker', `gateway-${operation}`, []);
      const result = await ProcessExecutor.executeLongRunning(
        commandArray[0],
        commandArray.slice(1),
        {
          timeout: operation === 'start' ? 90000 : 45000,
          maxRetries: 3,
        }
      );

      await this.jobRepository.updateStatus(jobId, 'completed', {
        result: JSON.stringify({ operation, output: result.stdout }),
        progressCurrent: 100,
        progressMessage: `MCP Gateway ${operation} completed successfully`,
      });

      this.emit('gatewayOperationComplete', { jobId, operation });
    } catch (error) {
      const processError = error as ProcessError;
      await this.jobRepository.updateStatus(jobId, 'failed', {
        errorCode: processError.code,
        errorMessage: processError.message,
        errorDetails: JSON.stringify({
          stderr: processError.stderr,
          exitCode: processError.exitCode,
        }),
      });

      this.emit('gatewayOperationFailed', { jobId, operation, error: processError });
    }
  }

  /**
   * 非同期ツールテスト操作の実行
   */
  private async executeAsyncTestOperation(
    jobId: string,
    serverId: string,
    toolName: string,
    input: any
  ): Promise<void> {
    try {
      await this.jobRepository.updateStatus(jobId, 'running', {
        progressCurrent: 25,
        progressMessage: `Executing tool ${toolName} on server ${serverId}...`,
      });

      const inputJson = JSON.stringify(input);
      const commandArray = buildSecureCommandArray('docker', 'test', [
        serverId,
        '--tool', toolName,
        '--input', inputJson,
        '--format', 'json'
      ]);

      const result = await ProcessExecutor.executeLongRunning(
        commandArray[0],
        commandArray.slice(1),
        { timeout: 120000, maxRetries: 1 }
      );

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const testResult = testResultSchema.parse(parsedOutput);

      await this.jobRepository.updateStatus(jobId, 'completed', {
        result: JSON.stringify(testResult),
        progressCurrent: 100,
        progressMessage: `Tool test ${toolName} completed`,
      });

      this.emit('testOperationComplete', { jobId, serverId, toolName, result: testResult });
    } catch (error) {
      const processError = error as ProcessError;
      await this.jobRepository.updateStatus(jobId, 'failed', {
        errorCode: processError.code,
        errorMessage: processError.message,
        errorDetails: JSON.stringify({
          stderr: processError.stderr,
          toolName,
          input,
        }),
      });

      this.emit('testOperationFailed', { jobId, serverId, toolName, error: processError });
    }
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
   * Docker MCPエラーを作成
   */
  private createDockerMCPError(code: string, message: string, originalError?: any): DockerMCPError {
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