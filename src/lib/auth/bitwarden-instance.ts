import { BitwardenClient } from './bitwarden-client';

// =============================================================================
// グローバルBitwardenクライアントインスタンス
// アプリケーション全体でBitwardenセッションを共有
// =============================================================================

/**
 * グローバルBitwardenクライアントインスタンス
 * 複数のAPI呼び出し間でセッション状態を保持
 */
let globalBitwardenClient: BitwardenClient | null = null;

/**
 * Bitwardenクライアントインスタンスを取得
 * 初回呼び出し時にインスタンスを作成し、以降は同じインスタンスを返す
 */
export function getBitwardenClient(): BitwardenClient {
  if (!globalBitwardenClient) {
    console.log('[BITWARDEN] Creating new global client instance');
    globalBitwardenClient = new BitwardenClient({
      timeout: 120000 // 2分タイムアウト
    });
  }
  return globalBitwardenClient;
}

/**
 * Bitwardenクライアントインスタンスをリセット
 * ログアウト時や認証エラー時に使用
 */
export function resetBitwardenClient(): void {
  console.log('[BITWARDEN] Resetting global client instance');
  if (globalBitwardenClient) {
    // 既存インスタンスのクリーンアップ
    globalBitwardenClient.logout().catch(console.warn);
  }
  globalBitwardenClient = null;
}

/**
 * 現在のBitwardenログイン状態を確認
 * セッションが有効かどうかをチェック
 */
export async function checkBitwardenSession(): Promise<{
  isLoggedIn: boolean;
  isUnlocked: boolean;
  userEmail?: string;
  status: 'unauthenticated' | 'locked' | 'unlocked';
}> {
  try {
    const client = getBitwardenClient();

    // CLI利用可能性確認
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        isLoggedIn: false,
        isUnlocked: false,
        status: 'unauthenticated'
      };
    }

    // 現在のステータス取得
    const status = await client.getStatus();

    return {
      isLoggedIn: status.status !== 'unauthenticated',
      isUnlocked: status.status === 'unlocked',
      userEmail: status.userEmail,
      status: status.status
    };
  } catch (error) {
    console.warn('[BITWARDEN] Session check error:', error);
    return {
      isLoggedIn: false,
      isUnlocked: false,
      status: 'unauthenticated'
    };
  }
}

/**
 * Bitwardenセッションの自動復旧を試行
 * 多段階復旧戦略を使用して確実にセッションを復旧
 */
export async function attemptSessionRecovery(): Promise<{
  success: boolean;
  status: 'unauthenticated' | 'locked' | 'unlocked';
  userEmail?: string;
  method?: string;
  error?: string;
}> {
  try {
    const client = getBitwardenClient();

    // CLI利用可能性確認
    const isAvailable = await client.isAvailable();
    if (!isAvailable) {
      return {
        success: false,
        status: 'unauthenticated',
        error: 'Bitwarden CLI not available'
      };
    }

    // 現在のステータス確認
    const status = await client.getStatus();
    console.log('[BITWARDEN] Current status before recovery:', status);

    if (status.status === 'unlocked') {
      // 既にアンロック済み - セッション復旧を実行
      const recoveryResult = await client.recoverSessionFromEnvironment();
      console.log('[BITWARDEN] Session recovery result:', recoveryResult);

      return {
        success: true,
        status: 'unlocked',
        userEmail: status.userEmail,
        method: recoveryResult.method || 'already_unlocked',
        error: recoveryResult.error
      };
    } else if (status.status === 'locked') {
      // ロック状態 - 環境変数からのアンロックを試行
      console.log('[BITWARDEN] Session found but locked, attempting auto-unlock');
      const recoveryResult = await client.recoverSessionFromEnvironment();

      if (recoveryResult.success) {
        // 復旧成功 - 最新ステータスを確認
        const newStatus = await client.getStatus();
        return {
          success: true,
          status: newStatus.status,
          userEmail: newStatus.userEmail,
          method: recoveryResult.method
        };
      } else {
        // アンロックできなかった
        return {
          success: false,
          status: 'locked',
          userEmail: status.userEmail,
          error: recoveryResult.error || 'Auto-unlock failed'
        };
      }
    } else {
      // 未認証状態 - 環境変数からの自動認証を試行
      console.log('[BITWARDEN] No session found, attempting auto-authentication');
      const recoveryResult = await client.recoverSessionFromEnvironment();

      if (recoveryResult.success) {
        // 認証成功 - 最新ステータスを確認
        const newStatus = await client.getStatus();
        return {
          success: true,
          status: newStatus.status,
          userEmail: newStatus.userEmail,
          method: recoveryResult.method
        };
      } else {
        return {
          success: false,
          status: 'unauthenticated',
          error: recoveryResult.error || 'Auto-authentication failed'
        };
      }
    }
  } catch (error) {
    console.error('[BITWARDEN] Session recovery critical error:', error);
    return {
      success: false,
      status: 'unauthenticated',
      error: error instanceof Error ? error.message : 'Unknown recovery error'
    };
  }
}

/**
 * Bitwardenクライアントの強制同期
 * セッション状態を最新に更新
 */
export async function forceBitwardenSync(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const client = getBitwardenClient();
    const sessionCheck = await checkBitwardenSession();

    if (!sessionCheck.isUnlocked) {
      return {
        success: false,
        error: 'Vault is not unlocked'
      };
    }

    const syncResult = await client.sync();
    if (syncResult.success) {
      console.log('[BITWARDEN] Force sync completed successfully');
    }

    return syncResult;
  } catch (error) {
    console.error('[BITWARDEN] Force sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown sync error'
    };
  }
}