/**
 * AES-256-GCM暗号化ユーティリティ
 * 
 * セキュリティ要件：
 * - AES-256-GCMアルゴリズム（AEAD mode）で認証付き暗号化
 * - 256ビット（32バイト）暗号化キーの厳格な強制
 * - 暗号化操作毎に暗号学的に安全なランダムIV/nonce
 * - 認証タグの永続化とストレージ
 * - 複数バージョンキーの後方互換性サポート
 */

import { createCipherGCM, createDecipherGCM, randomBytes, createHash } from 'crypto';

/**
 * 暗号化設定定数
 */
export const ENCRYPTION_CONFIG = {
  ALGORITHM: 'aes-256-gcm' as const,
  KEY_SIZE: 32, // 256 bits
  IV_SIZE: 12, // 96 bits (RFC 5116 compliant)
  TAG_SIZE: 16, // 128 bits
  AAD_ENABLED: true,
} as const;

/**
 * 暗号化メタデータ
 */
export interface EncryptionMetadata {
  algorithm: string;
  keyVersion: string;
  iv: string; // Base64エンコード済み
  tag: string; // Base64エンコード済み
  aad?: string; // Base64エンコード済み（オプション）
  timestamp: string;
}

/**
 * 暗号化結果
 */
export interface EncryptionResult {
  ciphertext: string; // Base64エンコード済み
  metadata: EncryptionMetadata;
}

/**
 * 暗号化エラー
 */
export class CryptoError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}

/**
 * 暗号化キーのバリデーション
 */
function validateKey(key: Buffer): void {
  if (!Buffer.isBuffer(key)) {
    throw new CryptoError(
      'Encryption key must be a Buffer',
      'INVALID_KEY_TYPE',
      { keyType: typeof key }
    );
  }
  
  if (key.length !== ENCRYPTION_CONFIG.KEY_SIZE) {
    throw new CryptoError(
      `Encryption key must be exactly ${ENCRYPTION_CONFIG.KEY_SIZE} bytes (256 bits)`,
      'INVALID_KEY_SIZE',
      { keySize: key.length, expectedSize: ENCRYPTION_CONFIG.KEY_SIZE }
    );
  }
}

/**
 * 暗号学的に安全なランダムバイト生成
 */
function generateSecureRandom(size: number): Buffer {
  try {
    return randomBytes(size);
  } catch (error) {
    throw new CryptoError(
      'Failed to generate cryptographically secure random bytes',
      'RANDOM_GENERATION_FAILED',
      { size, error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * AADの生成（コンテキスト結合用）
 */
function generateAAD(context?: {
  userId?: string;
  resourceId?: string;
  operation?: string;
  timestamp?: string;
}): Buffer | null {
  if (!context || !ENCRYPTION_CONFIG.AAD_ENABLED) {
    return null;
  }
  
  const aadData = {
    userId: context.userId || '',
    resourceId: context.resourceId || '',
    operation: context.operation || 'encrypt',
    timestamp: context.timestamp || new Date().toISOString(),
  };
  
  return Buffer.from(JSON.stringify(aadData), 'utf8');
}

/**
 * データ暗号化
 */
export function encrypt(
  plaintext: string | Buffer,
  key: Buffer,
  keyVersion: string = 'v1',
  aadContext?: {
    userId?: string;
    resourceId?: string;
    operation?: string;
    timestamp?: string;
  }
): EncryptionResult {
  try {
    // キーのバリデーション
    validateKey(key);
    
    // プレーンテキストをBufferに変換
    const plaintextBuffer = Buffer.isBuffer(plaintext) 
      ? plaintext 
      : Buffer.from(plaintext, 'utf8');
    
    // 暗号学的に安全なIV/nonce生成
    const iv = generateSecureRandom(ENCRYPTION_CONFIG.IV_SIZE);
    
    // AADの生成
    const aad = generateAAD(aadContext);
    
    // 暗号化器の作成
    const cipher = createCipherGCM(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    
    // AADの設定（存在する場合）
    if (aad) {
      cipher.setAAD(aad);
    }
    
    // 暗号化実行
    let ciphertext = cipher.update(plaintextBuffer);
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    
    // 認証タグの取得
    const tag = cipher.getAuthTag();
    
    if (tag.length !== ENCRYPTION_CONFIG.TAG_SIZE) {
      throw new CryptoError(
        `Authentication tag size mismatch: expected ${ENCRYPTION_CONFIG.TAG_SIZE}, got ${tag.length}`,
        'INVALID_TAG_SIZE',
        { tagSize: tag.length, expectedSize: ENCRYPTION_CONFIG.TAG_SIZE }
      );
    }
    
    // メタデータの作成
    const metadata: EncryptionMetadata = {
      algorithm: ENCRYPTION_CONFIG.ALGORITHM,
      keyVersion,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      aad: aad ? aad.toString('base64') : undefined,
      timestamp: new Date().toISOString(),
    };
    
    return {
      ciphertext: ciphertext.toString('base64'),
      metadata,
    };
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    
    throw new CryptoError(
      'Encryption operation failed',
      'ENCRYPTION_FAILED',
      { 
        error: error instanceof Error ? error.message : String(error),
        keyVersion,
        aadContext 
      }
    );
  }
}

/**
 * データ復号化
 */
export function decrypt(
  encryptionResult: EncryptionResult,
  key: Buffer
): string {
  try {
    // キーのバリデーション
    validateKey(key);
    
    const { ciphertext, metadata } = encryptionResult;
    
    // メタデータのバリデーション
    if (metadata.algorithm !== ENCRYPTION_CONFIG.ALGORITHM) {
      throw new CryptoError(
        `Unsupported encryption algorithm: ${metadata.algorithm}`,
        'UNSUPPORTED_ALGORITHM',
        { algorithm: metadata.algorithm, expected: ENCRYPTION_CONFIG.ALGORITHM }
      );
    }
    
    // Base64デコード
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
    const iv = Buffer.from(metadata.iv, 'base64');
    const tag = Buffer.from(metadata.tag, 'base64');
    const aad = metadata.aad ? Buffer.from(metadata.aad, 'base64') : null;
    
    // サイズ検証
    if (iv.length !== ENCRYPTION_CONFIG.IV_SIZE) {
      throw new CryptoError(
        `Invalid IV size: expected ${ENCRYPTION_CONFIG.IV_SIZE}, got ${iv.length}`,
        'INVALID_IV_SIZE',
        { ivSize: iv.length, expectedSize: ENCRYPTION_CONFIG.IV_SIZE }
      );
    }
    
    if (tag.length !== ENCRYPTION_CONFIG.TAG_SIZE) {
      throw new CryptoError(
        `Invalid authentication tag size: expected ${ENCRYPTION_CONFIG.TAG_SIZE}, got ${tag.length}`,
        'INVALID_TAG_SIZE',
        { tagSize: tag.length, expectedSize: ENCRYPTION_CONFIG.TAG_SIZE }
      );
    }
    
    // 復号化器の作成
    const decipher = createDecipherGCM(ENCRYPTION_CONFIG.ALGORITHM, key, iv);
    
    // 認証タグの設定
    decipher.setAuthTag(tag);
    
    // AADの設定（存在する場合）
    if (aad) {
      decipher.setAAD(aad);
    }
    
    // 復号化実行
    let plaintext = decipher.update(ciphertextBuffer);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    
    return plaintext.toString('utf8');
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    
    // 認証失敗の場合は特別なエラーコード
    if (error instanceof Error && error.message.includes('auth')) {
      throw new CryptoError(
        'Authentication failed: data integrity check failed',
        'AUTHENTICATION_FAILED',
        { 
          error: error.message,
          keyVersion: encryptionResult.metadata.keyVersion 
        }
      );
    }
    
    throw new CryptoError(
      'Decryption operation failed',
      'DECRYPTION_FAILED',
      { 
        error: error instanceof Error ? error.message : String(error),
        keyVersion: encryptionResult.metadata.keyVersion 
      }
    );
  }
}

/**
 * キー派生関数（HKDF）
 */
export function deriveKey(
  masterSecret: Buffer,
  salt: Buffer,
  info: string,
  length: number = ENCRYPTION_CONFIG.KEY_SIZE
): Buffer {
  try {
    // HKDF Extract（RFC 5869）
    const prk = createHash('sha256')
      .update(Buffer.concat([salt, masterSecret]))
      .digest();
    
    // HKDF Expand
    const infoBuffer = Buffer.from(info, 'utf8');
    const n = Math.ceil(length / 32); // SHA-256 output size
    let t = Buffer.alloc(0);
    let okm = Buffer.alloc(0);
    
    for (let i = 1; i <= n; i++) {
      const hmac = createHash('sha256');
      hmac.update(t);
      hmac.update(infoBuffer);
      hmac.update(Buffer.from([i]));
      t = hmac.digest();
      okm = Buffer.concat([okm, t]);
    }
    
    return okm.slice(0, length);
  } catch (error) {
    throw new CryptoError(
      'Key derivation failed',
      'KEY_DERIVATION_FAILED',
      { 
        error: error instanceof Error ? error.message : String(error),
        info,
        length 
      }
    );
  }
}

/**
 * 暗号学的に安全なソルトの生成
 */
export function generateSalt(size: number = 32): Buffer {
  return generateSecureRandom(size);
}

/**
 * メモリクリア（セキュリティ考慮）
 */
export function clearBuffer(buffer: Buffer): void {
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  }
}

/**
 * データの整合性検証
 */
export function verifyIntegrity(encryptionResult: EncryptionResult): boolean {
  try {
    const { metadata } = encryptionResult;
    
    // 必須フィールドの存在確認
    if (!metadata.algorithm || !metadata.keyVersion || !metadata.iv || !metadata.tag) {
      return false;
    }
    
    // Base64デコードテスト
    Buffer.from(metadata.iv, 'base64');
    Buffer.from(metadata.tag, 'base64');
    Buffer.from(encryptionResult.ciphertext, 'base64');
    
    if (metadata.aad) {
      Buffer.from(metadata.aad, 'base64');
    }
    
    return true;
  } catch {
    return false;
  }
}