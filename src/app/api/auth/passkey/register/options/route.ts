// =============================================================================
// Passkey Registration Options API
// パスキー登録用オプションを生成
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { webauthnProvider } from '@/lib/auth/webauthn-provider';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse } from '@/lib/utils/api-error-handler';

// =============================================================================
// パスキー登録オプション生成
// POST /api/auth/passkey/register/options
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // セッション確認
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse(
        'PASSKEY_001',
        '認証が必要です',
        401
      );
    }

    const body = await request.json();
    const { email, username } = body;

    if (!email || !username) {
      return createErrorResponse(
        'PASSKEY_002',
        'メールアドレスとユーザー名は必須です',
        400
      );
    }

    // ユーザーの存在確認
    let user = await webauthnProvider.getUserByEmail(email);

    // ユーザーが存在しない場合は作成
    if (!user) {
      user = await webauthnProvider.createUser(email, username);
    }

    // 登録オプションを生成
    const registrationOptions = await webauthnProvider.generateRegistrationOptions(user.id);

    return NextResponse.json({
      success: true,
      data: registrationOptions,
    });

  } catch (error) {
    console.error('Failed to generate registration options:', error);
    return createErrorResponse(
      'PASSKEY_003',
      'パスキー登録オプションの生成に失敗しました',
      500
    );
  }
}