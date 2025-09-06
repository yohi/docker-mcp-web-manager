// =============================================================================
// Docker MCP Integration Layer
// タスク3: Docker MCPとの統合を提供する包括的なAPIレイヤー
// =============================================================================

// Docker MCP クライアント
export { DockerMCPClient } from './docker-mcp-client';
export { CatalogClient } from './catalog-client';

// セキュリティユーティリティ
export {
  validateCommandArguments,
  safeParseJsonResponse,
  executeWithRetry,
  safeExecuteCommand,
  executeDockerMcpCommand,
  LONG_RUNNING_OPTIONS,
  QUICK_OPTIONS,
  type CommandResult,
  type CommandError,
  type SafeExecuteOptions,
  type DockerMcpCommand,
} from '../utils/command-security';

// セキュアファイルアクセス
export {
  normalizeAndValidatePath,
  validateDirectoryAccess,
  validateFileTypeAndExtension,
  validateFileExistenceAndSize,
  resolveAndValidateRealPath,
  sanitizeFileName,
  generateSecureHeaders,
  validateFileContent,
  secureFileAccess,
  logFileAccess,
  type SecureFileAccessResult,
  type SecureDownloadHeaders,
} from '../utils/secure-file-access';

// SSE セキュリティ
export {
  SSESecurityManager,
  sseSecurityManager,
  type SSEConnectionState,
  type SSEMessage,
  type SSEConnectionInfo,
} from '../utils/sse-security';

// 統合クライアント（全機能を提供するファサード）
export class DockerMCPManager {
  public readonly servers: DockerMCPClient;
  public readonly catalog: CatalogClient;

  constructor(options?: {
    serverOptions?: ConstructorParameters<typeof DockerMCPClient>[0];
    catalogOptions?: ConstructorParameters<typeof CatalogClient>[0];
  }) {
    this.servers = new DockerMCPClient(options?.serverOptions);
    this.catalog = new CatalogClient(options?.catalogOptions);
  }

  /**
   * システム全体のヘルスチェック
   */
  async healthCheck(): Promise<{
    servers: boolean;
    catalog: boolean;
    gateway: boolean;
    timestamp: string;
  }> {
    try {
      const [serversHealth, gatewayHealth] = await Promise.allSettled([
        this.servers.listServers(),
        this.servers.getGatewayStatus(),
      ]);

      const [catalogHealth] = await Promise.allSettled([
        this.catalog.getCategories(),
      ]);

      return {
        servers: serversHealth.status === 'fulfilled',
        catalog: catalogHealth.status === 'fulfilled',
        gateway: gatewayHealth.status === 'fulfilled' && 
                gatewayHealth.value.status === 'running',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        servers: false,
        catalog: false,
        gateway: false,
        timestamp: new Date().toISOString(),
      };
    }
  }
}