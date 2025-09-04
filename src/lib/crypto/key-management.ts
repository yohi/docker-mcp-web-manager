/**
 * 暗号化キー管理システム
 * 
 * セキュリティ要件：
 * - Docker Secrets / ファイルマウント経由のキー提供（ハードコードなし）
 * - HKDF/Argon2idを使用したキー派生
 * - バージョン管理付きキーローテーション
 * - 後方互換性のあるキー管理
 * - セキュアなキー保存とクリーンアップ
 */

import { readFile, access, constants } from 'fs/promises';
import { createHash, randomBytes, scrypt } from 'crypto';
import { deriveKey, generateSalt, clearBuffer, CryptoError, ENCRYPTION_CONFIG } from './encryption';

/**
 * キー設定
 */
export const KEY_CONFIG = {
  MASTER_KEY_SIZE: 32, // 256 bits
  SALT_SIZE: 32, // 256 bits
  DEFAULT_SCRYPT_N: 16384, // 2^14 - CPU/memory cost parameter
  DEFAULT_SCRYPT_R: 8, // Block size parameter  
  DEFAULT_SCRYPT_P: 1, // Parallelization parameter
  KEY_ROTATION_INTERVAL: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
} as const;

/**
 * キー情報
 */
export interface KeyInfo {
  version: string;
  algorithm: string;
  derivationMethod: 'hkdf' | 'scrypt';
  salt: string; // Base64エンコード済み
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

/**
 * キーストア
 */
export interface KeyStore {
  currentVersion: string;
  keys: Record<string, {
    key: Buffer;
    info: KeyInfo;
  }>;
}

/**
 * キー管理クラス
 */
export class KeyManager {
  private keyStore: KeyStore;
  private masterSecrets: Map<string, Buffer> = new Map();
  private isInitialized = false;

  constructor() {
    this.keyStore = {
      currentVersion: 'v1',
      keys: {},
    };
  }

  /**
   * キー管理システムの初期化
   */
  async initialize(): Promise<void> {
    try {
      // マスターシークレットの読み込み
      await this.loadMasterSecrets();
      
      // 既存キーの復元
      await this.loadExistingKeys();
      
      // 現在のキーが存在しない場合は生成
      if (!this.hasCurrentKey()) {
        await this.generateNewKey();
      }
      
      // 期限切れキーのチェック
      this.cleanupExpiredKeys();
      
      this.isInitialized = true;
    } catch (error) {
      throw new CryptoError(
        'Key manager initialization failed',
        'KEY_MANAGER_INIT_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * マスターシークレットの読み込み
   */
  private async loadMasterSecrets(): Promise<void> {
    const secretSources = [
      // Docker Secrets (推奨)
      '/run/secrets/master_key',
      '/run/secrets/encryption_key',
      
      // ファイルマウント（開発・テスト用）
      '/app/secrets/master.key',
      './secrets/master.key',
      
      // 環境変数（開発用、警告付き）
      process.env.ENCRYPTION_MASTER_KEY,
    ];

    let masterSecret: Buffer | null = null;
    let source = '';

    // Docker Secretsまたはファイルからの読み込み
    for (const secretPath of secretSources.slice(0, -1)) {
      if (typeof secretPath === 'string') {
        try {
          await access(secretPath, constants.R_OK);
          const secretData = await readFile(secretPath);
          masterSecret = secretData.length >= KEY_CONFIG.MASTER_KEY_SIZE 
            ? secretData.slice(0, KEY_CONFIG.MASTER_KEY_SIZE)
            : null;
          source = secretPath;
          break;
        } catch {
          // ファイルが存在しないか読み取れない場合は次を試す
          continue;
        }
      }
    }

    // 環境変数からの読み込み（開発用）
    if (!masterSecret && process.env.ENCRYPTION_MASTER_KEY) {
      console.warn('⚠️  WARNING: Using environment variable for master key. This is not recommended for production.');
      const envKey = process.env.ENCRYPTION_MASTER_KEY;
      if (envKey.length >= KEY_CONFIG.MASTER_KEY_SIZE * 2) { // Hex string
        masterSecret = Buffer.from(envKey.slice(0, KEY_CONFIG.MASTER_KEY_SIZE * 2), 'hex');
      } else {
        masterSecret = createHash('sha256').update(envKey).digest();
      }
      source = 'environment variable';
    }

    if (!masterSecret) {
      throw new CryptoError(
        'No master key found. Please provide master key via Docker Secrets, file mount, or environment variable.',
        'MASTER_KEY_NOT_FOUND',
        { searchPaths: secretSources }
      );
    }

    // マスターキーのバリデーション
    if (masterSecret.length < KEY_CONFIG.MASTER_KEY_SIZE) {
      throw new CryptoError(
        `Master key must be at least ${KEY_CONFIG.MASTER_KEY_SIZE} bytes`,
        'INVALID_MASTER_KEY_SIZE',
        { size: masterSecret.length, source }
      );
    }

    this.masterSecrets.set('default', masterSecret);
    console.log(`✅ Master key loaded from: ${source}`);
  }

  /**
   * 既存キーの復元
   */
  private async loadExistingKeys(): Promise<void> {
    try {
      // キー情報をファイルまたはデータベースから読み込み
      // 実際の実装では永続化ストレージから読み込む
      const keyInfoPath = './keys/key-info.json';
      
      try {
        await access(keyInfoPath, constants.R_OK);
        const keyInfoData = await readFile(keyInfoPath, 'utf8');
        const keyInfo = JSON.parse(keyInfoData);
        
        // キーの復元
        for (const [version, info] of Object.entries(keyInfo.keys || {})) {
          await this.restoreKey(version, info as KeyInfo);
        }
        
        this.keyStore.currentVersion = keyInfo.currentVersion || 'v1';
      } catch {
        // キー情報ファイルが存在しない場合は初回起動
        console.log('🔑 No existing keys found, will generate new key');
      }
    } catch (error) {
      console.warn('⚠️  Failed to load existing keys:', error);
    }
  }

  /**
   * キーの復元
   */
  private async restoreKey(version: string, keyInfo: KeyInfo): Promise<void> {
    const masterSecret = this.masterSecrets.get('default');
    if (!masterSecret) {
      throw new CryptoError('Master secret not available', 'MASTER_SECRET_NOT_AVAILABLE');
    }

    const salt = Buffer.from(keyInfo.salt, 'base64');
    
    let key: Buffer;
    if (keyInfo.derivationMethod === 'hkdf') {
      key = deriveKey(masterSecret, salt, `key-${version}`);
    } else if (keyInfo.derivationMethod === 'scrypt') {
      key = await this.deriveKeyWithScrypt(masterSecret, salt);
    } else {
      throw new CryptoError(`Unsupported key derivation method: ${keyInfo.derivationMethod}`, 'UNSUPPORTED_DERIVATION');
    }

    this.keyStore.keys[version] = { key, info: keyInfo };
  }

  /**
   * Scryptを使用したキー派生
   */
  private async deriveKeyWithScrypt(
    masterSecret: Buffer,
    salt: Buffer,
    n: number = KEY_CONFIG.DEFAULT_SCRYPT_N,
    r: number = KEY_CONFIG.DEFAULT_SCRYPT_R,
    p: number = KEY_CONFIG.DEFAULT_SCRYPT_P
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        masterSecret,
        salt,
        KEY_CONFIG.MASTER_KEY_SIZE,
        { N: n, r, p },
        (err, derivedKey) => {
          if (err) {
            reject(new CryptoError('Scrypt key derivation failed', 'SCRYPT_FAILED', { error: err.message }));
          } else {
            resolve(derivedKey);
          }
        }
      );
    });
  }

  /**
   * 新しいキーの生成
   */
  async generateNewKey(derivationMethod: 'hkdf' | 'scrypt' = 'hkdf'): Promise<string> {
    const masterSecret = this.masterSecrets.get('default');
    if (!masterSecret) {
      throw new CryptoError('Master secret not available', 'MASTER_SECRET_NOT_AVAILABLE');
    }

    const version = this.getNextKeyVersion();
    const salt = generateSalt(KEY_CONFIG.SALT_SIZE);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + KEY_CONFIG.KEY_ROTATION_INTERVAL);

    let key: Buffer;
    if (derivationMethod === 'hkdf') {
      key = deriveKey(masterSecret, salt, `key-${version}`);
    } else {
      key = await this.deriveKeyWithScrypt(masterSecret, salt);
    }

    const keyInfo: KeyInfo = {
      version,
      algorithm: ENCRYPTION_CONFIG.ALGORITHM,
      derivationMethod,
      salt: salt.toString('base64'),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        purpose: 'encryption',
        rotationReason: 'scheduled',
      },
    };

    this.keyStore.keys[version] = { key, info: keyInfo };
    this.keyStore.currentVersion = version;

    // キー情報の永続化
    await this.persistKeyInfo();

    console.log(`🔑 Generated new encryption key: ${version}`);
    return version;
  }

  /**
   * 現在のキーを取得
   */
  getCurrentKey(): Buffer {
    this.ensureInitialized();
    const currentKey = this.keyStore.keys[this.keyStore.currentVersion];
    
    if (!currentKey) {
      throw new CryptoError(
        `Current key version ${this.keyStore.currentVersion} not found`,
        'CURRENT_KEY_NOT_FOUND',
        { currentVersion: this.keyStore.currentVersion }
      );
    }

    return currentKey.key;
  }

  /**
   * 指定バージョンのキーを取得
   */
  getKey(version: string): Buffer {
    this.ensureInitialized();
    const keyData = this.keyStore.keys[version];
    
    if (!keyData) {
      throw new CryptoError(
        `Key version ${version} not found`,
        'KEY_VERSION_NOT_FOUND',
        { version, availableVersions: Object.keys(this.keyStore.keys) }
      );
    }

    return keyData.key;
  }

  /**
   * 現在のキーバージョンを取得
   */
  getCurrentKeyVersion(): string {
    this.ensureInitialized();
    return this.keyStore.currentVersion;
  }

  /**
   * キーローテーション
   */
  async rotateKey(reason: string = 'scheduled'): Promise<string> {
    console.log(`🔄 Starting key rotation: ${reason}`);
    
    // 古いキーを保持（復号化用）
    const oldVersion = this.keyStore.currentVersion;
    
    // 新しいキーを生成
    const newVersion = await this.generateNewKey();
    
    console.log(`✅ Key rotation completed: ${oldVersion} -> ${newVersion}`);
    return newVersion;
  }

  /**
   * 期限切れキーのクリーンアップ
   */
  private cleanupExpiredKeys(): void {
    const now = new Date();
    const keysToRemove: string[] = [];

    for (const [version, keyData] of Object.entries(this.keyStore.keys)) {
      if (keyData.info.expiresAt && new Date(keyData.info.expiresAt) < now) {
        // 現在のキーは削除しない
        if (version !== this.keyStore.currentVersion) {
          keysToRemove.push(version);
        }
      }
    }

    for (const version of keysToRemove) {
      const keyData = this.keyStore.keys[version];
      clearBuffer(keyData.key); // メモリクリア
      delete this.keyStore.keys[version];
      console.log(`🗑️  Removed expired key: ${version}`);
    }
  }

  /**
   * 利用可能なキーバージョン一覧
   */
  getAvailableKeyVersions(): string[] {
    this.ensureInitialized();
    return Object.keys(this.keyStore.keys);
  }

  /**
   * キー情報の取得
   */
  getKeyInfo(version?: string): KeyInfo {
    this.ensureInitialized();
    const targetVersion = version || this.keyStore.currentVersion;
    const keyData = this.keyStore.keys[targetVersion];
    
    if (!keyData) {
      throw new CryptoError(
        `Key version ${targetVersion} not found`,
        'KEY_VERSION_NOT_FOUND',
        { version: targetVersion }
      );
    }

    return keyData.info;
  }

  /**
   * キー管理システムのシャットダウン
   */
  shutdown(): void {
    // すべてのキーをメモリからクリア
    for (const keyData of Object.values(this.keyStore.keys)) {
      clearBuffer(keyData.key);
    }
    
    // マスターシークレットもクリア
    for (const secret of this.masterSecrets.values()) {
      clearBuffer(secret);
    }
    
    this.keyStore.keys = {};
    this.masterSecrets.clear();
    this.isInitialized = false;
    
    console.log('🔒 Key manager shutdown completed');
  }

  // プライベートメソッド

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new CryptoError('Key manager not initialized', 'NOT_INITIALIZED');
    }
  }

  private hasCurrentKey(): boolean {
    return this.keyStore.currentVersion in this.keyStore.keys;
  }

  private getNextKeyVersion(): string {
    const currentNum = parseInt(this.keyStore.currentVersion.replace('v', '')) || 0;
    return `v${currentNum + 1}`;
  }

  private async persistKeyInfo(): Promise<void> {
    try {
      // 実際の実装では安全な永続化ストレージに保存
      // キー自体は保存せず、派生に必要な情報のみ保存
      const keyInfoData = {
        currentVersion: this.keyStore.currentVersion,
        keys: Object.fromEntries(
          Object.entries(this.keyStore.keys).map(([version, keyData]) => [
            version,
            keyData.info,
          ])
        ),
      };
      
      // TODO: 実際の永続化実装
      console.log('📝 Key info persisted (mock)');
    } catch (error) {
      console.error('❌ Failed to persist key info:', error);
    }
  }
}

// シングルトンインスタンス
export const keyManager = new KeyManager();