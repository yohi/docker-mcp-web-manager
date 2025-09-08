import { z } from 'zod';
import {
  executeDockerMcpCommand,
  safeParseJsonResponse,
  QUICK_OPTIONS,
  LONG_RUNNING_OPTIONS,
  type CommandError,
  type SafeExecuteOptions,
} from '../utils/command-security';
import { MCPServer, JobResponse } from '../../types/models';

// =============================================================================
// Docker MCP CLI Response Schemas
// CLI出力の厳格な検証用Zodスキーマ
// =============================================================================

const ServerStatusSchema = z.enum(['running', 'stopped', 'error']);

const DockerMcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  status: ServerStatusSchema,
  version: z.string().optional(),
  description: z.string().optional(),
  ports: z.array(z.object({
    containerPort: z.number(),
    hostPort: z.number().optional(),
    protocol: z.enum(['tcp', 'udp']).default('tcp'),
  })).optional(),
  environment: z.record(z.string()).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

const ServerListResponseSchema = z.object({
  servers: z.array(DockerMcpServerSchema),
  total: z.number(),
  timestamp: z.string(),
});

const ServerDetailsResponseSchema = z.object({
  server: DockerMcpServerSchema,
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    enabled: z.boolean().default(true),
  })).optional(),
  resources: z.array(z.object({
    uri: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional(),
  logs: z.array(z.string()).optional(),
  metrics: z.object({
    cpu: z.number().optional(),
    memory: z.number().optional(),
    network: z.object({
      in: z.number(),
      out: z.number(),
    }).optional(),
  }).optional(),
});

const JobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  message: z.string().optional(),
  estimatedDuration: z.number().optional(),
});

const GatewayStatusSchema = z.object({
  status: z.enum(['running', 'stopped', 'error']),
  version: z.string().optional(),
  uptime: z.number().optional(),
  connectedServers: z.number().optional(),
});

// =============================================================================
// Docker MCP Client Class
// Docker MCP CLIコマンドの安全な実行を提供
// =============================================================================

export class DockerMCPClient {
  private readonly defaultOptions: SafeExecuteOptions;

  constructor(options: SafeExecuteOptions = {}) {
    this.defaultOptions = {
      ...QUICK_OPTIONS,
      ...options,
    };
  }

  /**
   * MCPサーバー一覧の取得
   */
  async listServers(): Promise<MCPServer[]> {
    try {
      const result = await executeDockerMcpCommand('list', [], {
        ...this.defaultOptions,
        timeout: 15000, // リスト取得は短時間で完了するべき
      });

      if (!result.success) {
        throw this.createCommandError('LIST_SERVERS_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, ServerListResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid server list response', parseResult.error);
      }

      // CLI応答をMCPServerモデルに変換
      return parseResult.data.servers.map(server => this.mapServerFromCli(server));
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('listServers', error);
    }
  }

  /**
   * MCPサーバー詳細情報の取得
   */
  async getServerDetails(id: string): Promise<MCPServer> {
    this.validateServerId(id);

    try {
      const result = await executeDockerMcpCommand('details', [id], {
        ...this.defaultOptions,
        timeout: 20000,
      });

      if (!result.success) {
        if (result.exitCode === 1 && result.stderr.includes('not found')) {
          throw this.createNotFoundError(`Server with ID ${id} not found`);
        }
        throw this.createCommandError('GET_SERVER_DETAILS_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, ServerDetailsResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid server details response', parseResult.error);
      }

      return this.mapServerDetailsFromCli(parseResult.data);
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('getServerDetails', error);
    }
  }

  /**
   * MCPサーバーの有効化（非同期操作）
   */
  async enableServer(id: string): Promise<JobResponse> {
    this.validateServerId(id);

    try {
      const result = await executeDockerMcpCommand('enable', [id], {
        ...LONG_RUNNING_OPTIONS,
        timeout: 60000, // サーバー有効化は時間がかかる可能性
      });

      if (!result.success) {
        throw this.createCommandError('ENABLE_SERVER_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, JobResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid enable server response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('enableServer', error);
    }
  }

  /**
   * MCPサーバーの無効化（非同期操作）
   */
  async disableServer(id: string): Promise<JobResponse> {
    this.validateServerId(id);

    try {
      const result = await executeDockerMcpCommand('disable', [id], {
        ...this.defaultOptions,
        timeout: 45000, // 無効化は有効化より早い
      });

      if (!result.success) {
        throw this.createCommandError('DISABLE_SERVER_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, JobResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid disable server response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('disableServer', error);
    }
  }

  /**
   * MCPゲートウェイの開始（非同期操作）
   */
  async startGateway(): Promise<JobResponse> {
    try {
      const result = await executeDockerMcpCommand('gateway', ['start'], {
        ...LONG_RUNNING_OPTIONS,
        timeout: 120000, // ゲートウェイ起動は時間がかかる
      });

      if (!result.success) {
        throw this.createCommandError('START_GATEWAY_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, JobResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid start gateway response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('startGateway', error);
    }
  }

  /**
   * MCPゲートウェイの停止（非同期操作）
   */
  async stopGateway(): Promise<JobResponse> {
    try {
      const result = await executeDockerMcpCommand('gateway', ['stop'], {
        ...this.defaultOptions,
        timeout: 60000, // 停止は開始より早い
      });

      if (!result.success) {
        throw this.createCommandError('STOP_GATEWAY_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, JobResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid stop gateway response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('stopGateway', error);
    }
  }

  /**
   * MCPサーバーのログ取得
   */
  async getServerLogs(id: string, options?: {
    lines?: number;
    since?: string;
    follow?: boolean;
  }): Promise<string[]> {
    this.validateServerId(id);

    const args = [id];
    
    if (options?.lines) {
      args.push('--lines', options.lines.toString());
    }
    
    if (options?.since) {
      args.push('--since', options.since);
    }

    try {
      const result = await executeDockerMcpCommand('logs', args, {
        ...this.defaultOptions,
        timeout: options?.follow ? 0 : 30000, // followの場合はタイムアウトなし
      });

      if (!result.success) {
        throw this.createCommandError('GET_SERVER_LOGS_FAILED', result.stderr, result.exitCode);
      }

      // ログは単純な行配列として返される
      return result.stdout.split('\n').filter(line => line.trim() !== '');
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('getServerLogs', error);
    }
  }

  /**
   * MCPサーバーツールのテスト実行（非同期操作）
   */
  async testServerTool(id: string, toolName: string, input: any): Promise<JobResponse> {
    this.validateServerId(id);
    this.validateToolName(toolName);

    try {
      // inputをJSON文字列として渡す
      const inputJson = JSON.stringify(input);
      const args = [id, toolName, '--input', inputJson];

      const result = await executeDockerMcpCommand('test', args, {
        ...LONG_RUNNING_OPTIONS,
        timeout: 180000, // ツールテストは長時間実行される可能性
      });

      if (!result.success) {
        throw this.createCommandError('TEST_SERVER_TOOL_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, JobResponseSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid test tool response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('testServerTool', error);
    }
  }

  /**
   * ゲートウェイのステータス取得
   */
  async getGatewayStatus(): Promise<{ status: string; uptime?: number; connectedServers?: number }> {
    try {
      const result = await executeDockerMcpCommand('gateway', ['status'], {
        ...this.defaultOptions,
        timeout: 10000,
      });

      if (!result.success) {
        throw this.createCommandError('GET_GATEWAY_STATUS_FAILED', result.stderr, result.exitCode);
      }

      const parseResult = safeParseJsonResponse(result.stdout, GatewayStatusSchema);
      if (!parseResult.success) {
        throw this.createParseError('Invalid gateway status response', parseResult.error);
      }

      return parseResult.data;
    } catch (error) {
      if (this.isCommandError(error)) {
        throw error;
      }
      throw this.createUnexpectedError('getGatewayStatus', error);
    }
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  private mapServerFromCli(cliServer: z.infer<typeof DockerMcpServerSchema>): MCPServer {
    return {
      id: cliServer.id,
      name: cliServer.name,
      image: cliServer.image,
      status: cliServer.status,
      version: cliServer.version || '',
      description: cliServer.description || '',
      tools: [], // 詳細情報では別途取得
      resources: [], // 詳細情報では別途取得
      prompts: [], // 詳細情報では別途取得
      configuration: {
        id: `config-${cliServer.id}`,
        serverId: cliServer.id,
        environment: cliServer.environment || {},
        enabledTools: [],
        secrets: [],
        resourceLimits: {},
        networkConfig: {
          mode: 'bridge',
          ports: cliServer.ports || [],
        },
      },
      createdAt: cliServer.created ? new Date(cliServer.created) : new Date(),
      updatedAt: cliServer.updated ? new Date(cliServer.updated) : new Date(),
    };
  }

  private mapServerDetailsFromCli(cliDetails: z.infer<typeof ServerDetailsResponseSchema>): MCPServer {
    const baseServer = this.mapServerFromCli(cliDetails.server);
    
    return {
      ...baseServer,
      tools: (cliDetails.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: {}, // CLIからは取得できない場合のデフォルト
        enabled: tool.enabled,
      })),
      resources: (cliDetails.resources || []).map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      })),
    };
  }

  private validateServerId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw this.createValidationError('Server ID must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw this.createValidationError('Server ID contains invalid characters');
    }
    if (id.length > 100) {
      throw this.createValidationError('Server ID too long (max 100 characters)');
    }
  }

  private validateToolName(toolName: string): void {
    if (!toolName || typeof toolName !== 'string') {
      throw this.createValidationError('Tool name must be a non-empty string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(toolName)) {
      throw this.createValidationError('Tool name contains invalid characters');
    }
    if (toolName.length > 100) {
      throw this.createValidationError('Tool name too long (max 100 characters)');
    }
  }

  private createCommandError(code: string, stderr: string, exitCode?: number): CommandError {
    return {
      code,
      message: `Docker MCP command failed: ${stderr || 'Unknown error'}`,
      exitCode,
      stderr,
      context: {
        command: 'docker',
        args: ['mcp'],
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
        args: ['mcp'],
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
        args: ['mcp'],
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
        args: ['mcp'],
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
        args: ['mcp'],
        timeout: this.defaultOptions.timeout || 30000,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private isCommandError(error: any): error is CommandError {
    return error && typeof error === 'object' && 'code' in error && 'message' in error;
  }
}