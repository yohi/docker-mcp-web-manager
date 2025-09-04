import { z } from 'zod';
import { EventEmitter } from 'events';
import {
  buildSecureCommandArray,
  validateAndSanitizeArgs,
} from '../utils/command-security';
import { ProcessExecutor, ProcessError } from '../utils/process-executor';

/**
 * Bitwardenアイテムのスキーマ定義
 */
export const bitwardenItemSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  folderId: z.string().nullable(),
  type: z.number(),
  reprompt: z.number(),
  name: z.string(),
  notes: z.string().nullable(),
  favorite: z.boolean(),
  login: z.object({
    username: z.string().nullable(),
    password: z.string().nullable(),
    totp: z.string().nullable(),
    uris: z.array(z.object({
      match: z.number().nullable(),
      uri: z.string(),
    })).nullable(),
  }).nullable(),
  secureNote: z.any().nullable(),
  card: z.any().nullable(),
  identity: z.any().nullable(),
  fields: z.array(z.object({
    name: z.string(),
    value: z.string(),
    type: z.number(),
    linkedId: z.number().nullable(),
  })).nullable(),
  passwordHistory: z.array(z.any()).nullable(),
  revisionDate: z.string(),
  creationDate: z.string(),
  deletedDate: z.string().nullable(),
});

export const bitwardenListResponseSchema = z.array(bitwardenItemSchema);

export const bitwardenStatusSchema = z.object({
  serverUrl: z.string().nullable(),
  lastSync: z.string().nullable(),
  userEmail: z.string().nullable(),
  userId: z.string().nullable(),
  status: z.enum(['unauthenticated', 'locked', 'unlocked']),
});

export type BitwardenItem = z.infer<typeof bitwardenItemSchema>;
export type BitwardenStatus = z.infer<typeof bitwardenStatusSchema>;

/**
 * BitwardenエラーのSchema
 */
export interface BitwardenError {
  error: {
    code: string;
    message: string;
    details?: any;
    exitCode?: number;
    stderr?: string;
  };
}

/**
 * Bitwarden CLI統合クライアント
 * セキュアなBitwarden CLI操作を提供
 */
export class BitwardenClient extends EventEmitter {
  private static instance: BitwardenClient | null = null;
  private sessionToken: string | null = null;
  private isAuthenticated: boolean = false;

  private constructor() {
    super();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): BitwardenClient {
    if (!BitwardenClient.instance) {
      BitwardenClient.instance = new BitwardenClient();
    }
    return BitwardenClient.instance;
  }

  /**
   * Bitwardenステータスを取得
   */
  async getStatus(): Promise<BitwardenStatus> {
    try {
      this.emit('operationStart', { operation: 'getStatus' });

      const commandArray = buildSecureCommandArray('bw', 'status', []);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 10000,
        maxRetries: 1,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedStatus = bitwardenStatusSchema.parse(parsedOutput);

      this.emit('operationComplete', { operation: 'getStatus', status: validatedStatus.status });
      return validatedStatus;
    } catch (error) {
      this.emit('operationError', { operation: 'getStatus', error });
      throw this.createBitwardenError('GET_STATUS_ERROR', 'Failed to get Bitwarden status', error);
    }
  }

  /**
   * Bitwardenにログイン
   */
  async login(email: string, password: string, serverUrl?: string): Promise<boolean> {
    try {
      const sanitizedArgs = validateAndSanitizeArgs({ email, password, serverUrl });
      this.emit('operationStart', { operation: 'login', email: sanitizedArgs.email });

      const args: string[] = [];
      
      if (sanitizedArgs.serverUrl) {
        args.push('--server', sanitizedArgs.serverUrl);
      }

      const commandArray = buildSecureCommandArray('bw', 'login', [
        sanitizedArgs.email!,
        sanitizedArgs.password!,
        ...args
      ]);

      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 30000,
        maxRetries: 1,
      });

      // ログイン成功の判定（stderrまたはstdoutをチェック）
      const output = result.stdout + result.stderr;
      const loginSuccess = output.includes('You are logged in!') || 
                          output.includes('already logged in as');

      if (loginSuccess) {
        this.isAuthenticated = true;
        this.emit('operationComplete', { operation: 'login', email: sanitizedArgs.email });
        return true;
      } else {
        throw new Error('Login failed: Invalid credentials or server error');
      }
    } catch (error) {
      this.emit('operationError', { operation: 'login', email, error });
      throw this.createBitwardenError('LOGIN_ERROR', 'Failed to login to Bitwarden', error);
    }
  }

  /**
   * Bitwardenをアンロック（セッショントークン取得）
   */
  async unlock(password: string): Promise<string> {
    try {
      const sanitizedPassword = validateAndSanitizeArgs({ password }).password!;
      this.emit('operationStart', { operation: 'unlock' });

      const commandArray = buildSecureCommandArray('bw', 'unlock', [sanitizedPassword, '--raw']);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 30000,
        maxRetries: 1,
      });

      // セッショントークンは stdout に出力される
      const sessionToken = result.stdout.trim();
      
      if (!sessionToken) {
        throw new Error('Failed to obtain session token');
      }

      this.sessionToken = sessionToken;
      this.emit('operationComplete', { operation: 'unlock' });
      
      return sessionToken;
    } catch (error) {
      this.emit('operationError', { operation: 'unlock', error });
      throw this.createBitwardenError('UNLOCK_ERROR', 'Failed to unlock Bitwarden vault', error);
    }
  }

  /**
   * Bitwardenからアイテム一覧を取得
   */
  async listItems(search?: string): Promise<BitwardenItem[]> {
    try {
      if (!this.sessionToken) {
        throw new Error('Not authenticated. Please unlock the vault first.');
      }

      const sanitizedArgs = validateAndSanitizeArgs({ search });
      this.emit('operationStart', { operation: 'listItems', search: sanitizedArgs.search });

      const args = ['--session', this.sessionToken];
      
      if (sanitizedArgs.search) {
        args.push('--search', sanitizedArgs.search);
      }

      const commandArray = buildSecureCommandArray('bw', 'list', ['items', ...args]);
      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 30000,
        maxRetries: 2,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedItems = bitwardenListResponseSchema.parse(parsedOutput);

      this.emit('operationComplete', { 
        operation: 'listItems', 
        itemCount: validatedItems.length,
        search: sanitizedArgs.search 
      });

      return validatedItems;
    } catch (error) {
      this.emit('operationError', { operation: 'listItems', search, error });
      throw this.createBitwardenError('LIST_ITEMS_ERROR', 'Failed to list Bitwarden items', error);
    }
  }

  /**
   * 特定のアイテムを取得
   */
  async getItem(itemId: string): Promise<BitwardenItem> {
    try {
      if (!this.sessionToken) {
        throw new Error('Not authenticated. Please unlock the vault first.');
      }

      const sanitizedId = validateAndSanitizeArgs({ itemId }).itemId!;
      this.emit('operationStart', { operation: 'getItem', itemId: sanitizedId });

      const commandArray = buildSecureCommandArray('bw', 'get', [
        'item',
        sanitizedId,
        '--session', this.sessionToken
      ]);

      const result = await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 15000,
        maxRetries: 1,
      });

      const parsedOutput = this.parseJsonOutput(result.stdout);
      const validatedItem = bitwardenItemSchema.parse(parsedOutput);

      this.emit('operationComplete', { operation: 'getItem', itemId: sanitizedId });
      return validatedItem;
    } catch (error) {
      this.emit('operationError', { operation: 'getItem', itemId, error });
      throw this.createBitwardenError('GET_ITEM_ERROR', `Failed to get Bitwarden item ${itemId}`, error);
    }
  }

  /**
   * パスワードを取得
   */
  async getPassword(itemId: string): Promise<string | null> {
    try {
      const item = await this.getItem(itemId);
      return item.login?.password || null;
    } catch (error) {
      throw this.createBitwardenError('GET_PASSWORD_ERROR', `Failed to get password for item ${itemId}`, error);
    }
  }

  /**
   * 環境変数値を取得（カスタムフィールドまたはパスワード）
   */
  async getEnvironmentValue(itemId: string, fieldName?: string): Promise<string | null> {
    try {
      const item = await this.getItem(itemId);

      // カスタムフィールドから検索
      if (fieldName && item.fields) {
        const field = item.fields.find(f => f.name === fieldName);
        if (field) {
          return field.value;
        }
      }

      // フィールドが見つからない場合はパスワードを返す
      return item.login?.password || null;
    } catch (error) {
      throw this.createBitwardenError(
        'GET_ENV_VALUE_ERROR', 
        `Failed to get environment value for item ${itemId}`, 
        error
      );
    }
  }

  /**
   * ログアウト
   */
  async logout(): Promise<void> {
    try {
      this.emit('operationStart', { operation: 'logout' });

      const commandArray = buildSecureCommandArray('bw', 'logout', []);
      await ProcessExecutor.execute(commandArray[0], commandArray.slice(1), {
        timeout: 10000,
        maxRetries: 1,
      });

      this.sessionToken = null;
      this.isAuthenticated = false;

      this.emit('operationComplete', { operation: 'logout' });
    } catch (error) {
      this.emit('operationError', { operation: 'logout', error });
      // ログアウトエラーは非致命的
      console.warn('Logout warning:', error);
    }
  }

  /**
   * 認証状態をチェック
   */
  isUnlocked(): boolean {
    return !!this.sessionToken;
  }

  /**
   * セッショントークンをクリア
   */
  clearSession(): void {
    this.sessionToken = null;
  }

  /**
   * JSON出力を安全に解析
   */
  private parseJsonOutput(output: string): any {
    try {
      const trimmed = output.trim();
      if (!trimmed) {
        throw new Error('Empty output');
      }
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${error}. Output: ${output.substring(0, 200)}`);
    }
  }

  /**
   * Bitwardenエラーを作成
   */
  private createBitwardenError(code: string, message: string, originalError?: any): BitwardenError {
    const processError = originalError as ProcessError;
    
    return {
      error: {
        code,
        message,
        details: processError ? {
          stderr: processError.stderr,
          executionTime: processError.executionTime,
          retryCount: processError.retryCount,
        } : originalError?.message || originalError,
        exitCode: processError?.exitCode,
        stderr: processError?.stderr,
      }
    };
  }
}