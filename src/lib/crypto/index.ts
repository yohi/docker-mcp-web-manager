/**
 * 暗号化ライブラリのエクスポート
 */

// 暗号化ユーティリティ
export {
  encrypt,
  decrypt,
  deriveKey,
  generateSalt,
  clearBuffer,
  verifyIntegrity,
  ENCRYPTION_CONFIG,
  CryptoError,
  type EncryptionMetadata,
  type EncryptionResult,
} from './encryption';

// キー管理
export {
  KeyManager,
  keyManager,
  KEY_CONFIG,
  type KeyInfo,
  type KeyStore,
} from './key-management';