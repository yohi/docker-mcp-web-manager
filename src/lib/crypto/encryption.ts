import { randomBytes, createCipherGCM, createDecipherGCM } from 'crypto';
import { z } from 'zod';

// =============================================================================
// 暗号化・復号化ユーティリティ
// AEAD（AES-256-GCM）による強力なデータ暗号化
// =============================================================================

/**
 * 暗号化設定
 */
export const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm' as const,
  keyLength: 32, // 256 bits
  ivLength: 12, // 96 bits (推奨値)
  tagLength: 16, // 128 bits
  saltLength: 32, // PBKDF2用ソルト
  iterations: 100000, // PBKDF2反復回数
} as const;

/**
 * 暗号化されたデータの形式
 */
export interface EncryptedData {
  data: string; // Base64エンコードされた暗号化データ
  iv: string; // Base64エンコードされた初期化ベクトル
  tag: string; // Base64エンコードされた認証タグ
  salt?: string; // Base64エンコードされたソルト（パスワードベース暗号化時）
}

/**
 * 暗号化オプション
 */
export interface EncryptionOptions {
  associatedData?: string; // 追加認証データ（AAD）
  encoding?: BufferEncoding; // 入力データのエンコーディング
}

/**
 * 暗号化結果バリデーションスキーマ
 */
export const EncryptedDataSchema = z.object({
  data: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  salt: z.string().optional(),
});

/**
 * セキュアな暗号化キーを生成
 * @param length キー長（バイト）
 * @returns ランダムなキー
 */
export function generateEncryptionKey(length: number = ENCRYPTION_CONFIG.keyLength): Buffer {
  if (length <= 0 || length > 1024) {
    throw new Error('Invalid key length. Must be between 1 and 1024 bytes.');
  }
  
  return randomBytes(length);
}

/**
 * セキュアなIV（初期化ベクトル）を生成
 * @param length IV長（バイト）
 * @returns ランダムなIV
 */
export function generateIV(length: number = ENCRYPTION_CONFIG.ivLength): Buffer {
  if (length <= 0 || length > 64) {
    throw new Error('Invalid IV length. Must be between 1 and 64 bytes.');
  }
  
  return randomBytes(length);
}

/**
 * データを暗号化
 * @param data 暗号化するデータ
 * @param key 暗号化キー（32バイト）
 * @param options 暗号化オプション
 * @returns 暗号化されたデータ
 */
export function encryptData(
  data: string,
  key: Buffer,
  options: EncryptionOptions = {}
): EncryptedData {
  try {
    // 入力検証
    if (!data) {
      throw new Error('Data cannot be empty');
    }
    
    if (!key || key.length !== ENCRYPTION_CONFIG.keyLength) {
      throw new Error(`Key must be exactly ${ENCRYPTION_CONFIG.keyLength} bytes`);
    }

    // IVを生成（各暗号化で一意）
    const iv = generateIV();
    
    // 暗号化器を作成
    const cipher = createCipherGCM(ENCRYPTION_CONFIG.algorithm, key, iv);
    
    // 追加認証データ（AAD）を設定
    if (options.associatedData) {
      cipher.setAAD(Buffer.from(options.associatedData, 'utf8'));
    }
    
    // データを暗号化
    const encoding = options.encoding || 'utf8';
    let encrypted = cipher.update(data, encoding);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // 認証タグを取得
    const tag = cipher.getAuthTag();
    
    // 結果を構築
    const result: EncryptedData = {
      data: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
    
    // バリデーション
    const validation = EncryptedDataSchema.safeParse(result);
    if (!validation.success) {
      throw new Error(`Encryption result validation failed: ${validation.error.message}`);
    }
    
    return result;
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
    throw new Error('Encryption failed: Unknown error');
  }
}

/**
 * データを復号化
 * @param encryptedData 暗号化されたデータ
 * @param key 復号化キー（32バイト）
 * @param options 復号化オプション
 * @returns 復号化されたデータ
 */
export function decryptData(
  encryptedData: EncryptedData,
  key: Buffer,
  options: EncryptionOptions = {}
): string {
  try {
    // 入力検証
    const validation = EncryptedDataSchema.safeParse(encryptedData);
    if (!validation.success) {
      throw new Error(`Invalid encrypted data format: ${validation.error.message}`);
    }
    
    if (!key || key.length !== ENCRYPTION_CONFIG.keyLength) {
      throw new Error(`Key must be exactly ${ENCRYPTION_CONFIG.keyLength} bytes`);
    }

    // Base64データをデコード
    const data = Buffer.from(encryptedData.data, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');
    
    // IV長の検証
    if (iv.length !== ENCRYPTION_CONFIG.ivLength) {
      throw new Error(`Invalid IV length: expected ${ENCRYPTION_CONFIG.ivLength}, got ${iv.length}`);
    }
    
    // タグ長の検証
    if (tag.length !== ENCRYPTION_CONFIG.tagLength) {
      throw new Error(`Invalid tag length: expected ${ENCRYPTION_CONFIG.tagLength}, got ${tag.length}`);
    }
    
    // 復号化器を作成
    const decipher = createDecipherGCM(ENCRYPTION_CONFIG.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    // 追加認証データ（AAD）を設定
    if (options.associatedData) {
      decipher.setAAD(Buffer.from(options.associatedData, 'utf8'));
    }
    
    // データを復号化
    const encoding = options.encoding || 'utf8';
    let decrypted = decipher.update(data, undefined, encoding);
    decrypted += decipher.final(encoding);
    
    return decrypted;
    
  } catch (error) {
    if (error instanceof Error) {
      // 認証失敗の場合は詳細を隠す
      if (error.message.includes('auth') || error.message.includes('tag')) {
        throw new Error('Decryption failed: Authentication failed');
      }
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error('Decryption failed: Unknown error');
  }
}

/**
 * パスワードからキーを導出（PBKDF2）
 * @param password パスワード
 * @param salt ソルト（省略時は自動生成）
 * @param iterations 反復回数
 * @returns 導出されたキーとソルト
 */
export function deriveKeyFromPassword(
  password: string,
  salt?: Buffer,
  iterations: number = ENCRYPTION_CONFIG.iterations
): { key: Buffer; salt: Buffer } {
  try {
    if (!password) {
      throw new Error('Password cannot be empty');
    }
    
    if (iterations < 10000) {
      throw new Error('Iterations must be at least 10000 for security');
    }
    
    // ソルトを生成または使用
    const derivedSalt = salt || randomBytes(ENCRYPTION_CONFIG.saltLength);
    
    // PBKDF2でキーを導出
    const crypto = require('crypto');
    const key = crypto.pbkdf2Sync(
      password,
      derivedSalt,
      iterations,
      ENCRYPTION_CONFIG.keyLength,
      'sha256'
    );
    
    return { key, salt: derivedSalt };
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Key derivation failed: ${error.message}`);
    }
    throw new Error('Key derivation failed: Unknown error');
  }
}

/**
 * パスワードベースでデータを暗号化
 * @param data 暗号化するデータ
 * @param password パスワード
 * @param options 暗号化オプション
 * @returns 暗号化されたデータ（ソルト含む）
 */
export function encryptWithPassword(
  data: string,
  password: string,
  options: EncryptionOptions = {}
): EncryptedData {
  const { key, salt } = deriveKeyFromPassword(password);
  const encrypted = encryptData(data, key, options);
  
  return {
    ...encrypted,
    salt: salt.toString('base64'),
  };
}

/**
 * パスワードベースでデータを復号化
 * @param encryptedData 暗号化されたデータ（ソルト含む）
 * @param password パスワード
 * @param options 復号化オプション
 * @returns 復号化されたデータ
 */
export function decryptWithPassword(
  encryptedData: EncryptedData,
  password: string,
  options: EncryptionOptions = {}
): string {
  if (!encryptedData.salt) {
    throw new Error('Salt is required for password-based decryption');
  }
  
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const { key } = deriveKeyFromPassword(password, salt);
  
  return decryptData(encryptedData, key, options);
}

/**
 * 暗号化されたデータの整合性を検証
 * @param encryptedData 検証対象のデータ
 * @returns 検証結果
 */
export function validateEncryptedData(encryptedData: unknown): encryptedData is EncryptedData {
  const result = EncryptedDataSchema.safeParse(encryptedData);
  return result.success;
}

/**
 * メモリから機密データを安全に消去
 * @param buffer 消去対象のBuffer
 */
export function secureErase(buffer: Buffer): void {
  if (buffer && Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  }
}

/**
 * 複数のBufferを安全に消去
 * @param buffers 消去対象のBuffer配列
 */
export function secureEraseMultiple(buffers: Buffer[]): void {
  buffers.forEach(buffer => secureErase(buffer));
}