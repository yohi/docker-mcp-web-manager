import {
  generateEncryptionKey,
  generateIV,
  encryptData,
  decryptData,
  deriveKeyFromPassword,
  encryptWithPassword,
  decryptWithPassword,
  validateEncryptedData,
  secureErase,
  ENCRYPTION_CONFIG,
} from '@/lib/crypto/encryption';

// =============================================================================
// 暗号化ユーティリティのテスト
// セキュリティ機能の包括的なテスト
// =============================================================================

describe('Encryption Utilities', () => {
  let testKey: Buffer;
  let testData: string;

  beforeAll(() => {
    testKey = generateEncryptionKey();
    testData = 'This is a test message for encryption';
  });

  afterAll(() => {
    secureErase(testKey);
  });

  describe('generateEncryptionKey', () => {
    test('should generate key with correct length', () => {
      const key = generateEncryptionKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(ENCRYPTION_CONFIG.keyLength);
    });

    test('should generate different keys each time', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1.equals(key2)).toBe(false);
    });

    test('should throw error for invalid key length', () => {
      expect(() => generateEncryptionKey(0)).toThrow('Invalid key length');
      expect(() => generateEncryptionKey(2000)).toThrow('Invalid key length');
    });
  });

  describe('generateIV', () => {
    test('should generate IV with correct length', () => {
      const iv = generateIV();
      expect(iv).toBeInstanceOf(Buffer);
      expect(iv.length).toBe(ENCRYPTION_CONFIG.ivLength);
    });

    test('should generate different IVs each time', () => {
      const iv1 = generateIV();
      const iv2 = generateIV();
      expect(iv1.equals(iv2)).toBe(false);
    });

    test('should throw error for invalid IV length', () => {
      expect(() => generateIV(0)).toThrow('Invalid IV length');
      expect(() => generateIV(100)).toThrow('Invalid IV length');
    });
  });

  describe('encryptData/decryptData', () => {
    test('should encrypt and decrypt data correctly', () => {
      const encrypted = encryptData(testData, testKey);
      const decrypted = decryptData(encrypted, testKey);
      
      expect(decrypted).toBe(testData);
    });

    test('should produce different ciphertext for same data', () => {
      const encrypted1 = encryptData(testData, testKey);
      const encrypted2 = encryptData(testData, testKey);
      
      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    test('should throw error for empty data', () => {
      expect(() => encryptData('', testKey)).toThrow('Data cannot be empty');
    });

    test('should throw error for invalid key', () => {
      const invalidKey = Buffer.alloc(16);
      expect(() => encryptData(testData, invalidKey)).toThrow('Key must be exactly');
    });

    test('should include all required fields in encrypted data', () => {
      const encrypted = encryptData(testData, testKey);
      
      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(typeof encrypted.data).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.tag).toBe('string');
    });

    test('should work with associated data', () => {
      const aad = 'associated-data-for-authentication';
      const encrypted = encryptData(testData, testKey, { associatedData: aad });
      const decrypted = decryptData(encrypted, testKey, { associatedData: aad });
      
      expect(decrypted).toBe(testData);
    });

    test('should fail with wrong associated data', () => {
      const aad = 'associated-data-for-authentication';
      const wrongAad = 'wrong-associated-data';
      
      const encrypted = encryptData(testData, testKey, { associatedData: aad });
      
      expect(() => {
        decryptData(encrypted, testKey, { associatedData: wrongAad });
      }).toThrow('Decryption failed');
    });

    test('should fail with tampered data', () => {
      const encrypted = encryptData(testData, testKey);
      
      // Tamper with the data
      const tamperedData = {
        ...encrypted,
        data: encrypted.data.slice(0, -4) + 'XXXX'
      };
      
      expect(() => {
        decryptData(tamperedData, testKey);
      }).toThrow('Decryption failed');
    });
  });

  describe('deriveKeyFromPassword', () => {
    const testPassword = 'strong-test-password-123';

    test('should derive key with correct length', () => {
      const { key, salt } = deriveKeyFromPassword(testPassword);
      
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(ENCRYPTION_CONFIG.keyLength);
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(ENCRYPTION_CONFIG.saltLength);
    });

    test('should produce same key with same password and salt', () => {
      const { key: key1, salt } = deriveKeyFromPassword(testPassword);
      const { key: key2 } = deriveKeyFromPassword(testPassword, salt);
      
      expect(key1.equals(key2)).toBe(true);
    });

    test('should produce different keys with different salts', () => {
      const { key: key1 } = deriveKeyFromPassword(testPassword);
      const { key: key2 } = deriveKeyFromPassword(testPassword);
      
      expect(key1.equals(key2)).toBe(false);
    });

    test('should throw error for weak password', () => {
      expect(() => deriveKeyFromPassword('')).toThrow('Password cannot be empty');
    });

    test('should throw error for low iteration count', () => {
      expect(() => deriveKeyFromPassword(testPassword, undefined, 1000)).toThrow('Iterations must be at least 10000');
    });
  });

  describe('encryptWithPassword/decryptWithPassword', () => {
    const testPassword = 'strong-test-password-123';

    test('should encrypt and decrypt with password', () => {
      const encrypted = encryptWithPassword(testData, testPassword);
      const decrypted = decryptWithPassword(encrypted, testPassword);
      
      expect(decrypted).toBe(testData);
    });

    test('should include salt in encrypted data', () => {
      const encrypted = encryptWithPassword(testData, testPassword);
      
      expect(encrypted).toHaveProperty('salt');
      expect(typeof encrypted.salt).toBe('string');
    });

    test('should fail with wrong password', () => {
      const encrypted = encryptWithPassword(testData, testPassword);
      
      expect(() => {
        decryptWithPassword(encrypted, 'wrong-password');
      }).toThrow('Decryption failed');
    });

    test('should require salt for decryption', () => {
      const encrypted = encryptData(testData, testKey);
      
      expect(() => {
        decryptWithPassword(encrypted, testPassword);
      }).toThrow('Salt is required');
    });
  });

  describe('validateEncryptedData', () => {
    test('should validate correct encrypted data', () => {
      const encrypted = encryptData(testData, testKey);
      expect(validateEncryptedData(encrypted)).toBe(true);
    });

    test('should reject invalid encrypted data', () => {
      expect(validateEncryptedData({})).toBe(false);
      expect(validateEncryptedData({ data: 'invalid' })).toBe(false);
      expect(validateEncryptedData(null)).toBe(false);
      expect(validateEncryptedData(undefined)).toBe(false);
    });

    test('should reject missing required fields', () => {
      const incomplete = {
        data: 'test',
        iv: 'test'
        // missing tag
      };
      expect(validateEncryptedData(incomplete)).toBe(false);
    });
  });

  describe('secureErase', () => {
    test('should clear buffer contents', () => {
      const buffer = Buffer.from('sensitive-data');
      const originalData = buffer.toString();
      
      secureErase(buffer);
      
      expect(buffer.toString()).not.toBe(originalData);
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });

    test('should handle null/undefined buffers', () => {
      expect(() => secureErase(null as any)).not.toThrow();
      expect(() => secureErase(undefined as any)).not.toThrow();
    });
  });

  describe('Security Properties', () => {
    test('should use different IV for each encryption', () => {
      const encrypted1 = encryptData(testData, testKey);
      const encrypted2 = encryptData(testData, testKey);
      
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    test('should produce different ciphertext for same plaintext', () => {
      const encrypted1 = encryptData(testData, testKey);
      const encrypted2 = encryptData(testData, testKey);
      
      expect(encrypted1.data).not.toBe(encrypted2.data);
    });

    test('should maintain data integrity', () => {
      const longData = 'A'.repeat(10000);
      const encrypted = encryptData(longData, testKey);
      const decrypted = decryptData(encrypted, testKey);
      
      expect(decrypted).toBe(longData);
      expect(decrypted.length).toBe(longData.length);
    });

    test('should handle various data encodings', () => {
      const utf8Data = 'こんにちは世界 🌍';
      const encrypted = encryptData(utf8Data, testKey);
      const decrypted = decryptData(encrypted, testKey);
      
      expect(decrypted).toBe(utf8Data);
    });
  });

  describe('Error Handling', () => {
    test('should provide meaningful error messages', () => {
      const encrypted = encryptData(testData, testKey);
      const wrongKey = generateEncryptionKey();
      
      try {
        decryptData(encrypted, wrongKey);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Decryption failed');
      }
    });

    test('should not leak sensitive information in error messages', () => {
      const encrypted = encryptData('sensitive-data', testKey);
      const wrongKey = generateEncryptionKey();
      
      try {
        decryptData(encrypted, wrongKey);
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).not.toContain('sensitive-data');
        expect(errorMessage).not.toContain(testKey.toString('hex'));
      }
    });
  });
});