import { NextRequest, NextResponse } from 'next/server';
import { getServerRepository } from '@/db/repositories';

// =============================================================================
// サーバー設定エクスポート API エンドポイント
// サーバー設定をJSONフォーマットでエクスポート
// =============================================================================

/**
 * インストールコマンドを解析してインストール情報を抽出
 */
function parseInstallCommand(command: string): {
  dockerImage?: string;
  dockerTag?: string;
  dockerPorts?: string;
  npmPackage?: string;
  npmVersion?: string;
  githubUrl?: string;
  githubBranch?: string;
} {
  const result: any = {};

  // Dockerコマンドの解析
  if (command.includes('docker run')) {
    const dockerMatch = command.match(/docker run.*?([a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+):?([a-zA-Z0-9-_.]*)/);
    if (dockerMatch) {
      result.dockerImage = dockerMatch[1];
      result.dockerTag = dockerMatch[2] || 'latest';
    }
  }

  // NPMコマンドの解析
  if (command.includes('npm install')) {
    const npmMatch = command.match(/npm install\s+([a-zA-Z0-9-_./@]+)(?:@([a-zA-Z0-9-_.]+))?/);
    if (npmMatch) {
      result.npmPackage = npmMatch[1];
      result.npmVersion = npmMatch[2] || 'latest';
    }
  }

  return result;
}

export interface ExportedServer {
  name: string;
  description: string;
  installationType: string;
  dockerImage?: string;
  dockerTag?: string;
  dockerPorts?: string;
  npmPackage?: string;
  npmVersion?: string;
  githubUrl?: string;
  githubBranch?: string;
  buildCommand?: string;
  existingContainerId?: string;
  exposedPort: number;
  environmentVars: Record<string, string>;
  autoStart: boolean;
  resourceLimits: {
    memory: string;
    cpus: string;
  };
  tools: Array<{name: string; description: string; inputSchema: any; enabled: boolean}>;
  resources: Array<{uri: string; name: string; description?: string; mimeType?: string; metadata?: Record<string, any>}>;
  prompts: Array<{name: string; description?: string; arguments?: any; metadata?: Record<string, any>}>;
  // メタデータ
  exportedAt: string;
  exportVersion: string;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  servers: ExportedServer[];
  metadata: {
    totalServers: number;
    exportedBy: string;
    exportSource: string;
  };
}

/**
 * サーバー設定をJSONでエクスポート
 * GET /api/v1/servers/export
 *
 * Query Parameters:
 * - ids: カンマ区切りのサーバーID (省略時は全サーバー)
 * - format: 出力フォーマット (json, yaml) - 現在はjsonのみサポート
 * - includeSecrets: 機密情報を含めるか (false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    const format = searchParams.get('format') || 'json';
    const includeSecrets = searchParams.get('includeSecrets') === 'true';

    // 現在はJSONのみサポート
    if (format !== 'json') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'EXPORT_001',
            message: '現在はJSONフォーマットのみサポートしています'
          }
        },
        { status: 400 }
      );
    }

    const serverRepository = getServerRepository();
    let servers;

    if (idsParam) {
      // 指定されたIDのサーバーのみエクスポート
      const ids = idsParam.split(',').map(id => id.trim());
      servers = [];
      for (const id of ids) {
        try {
          const server = await serverRepository.findById(id);
          if (server) {
            servers.push(server);
          }
        } catch (error) {
          console.warn(`Server with ID ${id} not found for export`);
        }
      }
    } else {
      // 全サーバーをエクスポート
      const result = await serverRepository.findAllWithBasicDetails({
        page: 1,
        limit: 1000, // 大きな値を設定して全件取得
        sortBy: 'name',
        sortOrder: 'asc'
      });
      servers = result.data;
    }

    // エクスポート用データの変換
    const exportedServers: ExportedServer[] = servers.map(server => {
      const exported: ExportedServer = {
        name: server.name,
        description: server.description || '',
        installationType: server.installType || 'docker',
        exposedPort: server.port || 8080,
        environmentVars: includeSecrets ? (server.environment || {}) : filterSecrets(server.environment || {}),
        autoStart: false, // デフォルト値
        resourceLimits: {
          memory: server.resourceLimits?.memory || '512m',
          cpus: server.resourceLimits?.cpus || '0.5'
        },
        tools: (server.tools || []).map(tool => typeof tool === 'string' ? {name: tool, description: '', inputSchema: {}, enabled: true} : tool),
        resources: (server.resources || []).map(resource => typeof resource === 'string' ? {uri: resource, name: resource} : resource),
        prompts: (server.prompts || []).map(prompt => typeof prompt === 'string' ? {name: prompt} : prompt),
        exportedAt: new Date().toISOString(),
        exportVersion: '1.0'
      };

      // インストール設定の追加 - MCPServerのinstallCommand属性を利用
      if (server.installCommand) {
        // installCommandを解析してインストール情報を抽出
        const installInfo = parseInstallCommand(server.installCommand);

        if (server.installType === 'docker') {
          exported.dockerImage = installInfo.dockerImage;
          exported.dockerTag = installInfo.dockerTag;
          exported.dockerPorts = installInfo.dockerPorts;
        } else if (server.installType === 'npm') {
          exported.npmPackage = installInfo.npmPackage;
          exported.npmVersion = installInfo.npmVersion;
        } else if (server.installType === 'uvx' || server.installType === 'pip') {
          exported.githubUrl = installInfo.githubUrl;
          exported.githubBranch = installInfo.githubBranch;
          exported.buildCommand = server.installCommand;
        }
      }

      return exported;
    });

    // エクスポートデータの作成
    const exportData: ExportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      servers: exportedServers,
      metadata: {
        totalServers: exportedServers.length,
        exportedBy: 'Docker MCP Web Manager v2',
        exportSource: 'web-interface'
      }
    };

    // レスポンスヘッダーの設定
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Content-Disposition', `attachment; filename="mcp-servers-export-${new Date().toISOString().split('T')[0]}.json"`);

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Failed to export servers:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EXPORT_002',
          message: 'サーバー設定のエクスポートに失敗しました'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * 機密情報をフィルタリング
 */
function filterSecrets(env: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  const secretKeywords = ['password', 'secret', 'key', 'token', 'api_key', 'auth'];

  for (const [key, value] of Object.entries(env)) {
    const lowerKey = key.toLowerCase();
    const isSecret = secretKeywords.some(keyword => lowerKey.includes(keyword));

    if (isSecret) {
      filtered[key] = '[FILTERED]';
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}