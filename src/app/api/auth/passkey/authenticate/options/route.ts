// =============================================================================
// Passkey Authentication Options API
// パスキー認証用オプションを生成
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { webauthnProvider } from '@/lib/auth/webauthn-provider';
import { createErrorResponse } from '@/lib/utils/api-error-handler';

// =============================================================================
// パスキー認証オプション生成
// POST /api/auth/passkey/authenticate/options
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userId } = body;

    let targetUserId: string | undefined = userId;

    // メールアドレスが指定された場合はユーザーIDを取得
    if (email && !userId) {
      const user = await webauthnProvider.getUserByEmail(email);
      if (!user) {
        return createErrorResponse(
          'PASSKEY_008',
          'ユーザーが見つかりません',
          404
        );
      }
      targetUserId = user.id;
    }

    // 認証オプションを生成
    const authenticationOptions = await webauthnProvider.generateAuthenticationOptions(targetUserId);

    return NextResponse.json({
      success: true,
      data: authenticationOptions,
    });

  } catch (error) {
    console.error('Failed to generate authentication options:', error);
    return createErrorResponse(
      'PASSKEY_009',
      'パスキー認証オプションの生成に失敗しました',
      500
    );
  }
}