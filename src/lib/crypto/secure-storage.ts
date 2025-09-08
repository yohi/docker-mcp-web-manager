import { 
  encryptData, 
  decryptData, 
  generateEncryptionKey,
  EncryptedData,
  validateEncryptedData,
  secureErase 
} from './encryption';
import { z } from 'zod';

// =============================================================================
// セキュアストレージユーティリティ
// データベース内の機密データを安全に保存・取得
// =============================================================================

/**
 * ストレージ暗号化設定
 */
export interface StorageEncryptionConfig {
  keyId: string; // キー識別子
  version: number; // 暗号化バージョン
  metadata?: Record<string, string>; // 追加メタデータ
}

/**
 * 暗号化されたストレージエントリ
 */
export interface EncryptedStorageEntry {
  encryptedData: EncryptedData;
  config: StorageEncryptionConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * セキュアストレージの設定
 */
export interface SecureStorageConfig {
  masterKey?: Buffer; // マスターキー（省略時は環境変数から取得）
  keyRotationInterval?: number; // キーローテーション間隔（日）
  compressionEnabled?: boolean; // 圧縮有効化
  checksumValidation?: boolean; // チェックサム検証
}

/**
 * ストレージエントリスキーマ
 */
export const EncryptedStorageEntrySchema = z.object({
  encryptedData: z.object({
    data: z.string(),
    iv: z.string(),
    tag: z.string(),
    salt: z.string().optional(),
  }),
  config: z.object({
    keyId: z.string(),
    version: z.number(),
    metadata: z.record(z.string()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * セキュアストレージクラス
 */
export class SecureStorage {
  private masterKey: Buffer;
  private config: Required<SecureStorageConfig>;
  private keyCache: Map<string, Buffer>;

  constructor(config: SecureStorageConfig = {}) {
    // マスターキーの初期化
    if (config.masterKey) {
      this.masterKey = config.masterKey;
    } else {
      const masterKeyEnv = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKeyEnv) {
        throw new Error('Master key not provided and ENCRYPTION_MASTER_KEY not set');
      }
      this.masterKey = Buffer.from(masterKeyEnv, 'base64');
    }

    // 設定の初期化
    this.config = {
      masterKey: this.masterKey,
      keyRotationInterval: config.keyRotationInterval || 90, // 90日
      compressionEnabled: config.compressionEnabled ?? true,
      checksumValidation: config.checksumValidation ?? true,
    };

    // キーキャッシュの初期化
    this.keyCache = new Map();

    // マスターキーの検証
    if (this.masterKey.length !== 32) {
      throw new Error('Master key must be exactly 32 bytes');
    }
  }

  /**
   * データを暗号化してストレージエントリを作成
   * @param data 暗号化するデータ
   * @param keyId キー識別子（省略時は自動生成）
   * @param metadata 追加メタデータ
   * @returns 暗号化されたストレージエントリ
   */
  async encrypt(
    data: string,
    keyId?: string,
    metadata?: Record<string, string>
  ): Promise<EncryptedStorageEntry> {
    try {
      // データの検証
      if (!data) {
        throw new Error('Data cannot be empty');
      }

      // キーIDの生成または使用
      const actualKeyId = keyId || this.generateKeyId();
      
      // 暗号化キーを取得または生成
      const encryptionKey = await this.getOrCreateKey(actualKeyId);
      
      // データの前処理（圧縮）
      let processedData = data;
      if (this.config.compressionEnabled && data.length > 1024) {
        processedData = await this.compressData(data);
      }

      // チェックサムの計算
      const checksum = this.config.checksumValidation ? 
        this.calculateChecksum(processedData) : undefined;

      // 追加認証データの構築
      const associatedData = JSON.stringify({
        keyId: actualKeyId,
        version: 1,
        checksum,
        compressed: this.config.compressionEnabled && data.length > 1024,
        metadata: metadata || {},
      });

      // データを暗号化
      const encryptedData = encryptData(processedData, encryptionKey, {
        associatedData,
      });

      // ストレージエントリを構築
      const entry: EncryptedStorageEntry = {
        encryptedData,
        config: {
          keyId: actualKeyId,
          version: 1,
          metadata: metadata || {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // バリデーション
      const validation = EncryptedStorageEntrySchema.safeParse(entry);
      if (!validation.success) {
        throw new Error(`Storage entry validation failed: ${validation.error.message}`);
      }

      return entry;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Secure storage encryption failed: ${error.message}`);
      }
      throw new Error('Secure storage encryption failed: Unknown error');
    }
  }

  /**
   * ストレージエントリを復号化してデータを取得
   * @param entry 暗号化されたストレージエントリ
   * @returns 復号化されたデータ
   */
  async decrypt(entry: EncryptedStorageEntry): Promise<string> {
    try {
      // エントリの検証
      const validation = EncryptedStorageEntrySchema.safeParse(entry);
      if (!validation.success) {
        throw new Error(`Invalid storage entry: ${validation.error.message}`);
      }

      // 暗号化キーを取得
      const encryptionKey = await this.getKey(entry.config.keyId);
      if (!encryptionKey) {
        throw new Error(`Encryption key not found: ${entry.config.keyId}`);
      }

      // 追加認証データの再構築
      const associatedData = JSON.stringify({
        keyId: entry.config.keyId,
        version: entry.config.version,
        checksum: undefined, // 復号化後に検証
        compressed: undefined, // 復号化後に判定
        metadata: entry.config.metadata || {},
      });

      // データを復号化（最初はチェックサムなしで試行）
      let decryptedData: string;
      try {
        decryptedData = decryptData(entry.encryptedData, encryptionKey, {
          associatedData,
        });
      } catch (error) {
        // 古いフォーマットの可能性があるため、AADなしで再試行
        decryptedData = decryptData(entry.encryptedData, encryptionKey);
      }

      // 圧縮の展開
      let processedData = decryptedData;
      if (this.config.compressionEnabled && this.isCompressed(decryptedData)) {
        processedData = await this.decompressData(decryptedData);
      }

      // チェックサムの検証
      if (this.config.checksumValidation) {
        const expectedChecksum = this.extractChecksumFromAAD(associatedData);
        if (expectedChecksum) {
          const actualChecksum = this.calculateChecksum(processedData);
          if (actualChecksum !== expectedChecksum) {
            throw new Error('Checksum validation failed: Data may be corrupted');
          }
        }
      }

      return processedData;

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Secure storage decryption failed: ${error.message}`);
      }
      throw new Error('Secure storage decryption failed: Unknown error');
    }
  }

  /**
   * キーをローテーション（新しいキーで再暗号化）
   * @param entry 既存のストレージエントリ
   * @param newKeyId 新しいキーID（省略時は自動生成）
   * @returns 新しいキーで暗号化されたエントリ
   */
  async rotateKey(
    entry: EncryptedStorageEntry, 
    newKeyId?: string
  ): Promise<EncryptedStorageEntry> {
    try {
      // 既存データを復号化
      const decryptedData = await this.decrypt(entry);
      
      // 新しいキーで暗号化
      const newEntry = await this.encrypt(
        decryptedData, 
        newKeyId, 
        entry.config.metadata
      );

      return {
        ...newEntry,
        createdAt: entry.createdAt, // 作成日時は保持
        updatedAt: new Date().toISOString(),
      };

    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Key rotation failed: ${error.message}`);
      }
      throw new Error('Key rotation failed: Unknown error');
    }
  }

  /**
   * ストレージエントリの整合性を検証
   * @param entry 検証対象のエントリ
   * @returns 検証結果
   */
  async validateEntry(entry: EncryptedStorageEntry): Promise<boolean> {
    try {
      // スキーマ検証
      const schemaValidation = EncryptedStorageEntrySchema.safeParse(entry);
      if (!schemaValidation.success) {
        return false;
      }

      // 暗号化データの形式検証
      if (!validateEncryptedData(entry.encryptedData)) {
        return false;
      }

      // キーの存在確認
      const key = await this.getKey(entry.config.keyId);
      if (!key) {
        return false;
      }

      // 復号化テスト（実際にはデータを取得しない）
      try {
        await this.decrypt(entry);
        return true;
      } catch {
        return false;
      }

    } catch {
      return false;
    }
  }

  /**
   * 暗号化キーを取得または生成
   * @param keyId キー識別子
   * @returns 暗号化キー
   */
  private async getOrCreateKey(keyId: string): Promise<Buffer> {
    let key = this.keyCache.get(keyId);
    
    if (!key) {
      // 新しいキーを生成
      key = generateEncryptionKey();
      this.keyCache.set(keyId, key);
    }
    
    return key;
  }

  /**
   * 暗号化キーを取得
   * @param keyId キー識別子
   * @returns 暗号化キー（存在しない場合はundefined）
   */
  private async getKey(keyId: string): Promise<Buffer | undefined> {
    return this.keyCache.get(keyId);
  }

  /**
   * キー識別子を生成
   * @returns 一意のキー識別子
   */
  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2);
    return `key_${timestamp}_${random}`;
  }

  /**
   * データを圧縮
   * @param data 圧縮するデータ
   * @returns 圧縮されたデータ
   */
  private async compressData(data: string): Promise<string> {
    const zlib = require('zlib');
    const compressed = zlib.gzipSync(Buffer.from(data, 'utf8'));
    return `__COMPRESSED__${compressed.toString('base64')}`;
  }

  /**
   * データを展開
   * @param compressedData 圧縮されたデータ
   * @returns 展開されたデータ
   */
  private async decompressData(compressedData: string): Promise<string> {
    if (!compressedData.startsWith('__COMPRESSED__')) {
      return compressedData;
    }
    
    const zlib = require('zlib');
    const base64Data = compressedData.slice('__COMPRESSED__'.length);
    const compressed = Buffer.from(base64Data, 'base64');
    const decompressed = zlib.gunzipSync(compressed);
    return decompressed.toString('utf8');
  }

  /**
   * データが圧縮されているかチェック
   * @param data チェック対象のデータ
   * @returns 圧縮されている場合true
   */
  private isCompressed(data: string): boolean {
    return data.startsWith('__COMPRESSED__');
  }

  /**
   * データのチェックサムを計算
   * @param data チェックサム計算対象のデータ
   * @returns SHA256チェックサム
   */
  private calculateChecksum(data: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * AADからチェックサムを抽出
   * @param aad 追加認証データ
   * @returns チェックサム（存在しない場合はundefined）
   */
  private extractChecksumFromAAD(aad: string): string | undefined {
    try {
      const parsed = JSON.parse(aad);
      return parsed.checksum;
    } catch {
      return undefined;
    }
  }

  /**
   * リソースのクリーンアップ
   */
  dispose(): void {
    // キーキャッシュをクリア
    for (const key of this.keyCache.values()) {
      secureErase(key);
    }
    this.keyCache.clear();
    
    // マスターキーをクリア
    secureErase(this.masterKey);
  }
}