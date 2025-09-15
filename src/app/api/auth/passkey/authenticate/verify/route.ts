// =============================================================================
// Passkey Authentication Verification API
// パスキー認証を検証・完了
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { signIn } from 'next-auth/react';
import { webauthnProvider } from '@/lib/auth/webauthn-provider';
import { createErrorResponse } from '@/lib/utils/api-error-handler';
import type { AuthenticationRequest } from '@/types/webauthn';
import jwt from 'jsonwebtoken';

// =============================================================================
// パスキー認証検証
// POST /api/auth/passkey/authenticate/verify
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body: AuthenticationRequest = await request.json();
    const { credential, challengeId } = body;

    if (!credential || !challengeId) {
      return createErrorResponse(
        'PASSKEY_010',
        'クレデンシャルとチャレンジIDは必須です',
        400
      );
    }

    // 認証を検証
    const result = await webauthnProvider.verifyAuthentication(
      credential,
      challengeId
    );

    if (!result.success) {
      return createErrorResponse(
        'PASSKEY_011',
        result.error || 'パスキー認証の検証に失敗しました',
        401
      );
    }

    // JWT トークンを生成（NextAuth.js との統合用）
    const token = jwt.sign(
      {
        sub: result.user?.id,
        email: result.user?.email,
        username: result.user?.username,
        role: result.user?.role,
        permissions: result.user?.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24時間
      },
      process.env.NEXTAUTH_SECRET || 'fallback-secret'
    );

    return NextResponse.json({
      success: true,
      message: 'パスキー認証が成功しました',
      data: {
        token,
        user: {
          id: result.user?.id,
          email: result.user?.email,
          username: result.user?.username,
          role: result.user?.role,
          permissions: result.user?.permissions,
          lastLoginAt: result.user?.lastLoginAt,
        },
        passkey: {
          id: result.passkey?.id,
          name: result.passkey?.name,
          lastUsedAt: result.passkey?.lastUsedAt,
        },
      },
    });

  } catch (error) {
    console.error('Failed to verify authentication:', error);
    return createErrorResponse(
      'PASSKEY_012',
      'パスキー認証の検証に失敗しました',
      500
    );
  }
}