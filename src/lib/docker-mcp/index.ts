// Docker MCP統合層のエクスポート
export { DockerMCPClient } from './docker-mcp-client';
export { CatalogClient } from './catalog-client';

// スキーマとタイプのエクスポート
export type {
  MCPServer,
  JobResponse,
  JobStatus,
  TestResult,
  CatalogEntry,
  CatalogResponse,
  LogEntry,
  LogsResponse,
  GatewayStatus,
  DockerMCPError,
  AllowedDockerMCPCommand,
  DockerMCPCommandArgs,
} from '../schemas/docker-mcp-schemas';

// ユーティリティ関数のエクスポート
export {
  sanitizeString,
  validateDockerMCPCommand,
  validateAndSanitizeArgs,
  buildSecureCommandArray,
  validateFilePath,
  validateEnvironmentVariableName,
} from '../utils/command-security';

export {
  ProcessExecutor,
  type ProcessExecutionOptions,
  type ProcessResult,
  type ProcessError,
} from '../utils/process-executor';

// シングルトンインスタンス取得用のヘルパー関数
let dockerMCPClientInstance: DockerMCPClient | null = null;
let catalogClientInstance: CatalogClient | null = null;

/**
 * DockerMCPClientのシングルトンインスタンスを取得
 */
export function getDockerMCPClient(): DockerMCPClient {
  if (!dockerMCPClientInstance) {
    dockerMCPClientInstance = DockerMCPClient.getInstance();
  }
  return dockerMCPClientInstance;
}

/**
 * CatalogClientのシングルトンインスタンスを取得
 */
export function getCatalogClient(): CatalogClient {
  if (!catalogClientInstance) {
    catalogClientInstance = CatalogClient.getInstance();
  }
  return catalogClientInstance;
}

/**
 * 全てのクライアントインスタンスをリセット（テスト用）
 */
export function resetClients(): void {
  dockerMCPClientInstance = null;
  catalogClientInstance = null;
}