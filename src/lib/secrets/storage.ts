/**
 * シークレットストレージサービス
 * 
 * セキュリティ要件：
 * - AES-256-GCM暗号化による機密データ保護
 * - Bitwardenとの統合によるシークレット管理
 * - バージョン管理とキーローテーション対応
 * - 安全な検索とフィルタリング
 * - 監査ログと操作履歴
 */

import { randomUUID } from 'crypto';
import { encrypt, decrypt, keyManager, EncryptionResult, CryptoError } from '../crypto';
import { BitwardenClient, BitwardenError } from '../bitwarden';

/**
 * シークレット種別
 */
export enum SecretType {
  PASSWORD = 'password',
  API_KEY = 'api_key',
  TOKEN = 'token',
  CERTIFICATE = 'certificate',
  SSH_KEY = 'ssh_key',
  DATABASE_URL = 'database_url',
  ENVIRONMENT_VAR = 'environment_var',
  OTHER = 'other',
}

/**
 * シークレットソース
 */
export enum SecretSource {
  LOCAL = 'local',
  BITWARDEN = 'bitwarden',
  EXTERNAL = 'external',
}

/**
 * シークレットメタデータ
 */
export interface SecretMetadata {
  id: string;
  name: string;
  description?: string;
  type: SecretType;
  source: SecretSource;
  tags?: string[];
  serverId?: string; // 関連するMCPサーバーID
  environmentVariable?: string; // 環境変数名
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  isActive: boolean;
  accessCount: number;
  lastAccessedAt?: string;
  // Bitwarden固有
  bitwardenItemId?: string;
  bitwardenFieldName?: string;
}

/**
 * 暗号化されたシークレット
 */
export interface EncryptedSecret {
  metadata: SecretMetadata;
  encryptedValue: EncryptionResult;
  checksum: string; // 整合性チェック用
}

/**
 * シークレットストレージエラー
 */
export class SecretStorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'SecretStorageError';
  }
}

/**
 * シークレット検索フィルター
 */
export interface SecretSearchFilter {
  query?: string;
  type?: SecretType;
  source?: SecretSource;
  serverId?: string;
  tags?: string[];
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * シークレットストレージサービス
 */
export class SecretStorageService {
  private static instance: SecretStorageService;
  private secrets: Map<string, EncryptedSecret> = new Map();
  private bitwardenClient: BitwardenClient;
  private isInitialized = false;

  private constructor() {
    this.bitwardenClient = BitwardenClient.getInstance();
  }

  /**
   * シングルトンインスタンス取得
   */
  static getInstance(): SecretStorageService {
    if (!SecretStorageService.instance) {
      SecretStorageService.instance = new SecretStorageService();
    }
    return SecretStorageService.instance;
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    try {
      // キー管理システムの初期化
      await keyManager.initialize();
      
      // Bitwardenクライアントの初期化
      await this.bitwardenClient.initialize();
      
      // 既存シークレットの読み込み
      await this.loadExistingSecrets();
      
      this.isInitialized = true;
      console.log('🔐 Secret storage service initialized');
    } catch (error) {
      throw new SecretStorageError(
        'Secret storage initialization failed',
        'STORAGE_INIT_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * シークレット保存
   */
  async storeSecret(
    name: string,
    value: string,
    metadata: Partial<SecretMetadata>,
    userId: string
  ): Promise<string> {
    this.ensureInitialized();
    
    try {
      const secretId = metadata.id || randomUUID();
      const now = new Date().toISOString();
      
      // メタデータの作成
      const fullMetadata: SecretMetadata = {
        id: secretId,
        name,
        description: metadata.description,
        type: metadata.type || SecretType.OTHER,
        source: metadata.source || SecretSource.LOCAL,
        tags: metadata.tags || [],
        serverId: metadata.serverId,
        environmentVariable: metadata.environmentVariable,
        expiresAt: metadata.expiresAt,
        createdAt: metadata.createdAt || now,
        updatedAt: now,
        createdBy: metadata.createdBy || userId,
        updatedBy: userId,
        version: (metadata.version || 0) + 1,
        isActive: metadata.isActive !== false,
        accessCount: metadata.accessCount || 0,
        lastAccessedAt: metadata.lastAccessedAt,
        bitwardenItemId: metadata.bitwardenItemId,
        bitwardenFieldName: metadata.bitwardenFieldName,
      };

      // 値の暗号化
      const encryptedValue = encrypt(
        value,
        keyManager.getCurrentKey(),
        keyManager.getCurrentKeyVersion(),
        {
          userId,
          resourceId: secretId,
          operation: 'store_secret',
          timestamp: now,
        }
      );

      // チェックサムの計算
      const checksum = this.calculateChecksum(value, fullMetadata);

      const encryptedSecret: EncryptedSecret = {
        metadata: fullMetadata,
        encryptedValue,
        checksum,
      };

      this.secrets.set(secretId, encryptedSecret);
      
      // 永続化
      await this.persistSecret(encryptedSecret);
      
      // 監査ログ
      this.logSecretOperation('store', secretId, userId);
      
      console.log(`🔐 Secret stored: ${name} (${secretId})`);
      return secretId;
    } catch (error) {
      throw new SecretStorageError(
        'Failed to store secret',
        'STORE_FAILED',
        {
          name,
          error: error instanceof Error ? error.message : String(error),
          userId,
        }
      );
    }
  }

  /**
   * シークレット取得
   */
  async getSecret(secretId: string, userId: string): Promise<string> {
    this.ensureInitialized();
    
    try {
      const encryptedSecret = this.secrets.get(secretId);
      if (!encryptedSecret) {
        // Bitwardenから試行
        const bitwardenSecret = await this.getSecretFromBitwarden(secretId, userId);
        if (bitwardenSecret) return bitwardenSecret;
        
        throw new SecretStorageError(
          `Secret not found: ${secretId}`,
          'SECRET_NOT_FOUND',
          { secretId, userId }
        );
      }

      if (!encryptedSecret.metadata.isActive) {
        throw new SecretStorageError(
          `Secret is inactive: ${secretId}`,
          'SECRET_INACTIVE',
          { secretId, userId }
        );
      }

      // 期限チェック
      if (encryptedSecret.metadata.expiresAt) {
        const expiryDate = new Date(encryptedSecret.metadata.expiresAt);
        if (expiryDate < new Date()) {
          throw new SecretStorageError(
            `Secret has expired: ${secretId}`,
            'SECRET_EXPIRED',
            { secretId, userId, expiresAt: encryptedSecret.metadata.expiresAt }
          );
        }
      }

      // 復号化
      const key = keyManager.getKey(encryptedSecret.encryptedValue.metadata.keyVersion);
      const decryptedValue = decrypt(encryptedSecret.encryptedValue, key);

      // 整合性チェック
      const expectedChecksum = this.calculateChecksum(decryptedValue, encryptedSecret.metadata);
      if (expectedChecksum !== encryptedSecret.checksum) {
        throw new SecretStorageError(
          'Secret integrity check failed',
          'INTEGRITY_CHECK_FAILED',
          { secretId, userId }
        );
      }

      // アクセス統計の更新
      await this.updateAccessStats(secretId, userId);
      
      // 監査ログ
      this.logSecretOperation('access', secretId, userId);
      
      return decryptedValue;
    } catch (error) {
      if (error instanceof SecretStorageError) {
        throw error;
      }
      
      throw new SecretStorageError(
        'Failed to retrieve secret',
        'RETRIEVE_FAILED',
        {
          secretId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Bitwardenからシークレット取得
   */
  private async getSecretFromBitwarden(secretId: string, userId: string): Promise<string | null> {
    try {
      if (!this.bitwardenClient.isUnlocked()) {
        return null;
      }

      // secretIdをbitwardenItemIdとして扱う
      const password = await this.bitwardenClient.getPassword(secretId);
      
      if (password) {
        this.logSecretOperation('bitwarden_access', secretId, userId);
      }
      
      return password;
    } catch (error) {
      console.warn('Failed to retrieve secret from Bitwarden:', error);
      return null;
    }
  }

  /**
   * シークレット一覧取得
   */
  async listSecrets(filter: SecretSearchFilter = {}): Promise<SecretMetadata[]> {
    this.ensureInitialized();
    
    let results = Array.from(this.secrets.values()).map(s => s.metadata);
    
    // フィルタリング
    if (filter.query) {
      const query = filter.query.toLowerCase();
      results = results.filter(s => 
        s.name.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query)) ||
        (s.tags && s.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
    if (filter.type) {
      results = results.filter(s => s.type === filter.type);
    }
    
    if (filter.source) {
      results = results.filter(s => s.source === filter.source);
    }
    
    if (filter.serverId) {
      results = results.filter(s => s.serverId === filter.serverId);
    }
    
    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(s => 
        s.tags && filter.tags!.some(tag => s.tags!.includes(tag))
      );
    }
    
    if (filter.isActive !== undefined) {
      results = results.filter(s => s.isActive === filter.isActive);
    }

    // ソート（更新日時の降順）
    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    
    // ページネーション
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    
    return results.slice(offset, offset + limit);
  }

  /**
   * シークレット削除
   */
  async deleteSecret(secretId: string, userId: string): Promise<void> {
    this.ensureInitialized();
    
    const encryptedSecret = this.secrets.get(secretId);
    if (!encryptedSecret) {
      throw new SecretStorageError(
        `Secret not found: ${secretId}`,
        'SECRET_NOT_FOUND',
        { secretId, userId }
      );
    }

    // 削除マーク（実際の削除ではなく無効化）
    encryptedSecret.metadata.isActive = false;
    encryptedSecret.metadata.updatedAt = new Date().toISOString();
    encryptedSecret.metadata.updatedBy = userId;

    await this.persistSecret(encryptedSecret);
    
    this.logSecretOperation('delete', secretId, userId);
    console.log(`🗑️  Secret deleted: ${secretId}`);
  }

  /**
   * Bitwardenとの同期
   */
  async syncWithBitwarden(userId: string): Promise<number> {
    this.ensureInitialized();
    
    try {
      if (!this.bitwardenClient.isUnlocked()) {
        throw new SecretStorageError(
          'Bitwarden is not unlocked',
          'BITWARDEN_LOCKED'
        );
      }

      await this.bitwardenClient.sync();
      const items = await this.bitwardenClient.listItems();
      
      let syncedCount = 0;
      
      for (const item of items) {
        // ログインアイテムのみ処理
        if (item.type === 1 && item.login?.password) {
          const secretId = await this.storeSecret(
            item.name,
            item.login.password,
            {
              type: SecretType.PASSWORD,
              source: SecretSource.BITWARDEN,
              description: `Synced from Bitwarden: ${item.name}`,
              bitwardenItemId: item.id,
              tags: ['bitwarden', 'synced'],
            },
            userId
          );
          
          syncedCount++;
        }
      }
      
      console.log(`🔄 Synced ${syncedCount} secrets from Bitwarden`);
      return syncedCount;
    } catch (error) {
      throw new SecretStorageError(
        'Bitwarden sync failed',
        'BITWARDEN_SYNC_FAILED',
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        }
      );
    }
  }

  /**
   * キーローテーション対応
   */
  async rotateKeys(userId: string): Promise<number> {
    this.ensureInitialized();
    
    try {
      // 新しいキーを生成
      const newKeyVersion = await keyManager.rotateKey('manual_rotation');
      
      let reencryptedCount = 0;
      
      // すべてのシークレットを新しいキーで再暗号化
      for (const [secretId, encryptedSecret] of this.secrets.entries()) {
        if (encryptedSecret.metadata.isActive) {
          try {
            // 古いキーで復号化
            const oldKey = keyManager.getKey(encryptedSecret.encryptedValue.metadata.keyVersion);
            const plaintext = decrypt(encryptedSecret.encryptedValue, oldKey);
            
            // 新しいキーで暗号化
            const newEncryptedValue = encrypt(
              plaintext,
              keyManager.getCurrentKey(),
              newKeyVersion,
              {
                userId,
                resourceId: secretId,
                operation: 'reencrypt',
                timestamp: new Date().toISOString(),
              }
            );
            
            encryptedSecret.encryptedValue = newEncryptedValue;
            encryptedSecret.metadata.updatedAt = new Date().toISOString();
            encryptedSecret.metadata.updatedBy = userId;
            encryptedSecret.checksum = this.calculateChecksum(plaintext, encryptedSecret.metadata);
            
            await this.persistSecret(encryptedSecret);
            reencryptedCount++;
          } catch (error) {
            console.error(`Failed to reencrypt secret ${secretId}:`, error);
          }
        }
      }
      
      console.log(`🔑 Reencrypted ${reencryptedCount} secrets with new key ${newKeyVersion}`);
      return reencryptedCount;
    } catch (error) {
      throw new SecretStorageError(
        'Key rotation failed',
        'KEY_ROTATION_FAILED',
        {
          error: error instanceof Error ? error.message : String(error),
          userId,
        }
      );
    }
  }

  // プライベートメソッド

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new SecretStorageError(
        'Secret storage service not initialized',
        'NOT_INITIALIZED'
      );
    }
  }

  private calculateChecksum(value: string, metadata: SecretMetadata): string {
    const { createHash } = require('crypto');
    const data = value + JSON.stringify({
      id: metadata.id,
      name: metadata.name,
      type: metadata.type,
      version: metadata.version,
    });
    return createHash('sha256').update(data).digest('hex');
  }

  private async persistSecret(encryptedSecret: EncryptedSecret): Promise<void> {
    // 実際の実装では安全なデータベースに保存
    // このサンプルではメモリ内に保存
    console.log(`💾 Persisted secret: ${encryptedSecret.metadata.id} (mock)`);
  }

  private async loadExistingSecrets(): Promise<void> {
    // 実際の実装では永続化ストレージから読み込み
    console.log('📂 Loading existing secrets (mock)');
  }

  private async updateAccessStats(secretId: string, userId: string): Promise<void> {
    const encryptedSecret = this.secrets.get(secretId);
    if (encryptedSecret) {
      encryptedSecret.metadata.accessCount++;
      encryptedSecret.metadata.lastAccessedAt = new Date().toISOString();
      await this.persistSecret(encryptedSecret);
    }
  }

  private logSecretOperation(operation: string, secretId: string, userId: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      secretId,
      userId,
      userAgent: 'SecretStorageService',
    };
    
    console.log(`📋 Audit: ${JSON.stringify(logEntry)}`);
    // 実際の実装では監査ログシステムに送信
  }

  /**
   * サービスのシャットダウン
   */
  async shutdown(): Promise<void> {
    await this.bitwardenClient.cleanup();
    this.secrets.clear();
    this.isInitialized = false;
    console.log('🔒 Secret storage service shutdown completed');
  }
}

// シングルトンインスタンス
export const secretStorageService = SecretStorageService.getInstance();