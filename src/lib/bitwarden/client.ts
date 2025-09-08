import { executeSecureCommand, CommandSecurityOptions } from '@/lib/docker-mcp/command-security';
import { z } from 'zod';

// =============================================================================
// Bitwarden CLI クライアント
// セキュアなシークレット管理とBitwarden Vaultとの統合
// =============================================================================

/**
 * Bitwardenアイテムタイプ
 */
export const BITWARDEN_ITEM_TYPES = {
  LOGIN: 1,
  SECURE_NOTE: 2,
  CARD: 3,
  IDENTITY: 4,
} as const;

/**
 * Bitwardenログインアイテム
 */
export interface BitwardenLogin {
  id: string;
  name: string;
  username?: string;
  password?: string;
  totp?: string;
  uris?: Array<{
    uri: string;
    match?: number;
  }>;
  notes?: string;
  organizationId?: string;
  folderId?: string;
  favorite: boolean;
  reprompt: number;
  creationDate: string;
  revisionDate: string;
}

/**
 * Bitwardenセキュアノート
 */
export interface BitwardenSecureNote {
  id: string;
  name: string;
  notes: string;
  organizationId?: string;
  folderId?: string;
  favorite: boolean;
  creationDate: string;
  revisionDate: string;
}

/**
 * Bitwardenフォルダ
 */
export interface BitwardenFolder {
  id: string;
  name: string;
}

/**
 * Bitwarden検索結果
 */
export interface BitwardenSearchResult {
  items: BitwardenLogin[];
  folders: BitwardenFolder[];
  totalCount: number;
}

/**
 * Bitwardenクライアント設定
 */
export interface BitwardenClientConfig {
  cliPath?: string; // bw CLIのパス（デフォルト: 'bw'）
  sessionToken?: string; // セッショントークン
  serverUrl?: string; // サーバーURL（セルフホスト用）
  timeout?: number; // コマンドタイムアウト（秒）
  maxRetries?: number; // 最大リトライ回数
}

/**
 * Bitwardenアイテム作成データ
 */
export interface CreateItemData {
  name: string;
  type: typeof BITWARDEN_ITEM_TYPES[keyof typeof BITWARDEN_ITEM_TYPES];
  login?: {
    username?: string;
    password?: string;
    uris?: Array<{ uri: string }>;
  };
  notes?: string;
  folderId?: string;
  organizationId?: string;
  favorite?: boolean;
}

/**
 * Bitwardenバリデーションスキーマ
 */
const BitwardenLoginSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
  totp: z.string().optional(),
  uris: z.array(z.object({
    uri: z.string(),
    match: z.number().optional(),
  })).optional(),
  notes: z.string().optional(),
  organizationId: z.string().optional(),
  folderId: z.string().optional(),
  favorite: z.boolean(),
  reprompt: z.number(),
  creationDate: z.string(),
  revisionDate: z.string(),
});

/**
 * Bitwardenクライアントクラス
 */
export class BitwardenClient {
  private config: Required<BitwardenClientConfig>;
  private sessionToken?: string;
  private lastSyncTime?: Date;

  constructor(config: BitwardenClientConfig = {}) {
    this.config = {
      cliPath: config.cliPath || 'bw',
      sessionToken: config.sessionToken || process.env.BITWARDEN_SESSION_TOKEN,
      serverUrl: config.serverUrl || process.env.BITWARDEN_SERVER_URL,
      timeout: config.timeout || 30,
      maxRetries: config.maxRetries || 3,
    };

    this.sessionToken = this.config.sessionToken;
  }

  /**
   * Bitwardenにログイン
   * @param email メールアドレス
   * @param password パスワード
   * @param twoFactorCode 2FA コード（必要な場合）
   * @returns セッショントークン
   */
  async login(email: string, password: string, twoFactorCode?: string): Promise<string> {
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // セキュリティオプション
      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024, // 1MB
        sanitizeOutput: true,
      };

      // ログインコマンドの構築
      const args = ['login', email, password];
      if (twoFactorCode) {
        args.push('--code', twoFactorCode);
      }
      if (this.config.serverUrl) {
        args.push('--server', this.config.serverUrl);
      }

      // ログイン実行
      const result = await executeSecureCommand(
        this.config.cliPath,
        args,
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden login failed: ${result.stderr || result.stdout}`);
      }

      // セッショントークンを抽出（通常は標準出力に含まれる）
      const sessionTokenMatch = result.stdout.match(/--session\s+([A-Za-z0-9+/=]+)/);
      if (!sessionTokenMatch) {
        throw new Error('Session token not found in login response');
      }

      this.sessionToken = sessionTokenMatch[1];
      return this.sessionToken;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden login failed: ${error.message}`);
      }
      throw new Error('Bitwarden login failed: Unknown error');
    }
  }

  /**
   * セッションをアンロック
   * @param password マスターパスワード
   * @returns セッショントークン
   */
  async unlock(password: string): Promise<string> {
    try {
      if (!password) {
        throw new Error('Password is required');
      }

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024,
        sanitizeOutput: true,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['unlock', password, '--raw'],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden unlock failed: ${result.stderr || 'Invalid password'}`);
      }

      this.sessionToken = result.stdout.trim();
      return this.sessionToken;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden unlock failed: ${error.message}`);
      }
      throw new Error('Bitwarden unlock failed: Unknown error');
    }
  }

  /**
   * Vaultをロック
   */
  async lock(): Promise<void> {
    try {
      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: 10000,
        maxOutputSize: 1024,
        sanitizeOutput: true,
      };

      await executeSecureCommand(
        this.config.cliPath,
        ['lock'],
        securityOptions
      );

      this.sessionToken = undefined;

    } catch (error) {
      // ロック失敗は警告として扱う
      console.warn('Bitwarden lock warning:', error);
    }
  }

  /**
   * Vaultを同期
   */
  async sync(): Promise<void> {
    try {
      this.ensureAuthenticated();

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024,
        sanitizeOutput: true,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['sync', '--session', this.sessionToken!],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden sync failed: ${result.stderr || result.stdout}`);
      }

      this.lastSyncTime = new Date();

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden sync failed: ${error.message}`);
      }
      throw new Error('Bitwarden sync failed: Unknown error');
    }
  }

  /**
   * アイテムを検索
   * @param query 検索クエリ
   * @param folderId フォルダID（省略時は全フォルダ）
   * @returns 検索結果
   */
  async searchItems(query: string, folderId?: string): Promise<BitwardenSearchResult> {
    try {
      this.ensureAuthenticated();

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 10 * 1024 * 1024, // 10MB
        sanitizeOutput: false, // JSONデータを保持
      };

      // 検索コマンドの構築
      const args = ['list', 'items', '--search', query, '--session', this.sessionToken!];
      if (folderId) {
        args.push('--folderid', folderId);
      }

      const result = await executeSecureCommand(
        this.config.cliPath,
        args,
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden search failed: ${result.stderr || result.stdout}`);
      }

      // JSONレスポンスをパース
      const items = JSON.parse(result.stdout);
      
      // バリデーション
      const validatedItems = items.map((item: unknown) => {
        const validation = BitwardenLoginSchema.safeParse(item);
        if (!validation.success) {
          console.warn('Invalid Bitwarden item format:', validation.error);
          return null;
        }
        return validation.data;
      }).filter(Boolean);

      // フォルダ一覧も取得
      const folders = await this.listFolders();

      return {
        items: validatedItems,
        folders,
        totalCount: validatedItems.length,
      };

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden search failed: ${error.message}`);
      }
      throw new Error('Bitwarden search failed: Unknown error');
    }
  }

  /**
   * アイテムをIDで取得
   * @param id アイテムID
   * @returns アイテム詳細
   */
  async getItem(id: string): Promise<BitwardenLogin> {
    try {
      this.ensureAuthenticated();

      if (!id) {
        throw new Error('Item ID is required');
      }

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024,
        sanitizeOutput: false,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['get', 'item', id, '--session', this.sessionToken!],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden get item failed: ${result.stderr || result.stdout}`);
      }

      const item = JSON.parse(result.stdout);
      
      // バリデーション
      const validation = BitwardenLoginSchema.safeParse(item);
      if (!validation.success) {
        throw new Error(`Invalid item format: ${validation.error.message}`);
      }

      return validation.data;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden get item failed: ${error.message}`);
      }
      throw new Error('Bitwarden get item failed: Unknown error');
    }
  }

  /**
   * 新しいアイテムを作成
   * @param itemData アイテム作成データ
   * @returns 作成されたアイテムID
   */
  async createItem(itemData: CreateItemData): Promise<string> {
    try {
      this.ensureAuthenticated();

      if (!itemData.name || !itemData.type) {
        throw new Error('Item name and type are required');
      }

      // アイテムテンプレートを作成
      const template = {
        type: itemData.type,
        name: itemData.name,
        notes: itemData.notes || '',
        favorite: itemData.favorite || false,
        folderId: itemData.folderId,
        organizationId: itemData.organizationId,
      };

      // ログイン情報を追加
      if (itemData.login && itemData.type === BITWARDEN_ITEM_TYPES.LOGIN) {
        (template as any).login = {
          username: itemData.login.username || '',
          password: itemData.login.password || '',
          uris: itemData.login.uris || [],
        };
      }

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024,
        sanitizeOutput: false,
      };

      // アイテムを作成
      const result = await executeSecureCommand(
        this.config.cliPath,
        ['create', 'item', JSON.stringify(template), '--session', this.sessionToken!],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden create item failed: ${result.stderr || result.stdout}`);
      }

      const createdItem = JSON.parse(result.stdout);
      return createdItem.id;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden create item failed: ${error.message}`);
      }
      throw new Error('Bitwarden create item failed: Unknown error');
    }
  }

  /**
   * アイテムを更新
   * @param id アイテムID
   * @param updateData 更新データ
   */
  async updateItem(id: string, updateData: Partial<CreateItemData>): Promise<void> {
    try {
      this.ensureAuthenticated();

      if (!id) {
        throw new Error('Item ID is required');
      }

      // 既存アイテムを取得
      const existingItem = await this.getItem(id);

      // 更新データをマージ
      const updatedItem = {
        ...existingItem,
        ...updateData,
      };

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024,
        sanitizeOutput: false,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['edit', 'item', id, JSON.stringify(updatedItem), '--session', this.sessionToken!],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden update item failed: ${result.stderr || result.stdout}`);
      }

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden update item failed: ${error.message}`);
      }
      throw new Error('Bitwarden update item failed: Unknown error');
    }
  }

  /**
   * アイテムを削除
   * @param id アイテムID
   */
  async deleteItem(id: string): Promise<void> {
    try {
      this.ensureAuthenticated();

      if (!id) {
        throw new Error('Item ID is required');
      }

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024,
        sanitizeOutput: true,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['delete', 'item', id, '--session', this.sessionToken!],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden delete item failed: ${result.stderr || result.stdout}`);
      }

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden delete item failed: ${error.message}`);
      }
      throw new Error('Bitwarden delete item failed: Unknown error');
    }
  }

  /**
   * フォルダ一覧を取得
   * @returns フォルダ一覧
   */
  async listFolders(): Promise<BitwardenFolder[]> {
    try {
      this.ensureAuthenticated();

      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: this.config.timeout * 1000,
        maxOutputSize: 1024 * 1024,
        sanitizeOutput: false,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['list', 'folders', '--session', this.sessionToken!],
        securityOptions
      );

      if (result.exitCode !== 0) {
        throw new Error(`Bitwarden list folders failed: ${result.stderr || result.stdout}`);
      }

      const folders = JSON.parse(result.stdout);
      return folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name,
      }));

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bitwarden list folders failed: ${error.message}`);
      }
      throw new Error('Bitwarden list folders failed: Unknown error');
    }
  }

  /**
   * Vaultのステータスを確認
   * @returns ステータス情報
   */
  async getStatus(): Promise<{
    status: 'unlocked' | 'locked' | 'unauthenticated';
    userId?: string;
    email?: string;
    lastSync?: Date;
  }> {
    try {
      const securityOptions: CommandSecurityOptions = {
        allowedCommands: [this.config.cliPath],
        timeout: 10000,
        maxOutputSize: 1024,
        sanitizeOutput: false,
      };

      const result = await executeSecureCommand(
        this.config.cliPath,
        ['status'],
        securityOptions
      );

      if (result.exitCode !== 0) {
        return { status: 'unauthenticated' };
      }

      const status = JSON.parse(result.stdout);
      
      return {
        status: status.status,
        userId: status.userId,
        email: status.userEmail,
        lastSync: this.lastSyncTime,
      };

    } catch (error) {
      return { status: 'unauthenticated' };
    }
  }

  /**
   * セッション認証状態を確認
   */
  private ensureAuthenticated(): void {
    if (!this.sessionToken) {
      throw new Error('Not authenticated. Call login() or unlock() first.');
    }
  }

  /**
   * リソースのクリーンアップ
   */
  dispose(): void {
    this.sessionToken = undefined;
    this.lastSyncTime = undefined;
  }
}