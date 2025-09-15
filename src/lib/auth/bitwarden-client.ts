import {
  safeExecuteCommand,
  validateCommandArguments,
  type CommandResult,
  type CommandError
} from '../utils/command-security';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// =============================================================================
// Bitwarden CLI Integration
// Bitwarden CLIを使用した認証とシークレット管理
// =============================================================================

/**
 * Bitwarden認証リクエストの型定義
 */
export interface BitwardenAuthRequest {
  email?: string;
  password?: string;
  totpCode?: string;
  // APIキー認証用
  clientId?: string;
  clientSecret?: string;
  // SSO認証用
  ssoIdentifier?: string;
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
  private readonly sessionFilePath: string;

  constructor(options?: {
    cliPath?: string;
    timeout?: number;
    sessionDir?: string;
  }) {
    this.cliPath = options?.cliPath || 'bw';
    this.timeout = options?.timeout || 120000; // 2分に延長

    // セッションファイルの保存場所
    const sessionDir = options?.sessionDir || '/tmp';
    this.sessionFilePath = path.join(sessionDir, '.bitwarden-session');
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
        console.log('[BITWARDEN] Already authenticated with status:', statusResult);

        // セッショントークンが未設定の場合、環境からセッション復旧を試行
        if (!this.sessionToken) {
          console.log('[BITWARDEN] Session token not found, attempting to recover from environment');
          const recoveryResult = await this.recoverSessionFromEnvironment();
          if (!recoveryResult.success) {
            console.warn('[BITWARDEN] Session recovery failed:', recoveryResult.error);
          } else {
            console.log('[BITWARDEN] Session recovery successful via:', recoveryResult.method);
          }
        }

        return {
          success: true,
          sessionToken: this.sessionToken,
          userId: statusResult.userId,
        };
      }

      // 認証方法の判定と実行
      if (request.clientId && request.clientSecret) {
        // APIキー認証
        return await this.authenticateWithApiKey(request.clientId, request.clientSecret);
      } else if (request.ssoIdentifier !== undefined) {
        // SSO認証
        return await this.authenticateWithSSO(request.ssoIdentifier);
      } else if (request.email && request.password) {
        // 従来のメール/パスワード認証
        return await this.authenticateWithPassword(request);
      } else {
        return {
          success: false,
          error: 'No valid authentication method provided',
        };
      }
    } catch (error) {
      console.error('[BITWARDEN] Authentication error:', error);
      return {
        success: false,
        error: `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * メール/パスワード認証
   */
  private async authenticateWithPassword(request: BitwardenAuthRequest): Promise<BitwardenAuthResult> {
    try {
      // ログインコマンドの構築
      const args = ['login', request.email!, request.password!, '--raw'];

      if (request.totpCode) {
        args.push('--code', request.totpCode);
      }

      const result = await this.executeCommand(args);

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

      // セッションを永続化
      await this.saveSession(sessionToken);

      // ユーザーIDの取得
      const statusAfterLogin = await this.getStatus();

      console.log('[BITWARDEN] Password authentication successful:', request.email);

      return {
        success: true,
        sessionToken,
        userId: statusAfterLogin.userId,
      };
    } catch (error) {
      console.error('[BITWARDEN] Password authentication error:', error);
      return {
        success: false,
        error: `Password authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * APIキー認証
   */
  private async authenticateWithApiKey(clientId: string, clientSecret: string): Promise<BitwardenAuthResult> {
    try {
      const result = await this.executeCommand(['login', '--apikey'], {
        env: {
          BW_CLIENTID: clientId,
          BW_CLIENTSECRET: clientSecret,
        },
      });

      if (!result.success) {
        return {
          success: false,
          error: `API key authentication failed: ${result.stderr}`,
        };
      }

      // APIキー認証は直接Unlockが必要
      console.log('[BITWARDEN] API key authentication successful, vault needs to be unlocked');

      return {
        success: true,
        sessionToken: undefined, // APIキー認証後はUnlockが必要
      };
    } catch (error) {
      console.error('[BITWARDEN] API key authentication error:', error);
      return {
        success: false,
        error: `API key authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * SSO認証
   */
  private async authenticateWithSSO(identifier?: string): Promise<BitwardenAuthResult> {
    try {
      const args = ['login', '--sso'];
      if (identifier) {
        args.push(identifier);
      }

      const result = await this.executeCommand(args);

      if (!result.success) {
        return {
          success: false,
          error: `SSO authentication failed: ${result.stderr}`,
        };
      }

      console.log('[BITWARDEN] SSO authentication successful');

      return {
        success: true,
        sessionToken: undefined, // SSO認証後はUnlockが必要
      };
    } catch (error) {
      console.error('[BITWARDEN] SSO authentication error:', error);
      return {
        success: false,
        error: `SSO authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Bitwardenロック解除
   */
  async unlock(masterPassword: string): Promise<BitwardenAuthResult> {
    try {
      // 現在のステータスを確認
      const statusResult = await this.getStatus();
      if (statusResult.status === 'unlocked') {
        console.log('[BITWARDEN] Vault is already unlocked');

        // セッション復旧を実行
        const recoveryResult = await this.recoverSessionFromEnvironment();
        if (!recoveryResult.success) {
          console.warn('[BITWARDEN] Session recovery during unlock failed:', recoveryResult.error);
        } else {
          console.log('[BITWARDEN] Session recovery during unlock successful via:', recoveryResult.method);
        }

        return {
          success: true,
          sessionToken: this.sessionToken,
        };
      }

      if (statusResult.status === 'unauthenticated') {
        return {
          success: false,
          error: 'User is not logged in. Please login first.',
        };
      }

      // アンロックコマンドの実行
      // Bitwarden CLIの標準的なアンロック方法
      // printf でパスワードを渡してパイプでbw unlockに送る
      const result = await this.executeUnlockCommand(masterPassword);

      if (!result.success) {
        console.error('[BITWARDEN] Unlock failed:', result.stderr);
        return {
          success: false,
          error: `Unlock failed: ${result.stderr || 'Invalid master password'}`,
        };
      }

      const sessionToken = result.stdout.trim();
      if (!sessionToken) {
        return {
          success: false,
          error: 'Failed to obtain session token from unlock',
        };
      }

      this.sessionToken = sessionToken;

      // セッションを永続化
      await this.saveSession(sessionToken);

      console.log('[BITWARDEN] Vault unlocked successfully');

      return {
        success: true,
        sessionToken,
      };
    } catch (error) {
      console.error('[BITWARDEN] Unlock error:', error);
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

      // セッションファイルをクリア
      await this.clearSession();

      console.log('[BITWARDEN] Logged out successfully');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Logout error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Bitwarden Vaultアンロック専用コマンド実行
   * Node.jsのchild_processを使用してパスワードをstdinに送る
   */
  private async executeUnlockCommand(masterPassword: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      try {
        const bwProcess = spawn(this.cliPath, ['unlock', '--raw'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // タイムアウト設定
        const timer = setTimeout(() => {
          bwProcess.kill();
          resolve({
            success: false,
            stdout: '',
            stderr: 'Command timeout',
            exitCode: -1
          });
        }, this.timeout);

        let stdout = '';
        let stderr = '';

        bwProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        bwProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        bwProcess.on('close', (code: number) => {
          clearTimeout(timer);
          resolve({
            success: code === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code
          });
        });

        bwProcess.on('error', (error: Error) => {
          clearTimeout(timer);
          resolve({
            success: false,
            stdout: '',
            stderr: error.message,
            exitCode: -1
          });
        });

        // マスターパスワードをstdinに送信（改行付き）
        bwProcess.stdin.write(masterPassword + '\n');
        bwProcess.stdin.end();

      } catch (error) {
        resolve({
          success: false,
          stdout: '',
          stderr: error instanceof Error ? error.message : 'Unknown error',
          exitCode: -1
        });
      }
    });
  }

  /**
   * セッションの保存
   */
  private async saveSession(sessionToken: string): Promise<void> {
    try {
      await fs.writeFile(this.sessionFilePath, sessionToken, { mode: 0o600 });
      console.log('[BITWARDEN] Session saved to file');
    } catch (error) {
      console.warn('[BITWARDEN] Failed to save session:', error);
    }
  }

  /**
   * セッションの読み込み
   */
  private async loadSession(): Promise<string | null> {
    try {
      const sessionToken = await fs.readFile(this.sessionFilePath, 'utf8');
      return sessionToken.trim();
    } catch (error) {
      // ファイルが存在しない場合は正常
      return null;
    }
  }

  /**
   * セッションファイルの削除
   */
  private async clearSession(): Promise<void> {
    try {
      await fs.unlink(this.sessionFilePath);
      console.log('[BITWARDEN] Session file cleared');
    } catch (error) {
      // ファイルが存在しない場合は正常
    }
  }

  /**
   * 環境変数からの認証情報取得（セキュアな方法）
   */
  private getEnvironmentCredentials(): {
    email?: string;
    password?: string;
    masterPassword?: string;
    clientId?: string;
    clientSecret?: string;
    hasCredentials: boolean;
  } {
    const credentials = {
      email: process.env.BITWARDEN_EMAIL,
      password: process.env.BITWARDEN_PASSWORD,
      masterPassword: process.env.BITWARDEN_MASTER_PASSWORD,
      clientId: process.env.BITWARDEN_CLIENT_ID,
      clientSecret: process.env.BITWARDEN_CLIENT_SECRET,
      hasCredentials: false
    };

    // 認証情報の存在確認
    const hasEmailAuth = !!(credentials.email && credentials.password);
    const hasApiKeyAuth = !!(credentials.clientId && credentials.clientSecret);

    credentials.hasCredentials = hasEmailAuth || hasApiKeyAuth;

    // ログ出力（機密情報は除く）
    console.log('[BITWARDEN] Environment credentials check:', {
      hasEmail: !!credentials.email,
      hasPassword: !!credentials.password,
      hasMasterPassword: !!credentials.masterPassword,
      hasClientId: !!credentials.clientId,
      hasClientSecret: !!credentials.clientSecret,
      hasEmailAuth,
      hasApiKeyAuth
    });

    return credentials;
  }

  /**
   * 環境からセッションの復旧を試行
   * 多段階の復旧戦略で確実なセッション復旧を実現
   */
  public async recoverSessionFromEnvironment(): Promise<{ success: boolean; method?: string; error?: string }> {
    try {
      // 1. 保存されたセッションから復旧を試行
      const savedSessionResult = await this.recoverFromSavedSession();
      if (savedSessionResult.success) {
        return { success: true, method: 'saved_session' };
      }

      // 2. 環境変数からの自動認証を試行
      const autoAuthResult = await this.attemptAutoAuthentication();
      if (autoAuthResult.success) {
        return { success: true, method: autoAuthResult.method };
      }

      // 3. 既存のCLIセッション確認と復旧
      const cliSessionResult = await this.recoverFromCLISession();
      if (cliSessionResult.success) {
        return { success: true, method: 'cli_session' };
      }

      return {
        success: false,
        error: 'All session recovery methods failed'
      };
    } catch (error) {
      console.error('[BITWARDEN] Session recovery error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown recovery error'
      };
    }
  }

  /**
   * 保存されたセッションからの復旧
   */
  private async recoverFromSavedSession(): Promise<{ success: boolean; error?: string }> {
    try {
      const savedSession = await this.loadSession();
      if (!savedSession) {
        return { success: false, error: 'No saved session found' };
      }

      this.sessionToken = savedSession;
      console.log('[BITWARDEN] Loaded session from file');

      // セッションの有効性をテスト
      const isValid = await this.validateSessionToken(savedSession);
      if (isValid) {
        console.log('[BITWARDEN] Saved session is valid and unlocked');
        return { success: true };
      }

      // 無効なセッションをクリア
      console.log('[BITWARDEN] Saved session is invalid, clearing');
      this.sessionToken = undefined;
      await this.clearSession();
      return { success: false, error: 'Saved session was invalid' };
    } catch (error) {
      console.warn('[BITWARDEN] Failed to recover from saved session:', error);
      return { success: false, error: 'Saved session recovery failed' };
    }
  }

  /**
   * 環境変数からの自動認証
   */
  private async attemptAutoAuthentication(): Promise<{ success: boolean; method?: string; error?: string }> {
    const envCreds = this.getEnvironmentCredentials();

    // APIキー認証を優先
    if (envCreds.clientId && envCreds.clientSecret) {
      console.log('[BITWARDEN] Attempting auto-authentication with API key');
      try {
        const authResult = await this.authenticateWithApiKey(envCreds.clientId, envCreds.clientSecret);
        if (authResult.success && envCreds.masterPassword) {
          const unlockResult = await this.unlock(envCreds.masterPassword);
          if (unlockResult.success) {
            console.log('[BITWARDEN] Auto-authentication with API key successful');
            return { success: true, method: 'api_key' };
          }
        }
      } catch (error) {
        console.warn('[BITWARDEN] API key auto-authentication failed:', error);
      }
    }

    // メール/パスワード認証
    if (envCreds.email && envCreds.password) {
      console.log('[BITWARDEN] Attempting auto-authentication with email/password');
      try {
        const authResult = await this.authenticateWithPassword({
          email: envCreds.email,
          password: envCreds.password,
        });

        if (authResult.success && authResult.sessionToken) {
          await this.saveSession(authResult.sessionToken);
          console.log('[BITWARDEN] Auto-authentication with email/password successful');
          return { success: true, method: 'email_password' };
        }
      } catch (error) {
        console.warn('[BITWARDEN] Email/password auto-authentication failed:', error);
      }
    }

    return { success: false, error: 'No valid environment credentials found' };
  }

  /**
   * 既存のCLIセッションからの復旧
   */
  private async recoverFromCLISession(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.executeCommand(['status']);
      if (!result.success) {
        return { success: false, error: 'CLI status command failed' };
      }

      const status = JSON.parse(result.stdout);
      console.log('[BITWARDEN] CLI status:', status);

      if (status.status === 'unlocked') {
        this.sessionToken = 'CLI_SESSION_ACTIVE';
        console.log('[BITWARDEN] Successfully recovered active CLI session');
        return { success: true };
      }

      if (status.status === 'locked') {
        const envCreds = this.getEnvironmentCredentials();
        if (envCreds.masterPassword) {
          const unlockResult = await this.unlock(envCreds.masterPassword);
          if (unlockResult.success) {
            console.log('[BITWARDEN] Auto-unlocked with environment master password');
            return { success: true };
          }
        }
        return { success: false, error: 'Vault is locked and no master password available' };
      }

      return { success: false, error: `CLI session status: ${status.status}` };
    } catch (error) {
      console.warn('[BITWARDEN] CLI session recovery failed:', error);
      return { success: false, error: 'CLI session recovery failed' };
    }
  }

  /**
   * セッショントークンの有効性検証
   */
  private async validateSessionToken(sessionToken: string): Promise<boolean> {
    try {
      const testResult = await this.executeCommand(['status'], {
        env: { BW_SESSION: sessionToken }
      });

      if (!testResult.success) {
        return false;
      }

      const status = JSON.parse(testResult.stdout);
      return status.status === 'unlocked';
    } catch (error) {
      console.warn('[BITWARDEN] Session validation failed:', error);
      return false;
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

    // セッショントークンが実際のトークンかダミー値かを判定
    if (this.sessionToken === 'CLI_SESSION_ACTIVE') {
      // 既存のCLIセッションを使用（BW_SESSION環境変数なし）
      console.log('[BITWARDEN] Using existing CLI session without BW_SESSION env');
      return this.executeCommand(args);
    } else {
      // 実際のセッショントークンを使用
      return this.executeCommand(args, {
        env: { BW_SESSION: this.sessionToken },
      });
    }
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