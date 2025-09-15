import { NextRequest, NextResponse } from 'next/server';
import { getServerRepository } from '@/db/repositories';

/**
 * エクスポートされたサーバー設定からインストールコマンドを生成
 */
function generateInstallCommand(exported: any): string {
  switch (exported.installationType) {
    case 'docker':
      return `docker run -d ${exported.dockerImage}:${exported.dockerTag || 'latest'}`;
    case 'npm':
      return `npm install ${exported.npmPackage}${exported.npmVersion ? '@' + exported.npmVersion : ''}`;
    case 'github':
      return `git clone ${exported.githubUrl} && cd $(basename ${exported.githubUrl} .git) && ${exported.buildCommand || 'npm install'}`;
    case 'existing':
      return `docker start ${exported.existingContainerId}`;
    default:
      return 'echo "No install command available"';
  }
}
import { MCPServer } from '@/types/models';
import { ExportData, ExportedServer } from '../export/route';

// =============================================================================
// サーバー設定インポート API エンドポイント
// JSONフォーマットのサーバー設定をインポート
// =============================================================================

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  details: {
    imported: string[];
    skipped: Array<{ name: string; reason: string }>;
    failed: Array<{ name: string; error: string }>;
  };
}

/**
 * サーバー設定をJSONからインポート
 * POST /api/v1/servers/import
 *
 * Body: ExportData または ExportedServer[]
 * Query Parameters:
 * - overwrite: 同名サーバーを上書きするか (false)
 * - validate: インポート前にバリデーションのみ実行 (false)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const overwrite = searchParams.get('overwrite') === 'true';
    const validateOnly = searchParams.get('validate') === 'true';

    const body = await request.json();

    // データ形式の検証
    let servers: ExportedServer[];

    if (Array.isArray(body)) {
      // 直接サーバー配列の場合
      servers = body;
    } else if (body.servers && Array.isArray(body.servers)) {
      // ExportData形式の場合
      const exportData = body as ExportData;
      servers = exportData.servers;

      // バージョンチェック
      if (exportData.version !== '1.0') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'IMPORT_001',
              message: `サポートされていないエクスポートバージョンです: ${exportData.version}`
            }
          },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMPORT_002',
            message: '無効なインポートデータ形式です'
          }
        },
        { status: 400 }
      );
    }

    if (!servers || servers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMPORT_003',
            message: 'インポートするサーバーが見つかりません'
          }
        },
        { status: 400 }
      );
    }

    // バリデーションとインポート処理
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      failed: 0,
      details: {
        imported: [],
        skipped: [],
        failed: []
      }
    };

    const serverRepository = getServerRepository();

    for (const exportedServer of servers) {
      try {
        // 基本バリデーション
        const validation = validateServer(exportedServer);
        if (!validation.valid) {
          result.failed++;
          result.details.failed.push({
            name: exportedServer.name || 'Unknown',
            error: validation.error || '不明なエラー'
          });
          continue;
        }

        // 同名サーバーの存在確認
        const existingServer = await serverRepository.findByName(exportedServer.name);
        if (existingServer && !overwrite) {
          result.skipped++;
          result.details.skipped.push({
            name: exportedServer.name,
            reason: '同名のサーバーが既に存在します'
          });
          continue;
        }

        // バリデーションのみの場合はスキップ
        if (validateOnly) {
          result.imported++;
          result.details.imported.push(exportedServer.name);
          continue;
        }

        // サーバーデータの変換
        const serverData = convertToServerData(exportedServer);

        if (existingServer && overwrite) {
          // 上書きの場合は削除してから作成
          await serverRepository.deleteServer(existingServer.id);
        }

        // サーバーの作成
        const newServer = await serverRepository.createServer(serverData);

        result.imported++;
        result.details.imported.push(newServer.name);

      } catch (error) {
        console.error(`Failed to import server ${exportedServer.name}:`, error);
        result.failed++;
        result.details.failed.push({
          name: exportedServer.name || 'Unknown',
          error: error instanceof Error ? error.message : '不明なエラー'
        });
      }
    }

    // 結果の判定
    if (result.failed === 0) {
      result.success = true;
    } else if (result.imported > 0) {
      result.success = true; // 一部成功
    } else {
      result.success = false; // 全失敗
    }

    const statusCode = result.success ? (validateOnly ? 200 : 201) : 400;
    const message = validateOnly
      ? 'インポートデータの検証が完了しました'
      : `${result.imported}個のサーバーをインポートしました`;

    return NextResponse.json(
      {
        success: result.success,
        message,
        data: result
      },
      { status: statusCode }
    );

  } catch (error) {
    console.error('Failed to import servers:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'IMPORT_004',
          message: 'サーバー設定のインポートに失敗しました'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * エクスポートされたサーバーをMCPServerデータに変換
 */
function convertToServerData(exported: ExportedServer): Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'> {
  // インストール方法に応じたイメージ名の決定
  let finalImage = '';
  let finalVersion = 'latest';

  switch (exported.installationType) {
    case 'docker':
      finalImage = exported.dockerImage || '';
      if (exported.dockerTag) {
        finalImage += `:${exported.dockerTag}`;
        finalVersion = exported.dockerTag;
      }
      break;
    case 'npm':
      finalImage = 'node:alpine';
      finalVersion = exported.npmVersion || 'latest';
      break;
    case 'github':
      finalImage = 'node:alpine';
      finalVersion = 'latest';
      break;
    case 'existing':
      finalImage = 'existing-container';
      finalVersion = 'existing';
      break;
    default:
      finalImage = 'unknown';
  }

  return {
    name: exported.name,
    image: finalImage,
    description: exported.description || '',
    version: finalVersion,
    port: exported.exposedPort,
    status: 'stopped',
    environment: exported.environmentVars || {},
    installType: exported.installationType as any,
    installCommand: generateInstallCommand(exported),
    resourceLimits: exported.resourceLimits || {
      memory: '512m',
      cpus: '0.5'
    },
    tools: (exported.tools || []).map(tool => typeof tool === 'string' ? {name: tool, description: '', inputSchema: {type: 'object', properties: {}}, enabled: true} : tool),
    resources: (exported.resources || []).map(resource => typeof resource === 'string' ? {uri: resource, name: resource} : resource),
    prompts: (exported.prompts || []).map(prompt => typeof prompt === 'string' ? {name: prompt} : prompt),
    configuration: {
      id: '',
      serverId: '',
      environment: exported.environmentVars || {},
      enabledTools: [],
      secrets: [],
      resourceLimits: exported.resourceLimits || {
        memory: '512m',
        cpus: '0.5'
      },
      networkConfig: {
        mode: 'bridge'
      }
    }
  };
}

/**
 * サーバーデータのバリデーション
 */
function validateServer(exported: ExportedServer): { valid: boolean; error?: string } {
  if (!exported.name || exported.name.trim() === '') {
    return { valid: false, error: 'サーバー名は必須です' };
  }

  if (!exported.installationType) {
    return { valid: false, error: 'インストールタイプは必須です' };
  }

  if (!['docker', 'npm', 'github', 'existing', 'uvx', 'pip', 'npx', 'local_script'].includes(exported.installationType)) {
    return { valid: false, error: '無効なインストールタイプです' };
  }

  // インストールタイプ別バリデーション
  switch (exported.installationType) {
    case 'docker':
      if (!exported.dockerImage) {
        return { valid: false, error: 'Dockerイメージは必須です' };
      }
      break;
    case 'npm':
      if (!exported.npmPackage) {
        return { valid: false, error: 'NPMパッケージ名は必須です' };
      }
      break;
    case 'github':
      if (!exported.githubUrl || !exported.buildCommand) {
        return { valid: false, error: 'GitHubリポジトリURLとビルドコマンドは必須です' };
      }
      break;
    case 'existing':
      if (!exported.existingContainerId) {
        return { valid: false, error: '既存のコンテナIDは必須です' };
      }
      break;
  }

  if (!exported.exposedPort || exported.exposedPort < 1 || exported.exposedPort > 65535) {
    return { valid: false, error: 'ポート番号は1-65535の範囲で指定してください' };
  }

  return { valid: true };
}