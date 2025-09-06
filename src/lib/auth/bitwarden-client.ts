import { 
  safeExecuteCommand, 
  validateCommandArguments,
  type CommandResult,
  type CommandError
} from '../utils/command-security';

// =============================================================================
// Bitwarden CLI Integration
// Bitwarden CLIを使用した認証とシークレット管理
// =============================================================================

/**
 * Bitwarden認証リクエストの型定義
 */
export interface BitwardenAuthRequest {
  email: string;
  password: string;
  totpCode?: string;
}

/**
 * Bitwarden認証結果の型定義
 */
export interface BitwardenAuthResult {
  success: boolean;
  sessionToken?: string;
  userId?: string;
  error?: string;
  requiresTOTP?: boolean;
}

/**
 * Bitwardenアイテムの型定義
 */
export interface BitwardenItem {
  id: string;
  organizationId?: string;
  folderId?: string;
  type: 1 | 2 | 3 | 4; // 1=login, 2=secure note, 3=card, 4=identity
  name: string;
  notes?: string;
  favorite: boolean;
  fields?: Array<{
    name: string;
    value: string;
    type: 0 | 1 | 2; // 0=text, 1=hidden, 2=boolean
  }>;
  login?: {
    username?: string;
    password?: string;
    totp?: string;
    uris?: Array<{
      match?: number;
      uri: string;
    }>;
  };
}

/**
 * Bitwardenステータス情報の型定義
 */
export interface BitwardenStatus {
  serverUrl?: string;
  lastSync?: string;
  userEmail?: string;
  userId?: string;
  status: 'unauthenticated' | 'locked' | 'unlocked';
}

/**
 * Bitwarden CLIクライアント
 */
export class BitwardenClient {
  private sessionToken?: string;
  private readonly cliPath: string;
  private readonly timeout: number;

  constructor(options?: {
    cliPath?: string;
    timeout?: number;
  }) {
    this.cliPath = options?.cliPath || 'bw';
    this.timeout = options?.timeout || 30000;
  }

  /**
   * Bitwarden CLIの利用可能性確認
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executeCommand(['--version']);
      return result.success && result.stdout.includes('.');
    } catch (error) {
      console.warn('[BITWARDEN] CLI not available:', error);
      return false;
    }
  }

  /**
   * Bitwardenサーバー設定
   */
  async configureServer(serverUrl?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!serverUrl) {
        // デフォルトサーバー（Bitwarden公式）を使用
        return { success: true };
      }

      const result = await this.executeCommand(['config', 'server', serverUrl]);
      
      if (!result.success) {
        return {
          success: false,
          error: `Server configuration failed: ${result.stderr}`,
        };
      }

      console.log('[BITWARDEN] Server configured:', serverUrl);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Server configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Bitwarden認証
   */
  async authenticate(request: BitwardenAuthRequest): Promise<BitwardenAuthResult> {
    try {
      // 既存セッションの確認
      const statusResult = await this.getStatus();
      if (statusResult.status === 'unlocked') {
        console.log('[BITWARDEN] Already authenticated');
        return {
          success: true,
          sessionToken: this.sessionToken,
          userId: statusResult.userId,
        };
      }

      // ログインコマンドの構築
      const args = ['login', request.email, '--raw'];
      
      // パスワードを環境変数で渡す（コマンドラインに露出させない）
      const env = {
        BW_PASSWORD: request.password,
      };

      if (request.totpCode) {
        args.push('--code', request.totpCode);
      }

      const result = await this.executeCommand(args, { env });

      if (!result.success) {
        // TOTPが必要な場合の検出
        if (result.stderr.includes('Two-step login code required')) {
          return {
            success: false,
            requiresTOTP: true,
            error: 'TOTP code required',
          };
        }

        return {
          success: false,
          error: `Authentication failed: ${result.stderr}`,
        };
      }

      // セッショントークンの取得
      const sessionToken = result.stdout.trim();
      if (!sessionToken) {
        return {
          success: false,
          error: 'Failed to obtain session token',
        };
      }

      this.sessionToken = sessionToken;

      // ユーザーIDの取得
      const statusAfterLogin = await this.getStatus();
      
      console.log('[BITWARDEN] Authentication successful:', request.email);
      
      return {
        success: true,
        sessionToken,
        userId: statusAfterLogin.userId,
      };
    } catch (error) {
      console.error('[BITWARDEN] Authentication error:', error);
      return {
        success: false,
        error: `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Bitwardenロック解除
   */
  async unlock(masterPassword: string): Promise<BitwardenAuthResult> {
    try {
      const env = {
        BW_PASSWORD: masterPassword,
      };

      const result = await this.executeCommand(['unlock', '--raw'], { env });

      if (!result.success) {
        return {
          success: false,
          error: `Unlock failed: ${result.stderr}`,
        };
      }

      const sessionToken = result.stdout.trim();
      this.sessionToken = sessionToken;

      console.log('[BITWARDEN] Vault unlocked successfully');
      
      return {
        success: true,
        sessionToken,
      };
    } catch (error) {
      return {
        success: false,
        error: `Unlock error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Bitwardenステータス取得
   */
  async getStatus(): Promise<BitwardenStatus> {
    try {
      const result = await this.executeCommand(['status']);
      
      if (!result.success) {
        return { status: 'unauthenticated' };
      }

      const status = JSON.parse(result.stdout);
      return status;
    } catch (error) {
      console.warn('[BITWARDEN] Status check error:', error);
      return { status: 'unauthenticated' };
    }
  }

  /**
   * アイテム一覧取得
   */
  async listItems(organizationId?: string): Promise<{ success: boolean; items?: BitwardenItem[]; error?: string }> {
    try {
      if (!this.sessionToken) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const args = ['list', 'items'];
      if (organizationId) {
        args.push('--organizationid', organizationId);
      }

      const result = await this.executeCommandWithSession(args);
      
      if (!result.success) {
        return {
          success: false,
          error: `Failed to list items: ${result.stderr}`,
        };
      }

      const items: BitwardenItem[] = JSON.parse(result.stdout);
      return {
        success: true,
        items,
      };
    } catch (error) {
      return {
        success: false,
        error: `List items error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 特定アイテムの取得
   */
  async getItem(itemId: string): Promise<{ success: boolean; item?: BitwardenItem; error?: string }> {
    try {
      if (!this.sessionToken) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const result = await this.executeCommandWithSession(['get', 'item', itemId]);
      
      if (!result.success) {
        return {
          success: false,
          error: `Failed to get item: ${result.stderr}`,
        };
      }

      const item: BitwardenItem = JSON.parse(result.stdout);
      return {
        success: true,
        item,
      };
    } catch (error) {
      return {
        success: false,
        error: `Get item error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * アイテムの検索
   */
  async searchItems(searchTerm: string): Promise<{ success: boolean; items?: BitwardenItem[]; error?: string }> {
    try {
      if (!this.sessionToken) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const result = await this.executeCommandWithSession(['list', 'items', '--search', searchTerm]);
      
      if (!result.success) {
        return {
          success: false,
          error: `Search failed: ${result.stderr}`,
        };
      }

      const items: BitwardenItem[] = JSON.parse(result.stdout);
      return {
        success: true,
        items,
      };
    } catch (error) {
      return {
        success: false,
        error: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 同期実行
   */
  async sync(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.sessionToken) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const result = await this.executeCommandWithSession(['sync']);
      
      if (!result.success) {
        return {
          success: false,
          error: `Sync failed: ${result.stderr}`,
        };
      }

      console.log('[BITWARDEN] Sync completed');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Sync error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * ログアウト
   */
  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.executeCommand(['logout']);
      this.sessionToken = undefined;
      
      console.log('[BITWARDEN] Logged out successfully');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Logout error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  /**
   * セッショントークンなしでのコマンド実行
   */
  private async executeCommand(
    args: string[], 
    options: { env?: Record<string, string> } = {}
  ): Promise<CommandResult> {
    // コマンド引数の検証
    const validation = this.validateBitwardenCommand(args);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.error}`);
    }

    return safeExecuteCommand(this.cliPath, args, {
      timeout: this.timeout,
      env: options.env,
    });
  }

  /**
   * セッショントークンありでのコマンド実行
   */
  private async executeCommandWithSession(args: string[]): Promise<CommandResult> {
    if (!this.sessionToken) {
      throw new Error('Session token required');
    }

    return this.executeCommand(args, {
      env: { BW_SESSION: this.sessionToken },
    });
  }

  /**
   * Bitwardenコマンドの検証
   */
  private validateBitwardenCommand(args: string[]): { valid: boolean; error?: string } {
    // 許可されたBitwardenサブコマンド
    const allowedCommands = [
      '--version',
      'config',
      'login',
      'unlock',
      'lock',
      'logout',
      'status',
      'list',
      'get',
      'create',
      'edit',
      'delete',
      'sync',
      'export',
      'import',
      'generate',
      'encode',
      'move',
      'confirm',
      'restore',
      'send',
    ];

    if (args.length === 0) {
      return { valid: false, error: 'Empty command' };
    }

    const command = args[0];
    if (!allowedCommands.includes(command)) {
      return {
        valid: false,
        error: `Command '${command}' is not in the allowlist`,
      };
    }

    // 引数の基本検証
    for (const arg of args) {
      if (typeof arg !== 'string') {
        return { valid: false, error: 'All arguments must be strings' };
      }
      
      if (arg.length > 1000) {
        return { valid: false, error: 'Argument too long' };
      }
    }

    return { valid: true };
  }
}