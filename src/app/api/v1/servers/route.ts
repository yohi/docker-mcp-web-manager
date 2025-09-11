import { NextRequest, NextResponse } from 'next/server';
import { createSuccessResponse, createErrorResponse, processPagination } from '@/lib/api/response';

// モックデータ
let MOCK_SERVERS = [
  {
    id: '1',
    name: 'test-server-1',
    status: 'running' as const,
    image: 'node:latest',
    port: 3000,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'test-server-2',
    status: 'stopped' as const,
    image: 'nginx:latest',
    port: 8080,
    createdAt: '2024-01-02T00:00:00Z',
  },
];

// テスト用にモックデータをリセットする関数
export function resetMockServers() {
  MOCK_SERVERS = [
    {
      id: '1',
      name: 'test-server-1',
      status: 'running' as const,
      image: 'node:latest',
      port: 3000,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      name: 'test-server-2',
      status: 'stopped' as const,
      image: 'nginx:latest',
      port: 8080,
      createdAt: '2024-01-02T00:00:00Z',
    },
  ];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const { page, limit, offset } = processPagination(searchParams);

    // ページネーション適用
    const startIndex = offset;
    const endIndex = offset + limit;
    const paginatedServers = MOCK_SERVERS.slice(startIndex, endIndex);

    return createSuccessResponse(paginatedServers, {
      pagination: {
        page,
        limit,
        total: MOCK_SERVERS.length,
        totalPages: Math.ceil(MOCK_SERVERS.length / limit),
      },
    });
  } catch (error) {
    console.error('GET /api/v1/servers error:', error);
    return createErrorResponse(
      'SERVER_001',
      'サーバー一覧の取得に失敗しました',
      { statusCode: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 基本的なバリデーション
    if (!body.name || !body.image || !body.port) {
      return createErrorResponse(
        'SERVER_002',
        '必須フィールドが不足しています (name, image, port)',
        { statusCode: 400 }
      );
    }

    // ポート番号のバリデーション
    if (body.port < 1 || body.port > 65535) {
      return createErrorResponse(
        'SERVER_003',
        'ポート番号は1-65535の範囲で指定してください',
        { statusCode: 400 }
      );
    }

    // 重複チェック
    const existingServer = MOCK_SERVERS.find(s => s.name === body.name);
    if (existingServer) {
      return createErrorResponse(
        'SERVER_004',
        '同じ名前のサーバーが既に存在します',
        { statusCode: 409 }
      );
    }

    // 新しいサーバーを作成
    const newServer = {
      id: `server-${Date.now()}`,
      name: body.name,
      image: body.image,
      port: body.port,
      description: body.description || '',
      version: body.version || 'latest',
      status: 'stopped' as const,
      environment: body.environment || {},
      resourceLimits: body.resourceLimits || {
        memory: '512m',
        cpu: '0.5',
      },
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    // モックデータに追加（重複チェックのため）
    MOCK_SERVERS.push(newServer);

    return NextResponse.json({
      success: true,
      data: newServer,
      meta: {
        version: 'v1',
        requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/v1/servers error:', error);
    return createErrorResponse(
      'SERVER_005',
      'サーバーの作成に失敗しました',
      { statusCode: 500 }
    );
  }
}
