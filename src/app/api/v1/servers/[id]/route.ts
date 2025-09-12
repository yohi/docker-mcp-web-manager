import { NextRequest, NextResponse } from 'next/server';
import { getServerRepository } from '@/db/repositories';
import { MCPServer } from '@/types/models';

// =============================================================================
// 個別サーバー管理 API エンドポイント
// 特定のサーバーの詳細取得、更新、削除機能
// 開発環境とプロダクション環境の両方に対応
// 監視・ログ機能統合バージョン
// =============================================================================

/**
 * サーバー詳細取得
 * GET /api/v1/servers/[id]
 *
 * @param request - NextRequest
 * @param params - URL params containing server ID
 * @returns サーバー詳細情報
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    const serverId = params.id;

    // 基本的なIDバリデーション
    if (!serverId || typeof serverId !== 'string' || serverId.trim().length === 0) {
      console.log(`[API_LOG] GET /api/v1/servers/[id] - ${requestId} - INVALID_ID`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_003',
            message: '無効なサーバーIDです'
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 400 }
      );
    }

    // データベースからサーバー情報を取得
    const serverRepository = getServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      console.log(`[API_LOG] GET /api/v1/servers/${serverId} - ${requestId} - NOT_FOUND`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_001',
            message: `サーバー ID '${serverId}' が見つかりません`
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    const duration = Date.now() - startTime;

    // 監視・ログ情報の追加
    console.log(`[API_LOG] GET /api/v1/servers/${serverId} - ${requestId} - SUCCESS - ${duration}ms`);

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      data: server,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        monitoring: {
          responseTime: duration,
          serverId: server.id,
          serverName: server.name
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[API_ERROR] GET /api/v1/servers/${params.id}:`, error);
    console.error(`[API_LOG] GET /api/v1/servers/${params.id} - ${requestId} - ERROR - ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_001',
          message: 'サーバー詳細の取得に失敗しました',
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
 * サーバー情報更新
 * PATCH /api/v1/servers/[id]
 *
 * @param request - NextRequest（JSON bodyを含む）
 * @param params - URL params containing server ID
 * @returns 更新されたサーバー情報
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    const serverId = params.id;

    // 基本的なIDバリデーション
    if (!serverId || typeof serverId !== 'string' || serverId.trim().length === 0) {
      console.log(`[API_LOG] PATCH /api/v1/servers/[id] - ${requestId} - INVALID_ID`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_003',
            message: '無効なサーバーIDです'
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 400 }
      );
    }

    // リクエストボディの解析
    const body = await request.json();
    const { name, image, description, version, port, environment, resourceLimits, status } = body;

    // データベースからサーバーを取得
    const serverRepository = getServerRepository();
    const existingServer = await serverRepository.findById(serverId);

    if (!existingServer) {
      console.log(`[API_LOG] PATCH /api/v1/servers/${serverId} - ${requestId} - NOT_FOUND`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_001',
            message: `サーバー ID '${serverId}' が見つかりません`
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    // 名前変更の場合の重複チェック
    if (name && name !== existingServer.name) {
      const duplicateServer = await serverRepository.findByName(name);
      if (duplicateServer && duplicateServer.id !== serverId) {
        console.log(`[API_LOG] PATCH /api/v1/servers/${serverId} - ${requestId} - DUPLICATE_NAME - ${name}`);

        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'SERVER_004',
              message: `サーバー名 '${name}' は既に使用されています`
            },
            metadata: {
              requestId,
              timestamp: new Date().toISOString(),
              monitoring: {
                conflictField: 'name',
                conflictValue: name
              }
            }
          },
          { status: 409 }
        );
      }
    }

    // 更新データの構築
    const updateData: Partial<MCPServer> = {};

    if (name !== undefined) updateData.name = name;
    if (image !== undefined) updateData.image = image;
    if (description !== undefined) updateData.description = description;
    if (version !== undefined) updateData.version = version;
    if (port !== undefined) updateData.port = port;
    if (environment !== undefined) updateData.environment = environment;
    if (resourceLimits !== undefined) updateData.resourceLimits = resourceLimits;
    if (status !== undefined) updateData.status = status;

    // データベースを更新
    const updatedServer = await serverRepository.update(serverId, updateData);

    if (!updatedServer) {
      console.log(`[API_LOG] PATCH /api/v1/servers/${serverId} - ${requestId} - UPDATE_FAILED`);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_005',
            message: 'サーバーの更新に失敗しました'
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;

    // 監視・ログ情報の追加
    console.log(`[API_LOG] PATCH /api/v1/servers/${serverId} - ${requestId} - SUCCESS - ${duration}ms - Updated fields: ${Object.keys(updateData).join(', ')}`);

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      data: updatedServer,
      message: 'サーバーが正常に更新されました',
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        monitoring: {
          responseTime: duration,
          updatedFields: Object.keys(updateData),
          serverId: updatedServer.id
        }
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[API_ERROR] PATCH /api/v1/servers/${params.id}:`, error);
    console.error(`[API_LOG] PATCH /api/v1/servers/${params.id} - ${requestId} - ERROR - ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_005',
          message: 'サーバーの更新に失敗しました',
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
 * サーバー削除
 * DELETE /api/v1/servers/[id]
 *
 * @param request - NextRequest
 * @param params - URL params containing server ID
 * @returns 削除確認レスポンス
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    const serverId = params.id;

    // 基本的なIDバリデーション
    if (!serverId || typeof serverId !== 'string' || serverId.trim().length === 0) {
      console.log(`[API_LOG] DELETE /api/v1/servers/[id] - ${requestId} - INVALID_ID`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_003',
            message: '無効なサーバーIDです'
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 400 }
      );
    }

    // データベースからサーバーを取得
    const serverRepository = getServerRepository();
    const existingServer = await serverRepository.findById(serverId);

    if (!existingServer) {
      console.log(`[API_LOG] DELETE /api/v1/servers/${serverId} - ${requestId} - NOT_FOUND`);

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_001',
            message: `サーバー ID '${serverId}' が見つかりません`
          },
          metadata: {
            requestId,
            timestamp: new Date().toISOString()
          }
        },
        { status: 404 }
      );
    }

    // データベースからサーバーを削除
    await serverRepository.deleteServer(serverId);

    const duration = Date.now() - startTime;

    // 監視・ログ情報の追加
    console.log(`[API_LOG] DELETE /api/v1/servers/${serverId} - ${requestId} - SUCCESS - ${duration}ms - ${existingServer.name}`);

    // 成功レスポンス（204 No Content）
    return new Response(null, {
      status: 204,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': duration.toString(),
        'X-Timestamp': new Date().toISOString()
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[API_ERROR] DELETE /api/v1/servers/${params.id}:`, error);
    console.error(`[API_LOG] DELETE /api/v1/servers/${params.id} - ${requestId} - ERROR - ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_005',
          message: 'サーバーの削除に失敗しました',
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
