import { NextRequest, NextResponse } from 'next/server';
import { getServerRepository } from '@/db/repositories';
import { initializeDatabase } from '@/db/connection';

/**
 * パラメータからインストールコマンドを生成
 */
function generateInstallCommandFromParams(params: {
  installationType?: string;
  dockerImage?: string;
  dockerTag?: string;
  npmPackage?: string;
  npmVersion?: string;
  npxPackage?: string;
  npxArgs?: string;
  uvxPackage?: string;
  uvxArgs?: string;
  pipPackage?: string;
  pipVersion?: string;
  pythonVersion?: string;
  scriptPath?: string;
  scriptArgs?: string;
  interpreter?: string;
  githubUrl?: string;
  githubBranch?: string;
  buildCommand?: string;
  existingContainerId?: string;
}): string {
  switch (params.installationType) {
    case 'docker':
      return `docker run -d ${params.dockerImage}:${params.dockerTag || 'latest'}`;
    case 'npm':
      return `npm install ${params.npmPackage}${params.npmVersion ? '@' + params.npmVersion : ''}`;
    case 'npx':
      return `npx ${params.npxPackage}${params.npxArgs ? ' ' + params.npxArgs : ''}`;
    case 'uvx':
      return `uvx ${params.uvxPackage}${params.uvxArgs ? ' ' + params.uvxArgs : ''}`;
    case 'pip':
      const pipCmd = `pip install ${params.pipPackage}${params.pipVersion && params.pipVersion !== 'latest' ? '==' + params.pipVersion : ''}`;
      return params.pythonVersion ? `python${params.pythonVersion} -m ${pipCmd}` : pipCmd;
    case 'local_script':
      const interpreter = params.interpreter || 'python';
      const args = params.scriptArgs ? ' ' + params.scriptArgs : '';
      return `${interpreter} ${params.scriptPath}${args}`;
    case 'github':
      return `git clone ${params.githubUrl} && cd $(basename ${params.githubUrl} .git) && ${params.buildCommand || 'npm install'}`;
    case 'existing':
      return `docker start ${params.existingContainerId}`;
    default:
      return 'echo "No install command available"';
  }
}
import { MCPServer } from '@/types/models';

// =============================================================================
// サーバー管理 API エンドポイント
// CRUD操作とサーバー管理機能を提供
// =============================================================================

/**
 * サーバー一覧取得
 * GET /api/v1/servers
 */
export async function GET(request: NextRequest) {
  try {
    // データベース初期化を確実に実行
    await initializeDatabase();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
    const sortBy = searchParams.get('sort_by') ?? 'createdAt';
    const sortOrder = searchParams.get('sort_order') ?? 'desc';

    const serverRepository = getServerRepository();
    const result = await serverRepository.findAllWithBasicDetails({
      page,
      limit,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc'
    });

    const servers = result.data;
    const total = result.pagination.total;

    return NextResponse.json({
      success: true,
      data: servers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Failed to fetch servers:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_001',
          message: 'サーバー一覧の取得に失敗しました'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * 新しいサーバー作成
 * POST /api/v1/servers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 新しいフォーム構造からのデータ抽出
    const {
      name,
      description,
      installationType,
      // Docker関連
      dockerImage,
      dockerTag,
      dockerPorts,
      dockerEnvVars,
      // NPM関連
      npmPackage,
      npmVersion,
      // NPX関連
      npxPackage,
      npxArgs,
      // UVX関連
      uvxPackage,
      uvxArgs,
      // PIP関連
      pipPackage,
      pipVersion,
      pythonVersion,
      // ローカルスクリプト関連
      scriptPath,
      scriptArgs,
      interpreter,
      // GitHub関連
      githubUrl,
      githubBranch,
      buildCommand,
      // 既存コンテナ関連
      existingContainerId,
      // 共通設定
      exposedPort,
      environmentVars,
      autoStart,
      // 後方互換性のため（古いフォームフィールド）
      image,
      port,
      environment
    } = body;

    // 基本バリデーション
    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_002',
            message: 'サーバー名は必須です'
          }
        },
        { status: 400 }
      );
    }

    if (!installationType && !image) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_002',
            message: 'インストール方法の選択は必須です'
          }
        },
        { status: 400 }
      );
    }

    // インストール方法別バリデーション
    if (installationType) {
      switch (installationType) {
        case 'docker':
          if (!dockerImage) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'Dockerイメージは必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'npm':
          if (!npmPackage) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'NPMパッケージ名は必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'npx':
          if (!npxPackage) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'NPXパッケージ名は必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'uvx':
          if (!uvxPackage) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'UVXパッケージ名は必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'pip':
          if (!pipPackage) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'PIPパッケージ名は必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'local_script':
          if (!scriptPath) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'スクリプトパスは必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'github':
          if (!githubUrl || !buildCommand) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: 'GitHubリポジトリURLとビルドコマンドは必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
        case 'existing':
          if (!existingContainerId) {
            return NextResponse.json(
              {
                success: false,
                error: {
                  code: 'SERVER_002',
                  message: '既存のコンテナIDは必須です'
                }
              },
              { status: 400 }
            );
          }
          break;
      }
    }

    // ポート番号の検証（新旧両方に対応）
    const finalPort = exposedPort || port || 3000;
    if (finalPort < 1 || finalPort > 65535) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_003',
            message: 'ポート番号は1-65535の範囲で指定してください'
          }
        },
        { status: 400 }
      );
    }

    // 同名サーバーの存在確認
    const serverRepository = getServerRepository();
    const existingServer = await serverRepository.findByName(name);
    if (existingServer) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_004',
            message: '同じ名前のサーバーが既に存在します'
          }
        },
        { status: 409 }
      );
    }

    // インストール方法に応じたイメージ名の決定
    let finalImage = image; // 後方互換性
    let finalVersion = 'latest';

    if (installationType) {
      switch (installationType) {
        case 'docker':
          finalImage = dockerImage + (dockerTag ? `:${dockerTag}` : ':latest');
          finalVersion = dockerTag || 'latest';
          break;
        case 'npm':
          finalImage = `node:alpine`; // NPMパッケージ実行用のベースイメージ
          finalVersion = npmVersion || 'latest';
          break;
        case 'npx':
          finalImage = `node:alpine`; // NPXパッケージ実行用のベースイメージ
          finalVersion = 'latest';
          break;
        case 'uvx':
          finalImage = `python:alpine`; // UVXパッケージ実行用のベースイメージ
          finalVersion = 'latest';
          break;
        case 'pip':
          finalImage = `python:alpine`; // PIPパッケージ実行用のベースイメージ
          finalVersion = pipVersion || 'latest';
          break;
        case 'local_script':
          finalImage = `python:alpine`; // ローカルスクリプト実行用のベースイメージ
          finalVersion = 'latest';
          break;
        case 'github':
          finalImage = `node:alpine`; // GitHubからビルドする場合のベースイメージ
          finalVersion = 'latest';
          break;
        case 'existing':
          finalImage = 'existing-container'; // 既存コンテナの場合
          finalVersion = 'existing';
          break;
      }
    }

    // 環境変数の処理（新旧両方に対応）
    const finalEnvironment = environmentVars || environment || {};

    // サーバーデータの作成
    const serverData: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      image: finalImage,
      description: description || '',
      version: finalVersion,
      port: finalPort,
      status: 'stopped',
      environment: finalEnvironment,
      installType: installationType || 'docker',
      // インストール方法固有の設定を保存
      installCommand: generateInstallCommandFromParams({
        installationType,
        dockerImage,
        dockerTag,
        npmPackage,
        npmVersion,
        npxPackage,
        npxArgs,
        uvxPackage,
        uvxArgs,
        pipPackage,
        pipVersion,
        pythonVersion,
        scriptPath,
        scriptArgs,
        interpreter,
        githubUrl,
        githubBranch,
        buildCommand,
        existingContainerId
      }),
      resourceLimits: {
        memory: '512m',
        cpus: '0.5'
      },
      tools: [],
      resources: [],
      prompts: [],
      configuration: {
        id: '',
        serverId: '',
        environment: finalEnvironment,
        enabledTools: [],
        secrets: [],
        resourceLimits: {
          memory: '512m',
          cpu: '0.5'
        },
        networkConfig: {
          mode: 'bridge'
        }
      }
    };

    // データベースに保存
    const newServer = await serverRepository.createServer(serverData);

    // 自動起動が有効な場合の処理（TODO: 後で実装）
    if (autoStart) {
      console.log(`Auto-start enabled for server: ${newServer.id}`);
      // TODO: サーバー起動処理を呼び出す
    }

    return NextResponse.json(
      {
        success: true,
        data: newServer,
        message: 'サーバーが正常に作成されました'
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Failed to create server:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_005',
          message: 'サーバーの作成に失敗しました'
        }
      },
      { status: 500 }
    );
  }
}
