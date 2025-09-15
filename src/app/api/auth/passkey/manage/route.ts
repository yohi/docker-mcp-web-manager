// =============================================================================
// Passkey Management API
// パスキーの管理（一覧取得、削除、名前変更）
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { webauthnProvider } from '@/lib/auth/webauthn-provider';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse } from '@/lib/utils/api-error-handler';

// =============================================================================
// パスキー一覧取得
// GET /api/auth/passkey/manage
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // セッション確認
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse(
        'PASSKEY_013',
        '認証が必要です',
        401
      );
    }

    // ユーザーのパスキー一覧を取得
    const user = await webauthnProvider.getUserByEmail(session.user.email!);
    if (!user) {
      return createErrorResponse(
        'PASSKEY_014',
        'ユーザーが見つかりません',
        404
      );
    }

    const passkeys = await webauthnProvider.getUserPasskeys(user.id);

    // レスポンス用にデータを整形
    const passkeyList = passkeys.map(passkey => ({
      id: passkey.id,
      name: passkey.name || 'Unnamed Passkey',
      credentialId: passkey.credentialId,
      credentialDeviceType: passkey.credentialDeviceType,
      credentialBackedUp: passkey.credentialBackedUp,
      transports: passkey.transports,
      lastUsedAt: passkey.lastUsedAt,
      createdAt: passkey.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        passkeys: passkeyList,
        total: passkeyList.length,
      },
    });

  } catch (error) {
    console.error('Failed to get passkeys:', error);
    return createErrorResponse(
      'PASSKEY_015',
      'パスキー一覧の取得に失敗しました',
      500
    );
  }
}

// =============================================================================
// パスキー削除
// DELETE /api/auth/passkey/manage
// =============================================================================

export async function DELETE(request: NextRequest) {
  try {
    // セッション確認
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse(
        'PASSKEY_016',
        '認証が必要です',
        401
      );
    }

    const { searchParams } = new URL(request.url);
    const passkeyId = searchParams.get('id');

    if (!passkeyId) {
      return createErrorResponse(
        'PASSKEY_017',
        'パスキーIDは必須です',
        400
      );
    }

    // ユーザー確認
    const user = await webauthnProvider.getUserByEmail(session.user.email!);
    if (!user) {
      return createErrorResponse(
        'PASSKEY_018',
        'ユーザーが見つかりません',
        404
      );
    }

    // パスキーを削除
    const deleted = await webauthnProvider.deletePasskey(passkeyId, user.id);

    if (!deleted) {
      return createErrorResponse(
        'PASSKEY_019',
        'パスキーが見つからないか、削除に失敗しました',
        404
      );
    }

    return NextResponse.json({
      success: true,
      message: 'パスキーが削除されました',
    });

  } catch (error) {
    console.error('Failed to delete passkey:', error);
    return createErrorResponse(
      'PASSKEY_020',
      'パスキーの削除に失敗しました',
      500
    );
  }
}

// =============================================================================
// パスキー名前変更
// PATCH /api/auth/passkey/manage
// =============================================================================

export async function PATCH(request: NextRequest) {
  try {
    // セッション確認
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse(
        'PASSKEY_021',
        '認証が必要です',
        401
      );
    }

    const body = await request.json();
    const { passkeyId, name } = body;

    if (!passkeyId || !name) {
      return createErrorResponse(
        'PASSKEY_022',
        'パスキーIDと名前は必須です',
        400
      );
    }

    // ユーザー確認
    const user = await webauthnProvider.getUserByEmail(session.user.email!);
    if (!user) {
      return createErrorResponse(
        'PASSKEY_023',
        'ユーザーが見つかりません',
        404
      );
    }

    // パスキー名を更新
    const updated = await webauthnProvider.updatePasskeyName(passkeyId, user.id, name);

    if (!updated) {
      return createErrorResponse(
        'PASSKEY_024',
        'パスキーが見つからないか、更新に失敗しました',
        404
      );
    }

    return NextResponse.json({
      success: true,
      message: 'パスキー名が更新されました',
    });

  } catch (error) {
    console.error('Failed to update passkey name:', error);
    return createErrorResponse(
      'PASSKEY_025',
      'パスキー名の更新に失敗しました',
      500
    );
  }
}