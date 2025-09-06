import { AuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { BitwardenAuthProvider } from './bitwarden-provider';
import { validateCredentials, AuthResult } from './credentials-validator';

// =============================================================================
// NextAuth.js Configuration
// NextAuth.js 4.24.11に基づく認証システム設定
// =============================================================================

/**
 * JWTトークンの拡張インターフェース
 */
declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    email: string;
    role: 'admin' | 'user' | 'viewer';
    permissions: string[];
    sessionId: string;
    lastActivity: number;
    ipAddress?: string;
  }
}

/**
 * セッションの拡張インターフェース
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      role: 'admin' | 'user' | 'viewer';
      permissions: string[];
    };
    sessionId: string;
    lastActivity: number;
    expiresAt: number;
  }

  interface User {
    id: string;
    email: string;
    role: 'admin' | 'user' | 'viewer';
    permissions: string[];
  }
}

/**
 * 環境変数の検証
 */
function validateEnvironmentVariables(): void {
  const requiredVars = [
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'JWT_SECRET',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // JWT秘密鍵の強度チェック
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    console.warn('[AUTH_SECURITY] JWT_SECRET should be at least 32 characters long');
  }

  // セキュリティヘッダー設定の確認
  if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_URL?.startsWith('https://')) {
    console.warn('[AUTH_SECURITY] NEXTAUTH_URL should use HTTPS in production');
  }
}

/**
 * セッション継続時間の設定
 */
const SESSION_CONFIG = {
  // セッションの最大継続時間（24時間）
  maxAge: 24 * 60 * 60, // 24 hours in seconds
  // トークン更新間隔（1時間）
  updateAge: 60 * 60, // 1 hour in seconds
  // アクティビティタイムアウト（30分）
  activityTimeout: 30 * 60 * 1000, // 30 minutes in milliseconds
} as const;

/**
 * NextAuth.js設定
 */
export const authOptions: AuthOptions = {
  // セッション戦略をJWTに設定（SQLiteでの状態管理を回避）
  session: {
    strategy: 'jwt',
    maxAge: SESSION_CONFIG.maxAge,
    updateAge: SESSION_CONFIG.updateAge,
  },

  // JWT設定
  jwt: {
    secret: process.env.JWT_SECRET,
    maxAge: SESSION_CONFIG.maxAge,
    // セキュリティ強化のための設定
    encode: async ({ secret, token }) => {
      // カスタムJWTエンコーディング（必要に応じて）
      const { SignJWT } = await import('jose');
      const jwt = new SignJWT(token as any)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .setIssuer(process.env.NEXTAUTH_URL || 'http://localhost:3000')
        .setAudience('docker-mcp-web-manager');
      
      return jwt.sign(new TextEncoder().encode(secret));
    },
    decode: async ({ secret, token }) => {
      if (!token) return null;
      
      try {
        const { jwtVerify } = await import('jose');
        const { payload } = await jwtVerify(
          token,
          new TextEncoder().encode(secret),
          {
            issuer: process.env.NEXTAUTH_URL || 'http://localhost:3000',
            audience: 'docker-mcp-web-manager',
          }
        );
        return payload as JWT;
      } catch (error) {
        console.error('[AUTH_ERROR] JWT verification failed:', error);
        return null;
      }
    },
  },

  // 認証プロバイダー設定
  providers: [
    // カスタム認証プロバイダー（Bitwarden統合）
    CredentialsProvider({
      id: 'custom-auth',
      name: 'Custom Authentication',
      credentials: {
        email: { 
          label: 'Email', 
          type: 'email', 
          placeholder: 'user@example.com' 
        },
        password: { 
          label: 'Password', 
          type: 'password' 
        },
        authMethod: {
          label: 'Authentication Method',
          type: 'text',
        },
        totpCode: {
          label: 'TOTP Code (Optional)',
          type: 'text',
        },
      },
      async authorize(credentials, req) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.warn('[AUTH_WARNING] Missing credentials');
            return null;
          }

          // IP アドレスの取得
          const forwardedFor = req.headers?.['x-forwarded-for'];
          const ipAddress = Array.isArray(forwardedFor) 
            ? forwardedFor[0] 
            : forwardedFor || req.headers?.['x-real-ip'] || 'unknown';

          // 認証情報の検証
          const authResult: AuthResult = await validateCredentials({
            email: credentials.email,
            password: credentials.password,
            authMethod: (credentials.authMethod as 'local' | 'bitwarden') || 'local',
            totpCode: credentials.totpCode,
            ipAddress: ipAddress as string,
          });

          if (!authResult.success || !authResult.user) {
            console.warn('[AUTH_WARNING] Authentication failed for:', credentials.email);
            return null;
          }

          // セキュリティログ
          console.log('[AUTH_SUCCESS]', {
            userId: authResult.user.id,
            email: authResult.user.email,
            ipAddress,
            method: credentials.authMethod || 'local',
            timestamp: new Date().toISOString(),
          });

          return {
            id: authResult.user.id,
            email: authResult.user.email,
            role: authResult.user.role,
            permissions: authResult.user.permissions,
          };
        } catch (error) {
          console.error('[AUTH_ERROR] Authorization error:', error);
          return null;
        }
      },
    }),

    // Bitwarden直接統合プロバイダー
    BitwardenAuthProvider({
      id: 'bitwarden',
      name: 'Bitwarden',
    }),
  ],

  // セッションコールバック
  callbacks: {
    async jwt({ token, user, account }) {
      try {
        // 初回ログイン時のトークン設定
        if (user && account) {
          token.id = user.id;
          token.email = user.email;
          token.role = user.role;
          token.permissions = user.permissions;
          token.sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;
          token.lastActivity = Date.now();
        }

        // アクティビティタイムアウトチェック
        const now = Date.now();
        if (token.lastActivity && (now - token.lastActivity) > SESSION_CONFIG.activityTimeout) {
          console.log('[AUTH_TIMEOUT] Session expired due to inactivity:', token.email);
          return {}; // 空のトークンを返してセッションを終了
        }

        // アクティビティ時刻の更新
        token.lastActivity = now;

        return token;
      } catch (error) {
        console.error('[AUTH_ERROR] JWT callback error:', error);
        return {};
      }
    },

    async session({ session, token }) {
      try {
        if (token.id) {
          session.user.id = token.id;
          session.user.email = token.email;
          session.user.role = token.role;
          session.user.permissions = token.permissions;
          session.sessionId = token.sessionId;
          session.lastActivity = token.lastActivity;
          session.expiresAt = token.lastActivity + SESSION_CONFIG.activityTimeout;
        }

        return session;
      } catch (error) {
        console.error('[AUTH_ERROR] Session callback error:', error);
        throw new Error('Session generation failed');
      }
    },

    async signIn({ user, account, profile }) {
      try {
        // サインイン前のセキュリティチェック
        if (!user?.email) {
          console.warn('[AUTH_WARNING] Sign-in attempt without email');
          return false;
        }

        // セキュリティ監査ログ
        console.log('[AUTH_SIGNIN]', {
          userId: user.id,
          email: user.email,
          provider: account?.provider,
          timestamp: new Date().toISOString(),
        });

        return true;
      } catch (error) {
        console.error('[AUTH_ERROR] Sign-in callback error:', error);
        return false;
      }
    },
  },

  // ページ設定
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },

  // イベントハンドラー
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('[AUTH_EVENT] User signed in:', {
        userId: user.id,
        email: user.email,
        provider: account?.provider,
        isNewUser,
        timestamp: new Date().toISOString(),
      });
    },

    async signOut({ session, token }) {
      console.log('[AUTH_EVENT] User signed out:', {
        userId: token?.id || session?.user?.id,
        sessionId: token?.sessionId || session?.sessionId,
        timestamp: new Date().toISOString(),
      });
    },

    async session({ session, token }) {
      // セッション活動の記録（デバッグ時のみ）
      if (process.env.NODE_ENV === 'development') {
        console.debug('[AUTH_SESSION_ACTIVITY]', {
          userId: session.user.id,
          lastActivity: new Date(session.lastActivity).toISOString(),
        });
      }
    },
  },

  // デバッグ設定（開発環境のみ）
  debug: process.env.NODE_ENV === 'development',

  // セキュリティ設定
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: `${process.env.NODE_ENV === 'production' ? '__Secure-' : ''}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' 
          ? process.env.AUTH_COOKIE_DOMAIN 
          : undefined,
      },
    },
  },
};

// 初期化時の環境変数検証
if (typeof window === 'undefined') {
  try {
    validateEnvironmentVariables();
  } catch (error) {
    console.error('[AUTH_CONFIG_ERROR]', error);
    // 本番環境では起動を停止
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

/**
 * セッション設定の取得
 */
export { SESSION_CONFIG };

/**
 * 権限チェック用のヘルパー関数
 */
export function hasPermission(session: any, requiredPermission: string): boolean {
  if (!session?.user?.permissions) {
    return false;
  }

  return session.user.permissions.includes(requiredPermission) || 
         session.user.permissions.includes('*');
}

/**
 * 管理者権限チェック
 */
export function isAdmin(session: any): boolean {
  return session?.user?.role === 'admin';
}

/**
 * セッションの有効性チェック
 */
export function isSessionActive(session: any): boolean {
  if (!session?.lastActivity || !session?.expiresAt) {
    return false;
  }

  return Date.now() < session.expiresAt;
}