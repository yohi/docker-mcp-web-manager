import { NextRequest, NextResponse } from 'next/server';
import { getServerRepository } from '@/db/repositories';
import { MCPServer } from '@/types/models';

// =============================================================================
// サーバー管理 API エンドポイント
// CRUD操作とサーバー管理機能を提供
// 開発環境とプロダクション環境の両方に対応
// 監視・ログ機能統合バージョン
// =============================================================================

/**
 * サーバー一覧取得
 * GET /api/v1/servers
 *
 * @param request - NextRequest
 * @returns サーバー一覧データ（ページネーション付き）
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // URL検索パラメータの解析
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '20')), 100);
    const sortBy = searchParams.get('sort_by') ?? 'updatedAt';
    const sortOrder = (searchParams.get('sort_order') ?? 'desc') as 'asc' | 'desc';
    const search = searchParams.get('search') ?? '';
    const status = searchParams.get('status') ?? 'all';

    // サーバーリポジトリからデータ取得
    const serverRepository = getServerRepository();

    // 検索・フィルター条件の構築
    const filters: any = {};
    if (search) {
      filters.search = search;
    }
    if (status !== 'all') {
      filters.status = status;
    }

    // データベースからサーバー一覧を取得
    const result = await serverRepository.findAllWithBasicDetails({
      page,
      limit,
      sortBy,
      sortOrder,
      filters
    });

    const servers = result.data || [];
    const total = result.total || 0;

    const duration = Date.now() - startTime;

    // 監視・ログ情報の追加（task10で追加された機能）
    console.log(`[API_LOG] GET /api/v1/servers - ${requestId} - ${duration}ms - ${servers.length} results`);

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      data: servers,
      metadata: {
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        monitoring: {
          responseTime: duration,
          resultCount: servers.length,
          cacheHit: false // 将来のキャッシュ機能用
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[API_ERROR] GET /api/v1/servers:', error);
    console.error(`[API_LOG] GET /api/v1/servers - ${requestId} - ERROR - ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_001',
          message: 'サーバー一覧の取得に失敗しました',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          duration,
          monitoring: {
            responseTime: duration,
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
          }
        }
      },
      { status: 500 }
    );
  }
}

/**
 * 新しいサーバー作成
 * POST /api/v1/servers
 *
 * @param request - NextRequest（JSON bodyを含む）
 * @returns 作成されたサーバー情報
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // リクエストボディの解析
    const body = await request.json();
    const { name, image, description, version, port, environment, resourceLimits } = body;

    // 基本バリデーション
    const validationErrors: string[] = [];

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      validationErrors.push('サーバー名は必須です');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) {
      validationErrors.push('サーバー名は英数字、ハイフン、アンダースコアのみ使用可能です');
    } else if (name.trim().length > 50) {
      validationErrors.push('サーバー名は50文字以下で入力してください');
    }

    if (!image || typeof image !== 'string' || image.trim().length === 0) {
      validationErrors.push('Dockerイメージは必須です');
    }

    if (!port || typeof port !== 'number') {
      validationErrors.push('ポート番号は必須です');
    } else if (port < 1 || port > 65535) {
      validationErrors.push('ポート番号は1-65535の範囲で指定してください');
    }

    // バリデーションエラーがある場合
    if (validationErrors.length > 0) {
      console.log(`[API_LOG] POST /api/v1/servers - ${requestId} - VALIDATION_ERROR - ${validationErrors.join(', ')}`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_002',
            message: '入力データが無効です',
            details: validationErrors
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
            monitoring: {
              validationErrors: validationErrors.length,
              errorType: 'ValidationError'
            }
          }
        },
        { status: 400 }
      );
    }

    const serverName = name.trim();
    const serverImage = image.trim();

    // 同名サーバーの存在確認
    const serverRepository = getServerRepository();
    const existingServer = await serverRepository.findByName(serverName);

    if (existingServer) {
      console.log(`[API_LOG] POST /api/v1/servers - ${requestId} - DUPLICATE_NAME - ${serverName}`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_004',
            message: `サーバー名 '${serverName}' は既に使用されています`
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
            monitoring: {
              conflictField: 'name',
              conflictValue: serverName
            }
          }
        },
        { status: 409 }
      );
    }

    // サーバーデータの構築
    const serverData: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'> = {
      name: serverName,
      image: serverImage,
      description: description?.trim() || '',
      version: version?.trim() || 'latest',
      port: port,
      status: 'stopped',
      enabled: true,
      environment: environment || {},
      resourceLimits: {
        memory: resourceLimits?.memory || '512m',
        cpu: resourceLimits?.cpu || '0.5',
        ...resourceLimits
      },
      networkSettings: {
        ports: {
          [port]: port
        }
      },
      healthStatus: 'unknown',
      lastHealthCheck: null,
      uptime: 0,
      resourceUsage: {
        cpu: 0,
        memory: 0,
        memoryLimit: 0,
        networkIn: 0,
        networkOut: 0
      }
    };

    // データベースに保存
    const newServer = await serverRepository.createServer(serverData);

    // 設定情報の作成（将来実装予定）
    if (serverData.configuration) {
      // const configRepository = new ConfigurationRepository();
      // await configRepository.create({
      //   serverId: newServer.id,
      //   environment: serverData.configuration.environment || {},
      //   enabledTools: serverData.configuration.enabledTools || [],
      //   resourceLimits: serverData.configuration.resourceLimits || {},
      //   networkConfig: serverData.configuration.networkConfig || { mode: 'bridge' },
      // });
      console.log('[CONFIG_CREATE] Configuration creation not yet implemented for server:', newServer.id);
    }

    // Docker MCPでサーバーをインストール
    try {
      // ここでは作成のみで、実際のインストールは別途カタログAPIで実行
      console.log(`[SERVER_CREATED] New server created: ${newServer.id}`);
    } catch (error) {
      console.warn('[SERVER_WARNING] Docker MCP integration failed:', error);
    }

    const duration = Date.now() - startTime;

    // 監視・ログ情報の追加
    console.log(`[API_LOG] POST /api/v1/servers - ${requestId} - SUCCESS - ${duration}ms - ${newServer.id}`);

    // 成功レスポンス
    return NextResponse.json(
      {
        success: true,
        data: newServer,
        message: 'サーバーが正常に作成されました',
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          duration,
          monitoring: {
            responseTime: duration,
            createdServerId: newServer.id,
            operationType: 'create'
          }
        }
      },
      { status: 201 }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[API_ERROR] POST /api/v1/servers:', error);
    console.error(`[API_LOG] POST /api/v1/servers - ${requestId} - ERROR - ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_005',
          message: 'サーバーの作成に失敗しました',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
        },
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          duration,
          monitoring: {
            responseTime: duration,
            errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
            operationType: 'create'
          }
        }
      },
      { status: 500 }
    );
  }
}
