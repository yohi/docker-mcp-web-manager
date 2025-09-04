/**
 * Bitwarden CLI クライアント
 * 
 * セキュリティ要件：
 * - セッション管理とトークン安全保存
 * - シークレット同期と取得機能  
 * - コマンドインジェクション防止
 * - タイムアウトと再試行制御
 * - 構造化エラーハンドリング
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { validateAndSanitizeArgs } from '../utils/command-security';
import { encrypt, decrypt, keyManager, EncryptionResult } from '../crypto';

const execFileAsync = promisify(execFile);

/**
 * Bitwarden設定
 */
export const BITWARDEN_CONFIG = {
  COMMAND: 'bw',
  DEFAULT_TIMEOUT: 30000, // 30秒
  LONG_TIMEOUT: 120000, // 2分（同期用）
  MAX_RETRIES: 3,
  SESSION_DURATION: 1800000, // 30分
} as const;

/**
 * BitwardenステータスEnum
 */
export enum BitwardenStatus {
  UNAUTHENTICATED = 'unauthenticated',
  LOCKED = 'locked',
  UNLOCKED = 'unlocked',
}

/**
 * Bitwardenアイテム型
 */
export enum BitwardenItemType {
  LOGIN = 1,
  NOTE = 2,
  CARD = 3,
  IDENTITY = 4,
}

/**
 * Bitwardenステータス情報
 */
export interface BitwardenStatusInfo {
  status: BitwardenStatus;
  serverUrl: string | null;
  userEmail: string | null;
  lastSync: string | null;
}

/**
 * Bitwardenアイテム
 */
export interface BitwardenItem {
  id: string;
  organizationId: string | null;
  folderId: string | null;
  type: BitwardenItemType;
  name: string;
  favorite: boolean;
  login?: {
    username?: string;
    password?: string;
    uris?: Array<{ uri: string; match?: number }>;
    totp?: string;
  };
  notes?: string;
  fields?: Array<{
    name: string;
    value: string;
    type: 0 | 1 | 2; // 0: text, 1: hidden, 2: boolean
  }>;
  creationDate: string;
  revisionDate: string;
}

/**
 * Bitwardenエラー
 */
export class BitwardenError extends Error {
  constructor(
    message: string,
    public code: string,
    public exitCode?: number,
    public stderr?: string
  ) {
    super(message);
    this.name = 'BitwardenError';
  }
}

/**
 * Bitwarden CLIクライアント
 */
export class BitwardenClient {
  private static instance: BitwardenClient;
  private sessionToken: string | null = null;
  private lastActivity: number = 0;
  private isInitialized = false;

  private constructor() {}

  /**
   * シングルトンインスタンス取得
   */
  static getInstance(): BitwardenClient {
    if (!BitwardenClient.instance) {
      BitwardenClient.instance = new BitwardenClient();
    }
    return BitwardenClient.instance;
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    try {
      // Bitwarden CLIの存在確認
      await this.checkCLIAvailability();
      
      // ステータス確認
      const status = await this.getStatus();
      console.log(`🔐 Bitwarden status: ${status.status} (${status.userEmail || 'no user'})`);
      
      this.isInitialized = true;
    } catch (error) {
      throw new BitwardenError(
        'Bitwarden client initialization failed',
        'BITWARDEN_INIT_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * CLI利用可能性チェック
   */
  private async checkCLIAvailability(): Promise<void> {
    try {
      const result = await this.executeCommand(['--version'], { timeout: 5000 });
      console.log(`✅ Bitwarden CLI available: ${result.trim()}`);
    } catch (error) {
      throw new BitwardenError(
        'Bitwarden CLI not available. Please install Bitwarden CLI.',
        'CLI_NOT_AVAILABLE',
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Bitwardenステータス取得
   */
  async getStatus(): Promise<BitwardenStatusInfo> {
    const result = await this.executeCommand(['status'], { parseJson: true });
    
    return {
      status: result.status as BitwardenStatus,
      serverUrl: result.serverUrl || null,
      userEmail: result.userEmail || null,
      lastSync: result.lastSync || null,
    };
  }

  /**
   * ログイン
   */
  async login(email: string, password: string, serverUrl?: string): Promise<void> {
    const args = ['login', email];
    
    if (serverUrl) {
      args.push('--server', serverUrl);
    }

    try {
      await this.executeCommand(args, {
        input: password,
        timeout: BITWARDEN_CONFIG.LONG_TIMEOUT,
      });
      
      console.log(`✅ Logged in to Bitwarden as ${email}`);
    } catch (error) {
      throw new BitwardenError(
        'Bitwarden login failed',
        'LOGIN_FAILED',
        error instanceof Error && 'exitCode' in error ? (error as any).exitCode : undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * ヴォルトアンロック
   */
  async unlock(password: string): Promise<string> {
    try {
      const result = await this.executeCommand(['unlock', '--passwordenv', 'BW_PASSWORD'], {
        env: { ...process.env, BW_PASSWORD: password },
        timeout: BITWARDEN_CONFIG.DEFAULT_TIMEOUT,
      });

      // セッショントークンの抽出
      const tokenMatch = result.match(/BW_SESSION="([^"]+)"/);
      if (!tokenMatch) {
        throw new BitwardenError('Failed to extract session token', 'TOKEN_EXTRACTION_FAILED');
      }

      this.sessionToken = tokenMatch[1];
      this.lastActivity = Date.now();

      // セッショントークンを暗号化して保存
      await this.storeSessionToken(this.sessionToken);

      console.log('🔓 Bitwarden vault unlocked');
      return this.sessionToken;
    } catch (error) {
      throw new BitwardenError(
        'Bitwarden unlock failed',
        'UNLOCK_FAILED',
        error instanceof Error && 'exitCode' in error ? (error as any).exitCode : undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * ロック状態確認
   */
  isUnlocked(): boolean {
    if (!this.sessionToken) return false;
    
    // セッション有効期限チェック
    const now = Date.now();
    const sessionAge = now - this.lastActivity;
    
    if (sessionAge > BITWARDEN_CONFIG.SESSION_DURATION) {
      this.sessionToken = null;
      return false;
    }
    
    return true;
  }

  /**
   * アイテム一覧取得
   */
  async listItems(search?: string): Promise<BitwardenItem[]> {
    this.ensureUnlocked();
    
    const args = ['list', 'items'];
    if (search) {
      args.push('--search', search);
    }

    const result = await this.executeCommand(args, { 
      parseJson: true,
      useSession: true,
    });

    return result as BitwardenItem[];
  }

  /**
   * 指定アイテム取得
   */
  async getItem(itemId: string): Promise<BitwardenItem> {
    this.ensureUnlocked();
    
    const sanitizedId = validateAndSanitizeArgs({ itemId }).itemId!;
    
    const result = await this.executeCommand(['get', 'item', sanitizedId], {
      parseJson: true,
      useSession: true,
    });

    return result as BitwardenItem;
  }

  /**
   * パスワード取得
   */
  async getPassword(itemId: string): Promise<string | null> {
    this.ensureUnlocked();
    
    const sanitizedId = validateAndSanitizeArgs({ itemId }).itemId!;
    
    try {
      const result = await this.executeCommand(['get', 'password', sanitizedId], {
        useSession: true,
      });
      
      return result.trim() || null;
    } catch (error) {
      // アイテムが存在しない場合
      if (error instanceof BitwardenError && error.exitCode === 1) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 環境変数値取得（カスタムフィールド）
   */
  async getEnvironmentValue(itemId: string, fieldName: string): Promise<string | null> {
    const item = await this.getItem(itemId);
    
    if (!item.fields) {
      return null;
    }

    const field = item.fields.find(f => f.name === fieldName);
    return field?.value || null;
  }

  /**
   * 同期
   */
  async sync(): Promise<void> {
    this.ensureUnlocked();
    
    try {
      await this.executeCommand(['sync'], {
        useSession: true,
        timeout: BITWARDEN_CONFIG.LONG_TIMEOUT,
      });
      
      console.log('🔄 Bitwarden sync completed');
    } catch (error) {
      throw new BitwardenError(
        'Bitwarden sync failed',
        'SYNC_FAILED',
        error instanceof Error && 'exitCode' in error ? (error as any).exitCode : undefined,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * ログアウト
   */
  async logout(): Promise<void> {
    try {
      await this.executeCommand(['logout']);
      this.sessionToken = null;
      this.lastActivity = 0;
      console.log('👋 Logged out from Bitwarden');
    } catch (error) {
      console.warn('Warning: logout failed:', error);
    }
  }

  /**
   * コマンド実行
   */
  private async executeCommand(
    args: string[],
    options: {
      input?: string;
      timeout?: number;
      parseJson?: boolean;
      useSession?: boolean;
      env?: Record<string, string>;
    } = {}
  ): Promise<any> {
    const {
      input,
      timeout = BITWARDEN_CONFIG.DEFAULT_TIMEOUT,
      parseJson = false,
      useSession = false,
      env = process.env,
    } = options;

    // セッション使用時の環境変数設定
    let commandEnv = { ...env };
    if (useSession && this.sessionToken) {
      commandEnv.BW_SESSION = this.sessionToken;
    }

    // コマンドの引数をサニタイズ
    const sanitizedArgs = args.map(arg => {
      // 基本的なサニタイズ（nullバイト除去、長さ制限等）
      return arg.replace(/\0/g, '').slice(0, 1000);
    });

    let retries = 0;
    while (retries <= BITWARDEN_CONFIG.MAX_RETRIES) {
      try {
        const result = await this.execWithTimeout(
          BITWARDEN_CONFIG.COMMAND,
          sanitizedArgs,
          {
            input,
            timeout,
            env: commandEnv,
          }
        );

        this.lastActivity = Date.now();

        if (parseJson) {
          try {
            return JSON.parse(result);
          } catch (parseError) {
            throw new BitwardenError(
              'Failed to parse JSON response',
              'JSON_PARSE_FAILED',
              undefined,
              result
            );
          }
        }

        return result;
      } catch (error) {
        retries++;
        
        if (retries > BITWARDEN_CONFIG.MAX_RETRIES) {
          throw error;
        }
        
        // 一時的なエラーの場合は再試行
        if (error instanceof BitwardenError && this.isRetryableError(error)) {
          const delay = Math.pow(2, retries) * 1000; // 指数バックオフ
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }

    throw new BitwardenError('Maximum retries exceeded', 'MAX_RETRIES_EXCEEDED');
  }

  /**
   * タイムアウト付きコマンド実行
   */
  private async execWithTimeout(
    command: string,
    args: string[],
    options: {
      input?: string;
      timeout: number;
      env: Record<string, string>;
    }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: options.env,
        shell: false, // セキュリティのため無効
      });

      // タイムアウト設定
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new BitwardenError(
          `Command timeout after ${options.timeout}ms`,
          'COMMAND_TIMEOUT',
          undefined,
          `Command: ${command} ${args.join(' ')}`
        ));
      }, options.timeout);

      // 入力がある場合は送信
      if (options.input) {
        child.stdin!.write(options.input);
        child.stdin!.end();
      }

      // 出力の収集
      child.stdout!.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr!.on('data', (data) => {
        stderr += data.toString();
      });

      // プロセス終了処理
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new BitwardenError(
            `Bitwarden command failed with exit code ${code}`,
            'COMMAND_FAILED',
            code || undefined,
            stderr
          ));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new BitwardenError(
          `Failed to execute Bitwarden CLI: ${error.message}`,
          'EXECUTION_FAILED',
          undefined,
          error.message
        ));
      });
    });
  }

  /**
   * セッショントークンの暗号化保存
   */
  private async storeSessionToken(token: string): Promise<void> {
    try {
      if (!keyManager.getCurrentKey) return; // キー管理が初期化されていない場合はスキップ
      
      const encryptedToken = encrypt(
        token,
        keyManager.getCurrentKey(),
        keyManager.getCurrentKeyVersion(),
        { operation: 'store_session_token' }
      );
      
      // 実際の実装では安全なストレージに保存
      // このサンプルではメモリ内に保存（開発用）
      process.env._BW_ENCRYPTED_SESSION = JSON.stringify(encryptedToken);
    } catch (error) {
      console.warn('Failed to store encrypted session token:', error);
    }
  }

  /**
   * 再試行可能エラーの判定
   */
  private isRetryableError(error: BitwardenError): boolean {
    // ネットワークエラーやタイムアウトは再試行可能
    const retryableCodes = ['COMMAND_TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_ERROR'];
    return retryableCodes.includes(error.code);
  }

  /**
   * アンロック状態確認（内部用）
   */
  private ensureUnlocked(): void {
    if (!this.isUnlocked()) {
      throw new BitwardenError(
        'Bitwarden vault is locked. Please unlock first.',
        'VAULT_LOCKED'
      );
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    if (this.sessionToken) {
      try {
        await this.logout();
      } catch (error) {
        console.warn('Cleanup logout failed:', error);
      }
    }
    
    this.sessionToken = null;
    this.lastActivity = 0;
    this.isInitialized = false;
    
    // 環境変数からもクリア
    delete process.env._BW_ENCRYPTED_SESSION;
    
    console.log('🧹 Bitwarden client cleanup completed');
  }
}

// エクスポート用のファクトリー関数
export function createBitwardenClient(): BitwardenClient {
  return BitwardenClient.getInstance();
}