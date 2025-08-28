// database/encryption.ts
// セキュリティファーストの暗号化ユーティリティ

import crypto from 'crypto';
import { db } from './connection';
import { encryptionKeys, secrets } from './schema';
import { eq } from 'drizzle-orm';

// 暗号化アルゴリズムとキー長
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

// 暗号化キーの生成
export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

// 暗号化キーのハッシュ化（保存用）
export function hashEncryptionKey(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// データの暗号化
export function encryptData(data: string, key: Buffer): { encrypted: string; iv: string; tag: string } {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, key);
    cipher.setAAD(Buffer.from('mcp-web-manager', 'utf8'));
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

// データの復号化
export function decryptData(encryptedData: { encrypted: string; iv: string; tag: string }, key: Buffer): string {
  try {
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(Buffer.from('mcp-web-manager', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

// 暗号化キーの管理クラス
export class EncryptionKeyManager {
  private static instance: EncryptionKeyManager;
  private masterKey: Buffer | null = null;

  private constructor() {}

  public static getInstance(): EncryptionKeyManager {
    if (!EncryptionKeyManager.instance) {
      EncryptionKeyManager.instance = new EncryptionKeyManager();
    }
    return EncryptionKeyManager.instance;
  }

  // マスターキーの設定（環境変数から）
  public setMasterKey(key: string): void {
    this.masterKey = Buffer.from(key, 'hex');
  }

  // 新しい暗号化キーの作成
  public async createEncryptionKey(keyName: string, createdBy: string): Promise<string> {
    try {
      const keyId = crypto.randomUUID();
      const key = generateEncryptionKey();
      const keyHash = hashEncryptionKey(key);

      await db.insert(encryptionKeys).values({
        id: keyId,
        keyName,
        keyVersion: 1,
        isActive: true,
        createdBy,
      });

      // 実際のキーは安全な場所に保存（例：環境変数、HSM等）
      // ここでは例としてコンソールに出力（本番環境では適切な方法で保存）
      console.log(`Encryption key created: ${keyName} (ID: ${keyId})`);
      console.log(`Key hash: ${keyHash}`);
      console.log('WARNING: Store the actual key securely!');

      return keyId;
    } catch (error) {
      console.error('Failed to create encryption key:', error);
      throw new Error('Failed to create encryption key');
    }
  }

  // アクティブな暗号化キーの取得
  public async getActiveEncryptionKey(keyName: string): Promise<Buffer | null> {
    try {
      const result = await db
        .select()
        .from(encryptionKeys)
        .where(eq(encryptionKeys.keyName, keyName))
        .limit(1);

      if (result.length === 0 || !result[0].isActive) {
        return null;
      }

      // 実際のキーは安全な場所から取得
      // ここでは例としてマスターキーを使用
      if (!this.masterKey) {
        throw new Error('Master key not set');
      }

      return this.masterKey;
    } catch (error) {
      console.error('Failed to get encryption key:', error);
      return null;
    }
  }

  // シークレットの暗号化保存
  public async encryptAndStoreSecret(
    secretName: string,
    secretValue: string,
    scope: 'global' | 'server' | 'configuration',
    encryptionKeyId: string,
    createdBy: string
  ): Promise<string> {
    try {
      const key = await this.getActiveEncryptionKey('default');
      if (!key) {
        throw new Error('No active encryption key found');
      }

      const encrypted = encryptData(secretValue, key);
      const secretId = crypto.randomUUID();

      await db.insert(secrets).values({
        id: secretId,
        name: secretName,
        encryptedValue: JSON.stringify(encrypted),
        encryptionKeyId,
        scope,
        createdBy,
        isActive: true,
      });

      return secretId;
    } catch (error) {
      console.error('Failed to encrypt and store secret:', error);
      throw new Error('Failed to encrypt and store secret');
    }
  }

  // シークレットの復号化取得
  public async decryptSecret(secretId: string): Promise<string | null> {
    try {
      const result = await db
        .select()
        .from(secrets)
        .where(eq(secrets.id, secretId))
        .limit(1);

      if (result.length === 0 || !result[0].isActive) {
        return null;
      }

      const secret = result[0];
      const key = await this.getActiveEncryptionKey('default');
      if (!key) {
        throw new Error('No active encryption key found');
      }

      const encryptedData = JSON.parse(secret.encryptedValue);
      return decryptData(encryptedData, key);
    } catch (error) {
      console.error('Failed to decrypt secret:', error);
      return null;
    }
  }

  // 暗号化キーのローテーション
  public async rotateEncryptionKey(keyName: string, createdBy: string): Promise<string> {
    try {
      // 既存のキーを非アクティブ化
      await db
        .update(encryptionKeys)
        .set({ isActive: false, rotatedAt: new Date().toISOString() })
        .where(eq(encryptionKeys.keyName, keyName));

      // 新しいキーを作成
      return await this.createEncryptionKey(keyName, createdBy);
    } catch (error) {
      console.error('Failed to rotate encryption key:', error);
      throw new Error('Failed to rotate encryption key');
    }
  }
}

// シングルトンインスタンスのエクスポート
export const encryptionKeyManager = EncryptionKeyManager.getInstance();
