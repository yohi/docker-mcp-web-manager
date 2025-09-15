import { NextRequest, NextResponse } from 'next/server';
import {
  getBitwardenClient,
  checkBitwardenSession,
  attemptSessionRecovery
} from '@/lib/auth/bitwarden-instance';

// =============================================================================
// Bitwarden統合 API エンドポイント
// Bitwardenアイテムの検索、取得、管理機能を提供
// =============================================================================

/**
 * Bitwardenアイテム一覧・検索
 * GET /api/v1/bitwarden?search=term
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const organizationId = searchParams.get('organizationId');

    // グローバルBitwardenクライアントを取得
    const bitwardenClient = getBitwardenClient();

    // CLI利用可能性確認
    const isAvailable = await bitwardenClient.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_001',
            message: 'Bitwarden CLIが利用できません。インストールを確認してください。'
          }
        },
        { status: 503 }
      );
    }

    // セッション復旧を試行
    const recoveryResult = await attemptSessionRecovery();
    console.log('[BITWARDEN] GET Session recovery result:', recoveryResult);

    // 認証状態確認
    const sessionCheck = await checkBitwardenSession();
    console.log('[BITWARDEN] GET Session check result:', sessionCheck);

    if (!sessionCheck.isUnlocked) {
      console.log('[BITWARDEN] GET Session not unlocked, returning auth error');

      // 復旧結果に応じたエラーメッセージを生成
      let errorMessage = 'Bitwardenにログインしていません。';
      if (sessionCheck.status === 'locked') {
        errorMessage = 'Bitwardenがロックされています。アンロックしてください。';
      } else if (recoveryResult.error) {
        errorMessage = `セッション復旧に失敗しました: ${recoveryResult.error}`;
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_002',
            message: errorMessage,
            currentStatus: {
              status: sessionCheck.status,
              userEmail: sessionCheck.userEmail,
              isLoggedIn: sessionCheck.isLoggedIn
            },
            recovery: {
              attempted: true,
              success: recoveryResult.success,
              method: recoveryResult.method,
              error: recoveryResult.error
            }
          }
        },
        { status: 401 }
      );
    }

    console.log('[BITWARDEN] GET Session is unlocked, proceeding with item retrieval');

    let result;

    if (search) {
      // 検索の実行
      result = await bitwardenClient.searchItems(search);
    } else {
      // 全アイテム取得
      result = await bitwardenClient.listItems(organizationId || undefined);
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_003',
            message: result.error || 'アイテムの取得に失敗しました'
          }
        },
        { status: 500 }
      );
    }

    // 環境変数に適用可能なアイテムのフィルタリング
    const environmentVariableItems = (result.items || []).filter(item => {
      // ログインアイテム（パスワード、ユーザー名）
      if (item.type === 1 && item.login) {
        return true;
      }

      // カスタムフィールドを持つアイテム
      if (item.fields && item.fields.length > 0) {
        return true;
      }

      // セキュアメモ（APIキーなどの格納用）
      if (item.type === 2 && item.notes) {
        return true;
      }

      return false;
    }).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      favorite: item.favorite,
      // セキュリティのため、実際の値は含めない
      availableFields: getAvailableFields(item)
    }));

    return NextResponse.json({
      success: true,
      data: {
        items: environmentVariableItems,
        totalCount: environmentVariableItems.length
      }
    });

  } catch (error) {
    console.error('Bitwarden API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BITWARDEN_004',
          message: 'Bitwarden APIでエラーが発生しました'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Bitwardenログインと初期化
 * POST /api/v1/bitwarden
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email, password, totpCode, masterPassword } = body;

    // グローバルBitwardenクライアントを取得
    const bitwardenClient = getBitwardenClient();

    // CLI利用可能性確認
    const isAvailable = await bitwardenClient.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_001',
            message: 'Bitwarden CLIが利用できません'
          }
        },
        { status: 503 }
      );
    }

    if (action === 'login') {
      // ログイン処理
      if (!email || !password) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BITWARDEN_005',
              message: 'メールアドレスとパスワードは必須です'
            }
          },
          { status: 400 }
        );
      }

      const authResult = await bitwardenClient.authenticate({
        email,
        password,
        totpCode
      });

      if (!authResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BITWARDEN_006',
              message: authResult.error || '認証に失敗しました',
              requiresTOTP: authResult.requiresTOTP
            }
          },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          userId: authResult.userId,
          requiresTOTP: false
        }
      });

    } else if (action === 'unlock') {
      // アンロック処理
      if (!masterPassword) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BITWARDEN_007',
              message: 'マスターパスワードは必須です'
            }
          },
          { status: 400 }
        );
      }

      const unlockResult = await bitwardenClient.unlock(masterPassword);

      if (!unlockResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BITWARDEN_008',
              message: unlockResult.error || 'アンロックに失敗しました'
            }
          },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          unlocked: true
        }
      });

    } else if (action === 'status') {
      // セッション復旧を試行
      const recoveryResult = await attemptSessionRecovery();
      console.log('[BITWARDEN] Status: Session recovery result:', recoveryResult);

      // ステータス確認
      const sessionCheck = await checkBitwardenSession();
      console.log('[BITWARDEN] Status: Session check result:', sessionCheck);

      const responseData = {
        status: sessionCheck.status,
        userEmail: sessionCheck.userEmail,
        isLoggedIn: sessionCheck.isLoggedIn,
        isUnlocked: sessionCheck.isUnlocked,
        recovery: {
          attempted: true,
          success: recoveryResult.success,
          method: recoveryResult.method,
          error: recoveryResult.error
        }
      };

      console.log('[BITWARDEN] Status API response:', responseData);

      return NextResponse.json({
        success: true,
        data: responseData
      });

    } else if (action === 'sync') {
      // 同期処理
      const syncResult = await bitwardenClient.sync();

      if (!syncResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BITWARDEN_009',
              message: syncResult.error || '同期に失敗しました'
            }
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          synced: true
        }
      });

    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_010',
            message: '無効なアクションです'
          }
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Bitwarden POST API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BITWARDEN_004',
          message: 'Bitwarden APIでエラーが発生しました'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Bitwardenアイテムから利用可能なフィールドを抽出
 */
function getAvailableFields(item: any): Array<{ name: string; type: 'text' | 'password' | 'hidden' }> {
  const fields: Array<{ name: string; type: 'text' | 'password' | 'hidden' }> = [];

  // ログインアイテムの場合
  if (item.type === 1 && item.login) {
    if (item.login.username) {
      fields.push({ name: 'Username', type: 'text' });
    }
    if (item.login.password) {
      fields.push({ name: 'Password', type: 'password' });
    }
  }

  // カスタムフィールド
  if (item.fields) {
    item.fields.forEach((field: any) => {
      const fieldType = field.type === 1 ? 'hidden' : field.type === 0 ? 'text' : 'text';
      fields.push({
        name: field.name,
        type: fieldType
      });
    });
  }

  // セキュアメモの場合
  if (item.type === 2 && item.notes) {
    fields.push({ name: 'Notes', type: 'hidden' });
  }

  return fields;
}