// =============================================================================
// Passkey Registration Verification API
// パスキー登録を検証・完了
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { webauthnProvider } from '@/lib/auth/webauthn-provider';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse } from '@/lib/utils/api-error-handler';
import type { RegistrationRequest } from '@/types/webauthn';

// =============================================================================
// パスキー登録検証
// POST /api/auth/passkey/register/verify
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // セッション確認
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return createErrorResponse(
        'PASSKEY_004',
        '認証が必要です',
        401
      );
    }

    const body: RegistrationRequest = await request.json();
    const { userId, credential, challengeId, name } = body;

    if (!userId || !credential || !challengeId) {
      return createErrorResponse(
        'PASSKEY_005',
        'ユーザーID、クレデンシャル、チャレンジIDは必須です',
        400
      );
    }

    // 登録を検証
    const result = await webauthnProvider.verifyRegistration(
      userId,
      credential,
      challengeId,
      name
    );

    if (!result.success) {
      return createErrorResponse(
        'PASSKEY_006',
        result.error || 'パスキー登録の検証に失敗しました',
        400
      );
    }

    return NextResponse.json({
      success: true,
      message: 'パスキーが正常に登録されました',
      data: {
        passkey: {
          id: result.passkey?.id,
          name: result.passkey?.name,
          createdAt: result.passkey?.createdAt,
        },
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Failed to verify registration:', error);
    return createErrorResponse(
      'PASSKEY_007',
      'パスキー登録の検証に失敗しました',
      500
    );
  }
}