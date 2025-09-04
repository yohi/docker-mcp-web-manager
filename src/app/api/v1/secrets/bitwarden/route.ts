import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';
import { BitwardenClient } from '../../../../../lib/bitwarden';

/**
 * Bitwardenステータス取得
 */
async function handleGetBitwardenStatus(request: NextRequest): Promise<NextResponse> {
  try {
    const bitwardenClient = BitwardenClient.getInstance();
    const status = await bitwardenClient.getStatus();
    
    return NextResponse.json({
      data: {
        status: status.status,
        serverUrl: status.serverUrl,
        userEmail: status.userEmail,
        lastSync: status.lastSync,
        isUnlocked: bitwardenClient.isUnlocked(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching Bitwarden status:', error);
    return createApiErrorResponse(
      'SECRET_001',
      'Failed to fetch Bitwarden status',
      500,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Bitwardenアンロック用のスキーマ
 */
const unlockBitwardenSchema = z.object({
  password: z.string().min(1),
});

type UnlockBitwardenRequest = z.infer<typeof unlockBitwardenSchema>;

/**
 * Bitwardenアンロック
 */
async function handleUnlockBitwarden(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    unlockBitwardenSchema,
    async (req: NextRequest, unlockData: UnlockBitwardenRequest) => {
      try {
        const bitwardenClient = BitwardenClient.getInstance();
        
        const sessionToken = await bitwardenClient.unlock(unlockData.password);
        
        return NextResponse.json({
          data: {
            unlocked: true,
            hasSessionToken: !!sessionToken,
            message: 'Bitwarden vault unlocked successfully',
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('Error unlocking Bitwarden:', error);
        return createApiErrorResponse(
          'SECRET_002',
          'Failed to unlock Bitwarden vault',
          401,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(handleGetBitwardenStatus, {
  requireAuth: true,
  rateLimit: { maxRequests: 100, windowMs: 60 * 1000 },
});

export const POST = apiHandler(handleUnlockBitwarden, {
  requireAuth: true,
  rateLimit: { maxRequests: 10, windowMs: 60 * 1000 }, // アンロックは制限を厳しく
});