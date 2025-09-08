import { AuthOptions, User } from 'next-auth';
import { BitwardenClient } from './bitwarden-client';

// =============================================================================
// Bitwarden NextAuth.js Provider
// Bitwardenを使用したカスタム認証プロバイダー
// =============================================================================

/**
 * Bitwarden認証プロバイダーのオプション
 */
interface BitwardenProviderOptions {
  id: string;
  name: string;
  serverUrl?: string;
  timeout?: number;
}

/**
 * BitwardenプロバイダーのNextAuth.js統合
 */
export function BitwardenAuthProvider(options: BitwardenProviderOptions) {
  return {
    id: options.id,
    name: options.name,
    type: 'credentials' as const,
    
    credentials: {
      email: {
        label: 'Email',
        type: 'email',
        placeholder: 'user@example.com',
      },
      password: {
        label: 'Master Password',
        type: 'password',
      },
      totpCode: {
        label: 'Two-Factor Authentication Code (Optional)',
        type: 'text',
        placeholder: '123456',
      },
    },

    async authorize(credentials, req): Promise<User | null> {
      try {
        if (!credentials?.email || !credentials?.password) {
          console.warn('[BITWARDEN_PROVIDER] Missing credentials');
          return null;
        }

        // BitwardenClientの初期化
        const bitwardenClient = new BitwardenClient({
          timeout: options.timeout,
        });

        // Bitwarden CLIの利用可能性確認
        const isAvailable = await bitwardenClient.isAvailable();
        if (!isAvailable) {
          console.error('[BITWARDEN_PROVIDER] Bitwarden CLI not available');
          return null;
        }

        // サーバー設定（必要に応じて）
        if (options.serverUrl) {
          const configResult = await bitwardenClient.configureServer(options.serverUrl);
          if (!configResult.success) {
            console.error('[BITWARDEN_PROVIDER] Server configuration failed:', configResult.error);
            return null;
          }
        }

        // 認証実行
        const authResult = await bitwardenClient.authenticate({
          email: credentials.email,
          password: credentials.password,
          totpCode: credentials.totpCode || undefined,
        });

        if (!authResult.success) {
          console.warn('[BITWARDEN_PROVIDER] Authentication failed:', authResult.error);
          
          // TOTP要求の場合は特別な処理が必要
          if (authResult.requiresTOTP) {
            console.log('[BITWARDEN_PROVIDER] TOTP required for user:', credentials.email);
          }
          
          return null;
        }

        // IP アドレスの取得（ログ用）
        const forwardedFor = req.headers?.['x-forwarded-for'];
        const ipAddress = Array.isArray(forwardedFor) 
          ? forwardedFor[0] 
          : forwardedFor || req.headers?.['x-real-ip'] || 'unknown';

        // ユーザーオブジェクトの構築
        const user: User = {
          id: `bitwarden_${authResult.userId || Date.now()}`,
          email: credentials.email,
          role: determineBitwardenUserRole(credentials.email),
          permissions: getBitwardenUserPermissions(credentials.email),
        };

        // セキュリティログ
        console.log('[BITWARDEN_PROVIDER] Authentication successful:', {
          userId: user.id,
          email: user.email,
          role: user.role,
          ipAddress,
          hasSessionToken: !!authResult.sessionToken,
          timestamp: new Date().toISOString(),
        });

        // 認証後のクリーンアップ（セキュリティのため）
        await bitwardenClient.logout();

        return user;
      } catch (error) {
        console.error('[BITWARDEN_PROVIDER] Authorization error:', error);
        return null;
      }
    },
  };
}

/**
 * BitwardenユーザーのSpring別の役割決定
 */
function determineBitwardenUserRole(email: string): 'admin' | 'user' | 'viewer' {
  // 環境変数で設定された管理者メールアドレス
  const adminEmails = (process.env.BITWARDEN_ADMIN_EMAILS || '').split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);
  
  if (adminEmails.length > 0 && adminEmails.includes(email)) {
    return 'admin';
  }

  // 環境変数で設定されたビューワーメールアドレス
  const viewerEmails = (process.env.BITWARDEN_VIEWER_EMAILS || '').split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);
    
  if (viewerEmails.length > 0 && viewerEmails.includes(email)) {
    return 'viewer';
  }

  // ドメインベースの役割決定
  const domain = email.split('@')[1];
  const adminDomains = (process.env.BITWARDEN_ADMIN_DOMAINS || '').split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0);
    
  if (adminDomains.length > 0 && adminDomains.includes(domain)) {
    return 'admin';
  }

  // デフォルトはユーザー権限
  return 'user';
}

/**
 * Bitwardenユーザーの権限取得
 */
function getBitwardenUserPermissions(email: string): string[] {
  const role = determineBitwardenUserRole(email);
  
  switch (role) {
    case 'admin':
      return ['*']; // 全権限
      
    case 'user':
      return [
        'servers:read',
        'servers:manage',
        'servers:configure',
        'catalog:read',
        'catalog:install',
        'tools:test',
        'logs:read',
        'logs:download',
        'config:read',
        'config:export',
        'secrets:read',
      ];
      
    case 'viewer':
      return [
        'servers:read',
        'catalog:read',
        'tools:read',
        'logs:read',
        'config:read',
      ];
      
    default:
      return [];
  }
}

/**
 * Bitwarden認証プロバイダーの設定検証
 */
export function validateBitwardenProviderConfig(): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Bitwarden CLI利用可能性の確認（非同期処理のため、警告のみ）
  warnings.push('Bitwarden CLI availability will be checked at runtime');

  // 環境変数の確認
  const adminEmails = process.env.BITWARDEN_ADMIN_EMAILS;
  const viewerEmails = process.env.BITWARDEN_VIEWER_EMAILS;
  const adminDomains = process.env.BITWARDEN_ADMIN_DOMAINS;
  
  if (!adminEmails && !adminDomains) {
    warnings.push('No Bitwarden admin emails or domains configured. All users will have regular user permissions.');
  }

  if (adminEmails) {
    const emails = adminEmails.split(',').map(e => e.trim());
    for (const email of emails) {
      if (!email.includes('@')) {
        errors.push(`Invalid admin email format: ${email}`);
      }
    }
  }

  if (viewerEmails) {
    const emails = viewerEmails.split(',').map(e => e.trim());
    for (const email of emails) {
      if (!email.includes('@')) {
        errors.push(`Invalid viewer email format: ${email}`);
      }
    }
  }

  if (adminDomains) {
    const domains = adminDomains.split(',').map(d => d.trim());
    for (const domain of domains) {
      if (domain.includes('@') || domain.includes('/')) {
        errors.push(`Invalid admin domain format: ${domain}. Should be just the domain name.`);
      }
    }
  }

  // サーバーURL設定の確認
  const serverUrl = process.env.BITWARDEN_SERVER_URL;
  if (serverUrl) {
    try {
      new URL(serverUrl);
    } catch (error) {
      errors.push(`Invalid Bitwarden server URL: ${serverUrl}`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Bitwarden統合のヘルスチェック
 */
export async function checkBitwardenHealth(): Promise<{
  available: boolean;
  version?: string;
  serverConfigured?: boolean;
  error?: string;
}> {
  try {
    const client = new BitwardenClient();
    
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        available: false,
        error: 'Bitwarden CLI is not available or not installed',
      };
    }

    // バージョン情報の取得
    try {
      const result = await client['executeCommand'](['--version']);
      const version = result.success ? result.stdout.trim() : 'unknown';
      
      return {
        available: true,
        version,
        serverConfigured: true, // サーバー設定は動的に行うため
      };
    } catch (error) {
      return {
        available: true,
        error: 'Could not retrieve version information',
      };
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}