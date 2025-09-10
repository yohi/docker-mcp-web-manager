import { NextRequest, NextResponse } from 'next/server';
import { getServerRepository } from '@/db/repositories';
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
    const total = result.total;

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

    // 入力バリデーション
    const { name, image, description, version, port, environment, resourceLimits } = body;

    if (!name || !image || !port) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_002',
            message: '必須フィールドが不足しています (name, image, port)'
          }
        },
        { status: 400 }
      );
    }

    // ポート番号の検証
    if (port < 1 || port > 65535) {
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

    // サーバーデータの作成
    const serverData: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      image,
      description: description || '',
      version: version || 'latest',
      port,
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