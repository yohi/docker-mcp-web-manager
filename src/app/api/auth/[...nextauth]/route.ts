import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/config';

// =============================================================================
// NextAuth.js API Route Handler
// Next.js App Router用のNextAuth.js統合
// =============================================================================

const handler = NextAuth(authOptions);

// HTTP メソッドのエクスポート
export { handler as GET, handler as POST, authOptions };