import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/response';

// =============================================================================
// Debug API: セッション情報確認用（開発時のみ使用）
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    console.log('[DEBUG_SESSION] Full session object:', JSON.stringify(session, null, 2));
    
    if (!session) {
      return createErrorResponse('No active session', '401');
    }

    const debugInfo = {
      isAuthenticated: !!session,
      user: session.user,
      sessionId: session.sessionId,
      lastActivity: session.lastActivity ? new Date(session.lastActivity).toISOString() : null,
      expiresAt: session.expiresAt ? new Date(session.expiresAt).toISOString() : null,
      permissions: session.user?.permissions || [],
      role: session.user?.role,
    };

    console.log('[DEBUG_SESSION] Debug info:', JSON.stringify(debugInfo, null, 2));

    return createSuccessResponse(debugInfo);
  } catch (error) {
    console.error('[DEBUG_SESSION] Error:', error);
    return createErrorResponse('Debug session check failed', '500');
  }
}