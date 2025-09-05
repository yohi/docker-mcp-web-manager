/**
 * データベース関連のバリデーションユーティリティ
 * 共通のバリデーション関数とスキーマ検証
 */

import { ValidationError, ValidationResult } from '@/types/database';

/**
 * バリデーションエラーを作成
 */
export function createValidationError(field: string, message: string, value?: unknown): ValidationError {
  return { field, message, value };
}

/**
 * バリデーション結果を作成
 */
export function createValidationResult(errors: ValidationError[]): ValidationResult {
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * メールアドレスの形式検証
 */
export function validateEmail(email: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!email) {
    errors.push(createValidationError('email', 'Email is required'));
  } else {
    // 基本的なメール形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push(createValidationError('email', 'Invalid email format', email));
    }

    // 長さチェック
    if (email.length > 255) {
      errors.push(createValidationError('email', 'Email is too long (max 255 characters)', email));
    }

    // ドメイン部分の詳細チェック
    const parts = email.split('@');
    if (parts.length === 2) {
      const [localPart, domainPart] = parts;
      
      // ローカル部分のチェック
      if (localPart.length > 64) {
        errors.push(createValidationError('email', 'Email local part is too long (max 64 characters)', email));
      }
      
      // ドメイン部分のチェック
      if (domainPart.length > 253) {
        errors.push(createValidationError('email', 'Email domain part is too long (max 253 characters)', email));
      }
      
      if (!/^[a-zA-Z0-9.-]+$/.test(domainPart)) {
        errors.push(createValidationError('email', 'Invalid characters in email domain', email));
      }
      
      if (domainPart.startsWith('.') || domainPart.endsWith('.') || domainPart.includes('..')) {
        errors.push(createValidationError('email', 'Invalid email domain format', email));
      }
    }
  }

  return errors;
}

/**
 * パスワード強度検証
 */
export function validatePassword(password: string, requirements?: {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
}): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    ...requirements
  };

  if (!password) {
    errors.push(createValidationError('password', 'Password is required'));
    return errors;
  }

  // 最小長度チェック
  if (password.length < config.minLength) {
    errors.push(createValidationError('password', `Password must be at least ${config.minLength} characters long`));
  }

  // 大文字チェック
  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one uppercase letter'));
  }

  // 小文字チェック
  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one lowercase letter'));
  }

  // 数字チェック
  if (config.requireNumbers && !/\d/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one number'));
  }

  // 特殊文字チェック
  if (config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push(createValidationError('password', 'Password must contain at least one special character'));
  }

  // 最大長度チェック（セキュリティ上の理由）
  if (password.length > 128) {
    errors.push(createValidationError('password', 'Password is too long (max 128 characters)'));
  }

  return errors;
}

/**
 * ポート番号の検証
 */
export function validatePort(port: number | string, fieldName: string = 'port'): ValidationError[] {
  const errors: ValidationError[] = [];
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

  if (isNaN(portNum)) {
    errors.push(createValidationError(fieldName, 'Port must be a valid number', port));
  } else {
    if (portNum < 1 || portNum > 65535) {
      errors.push(createValidationError(fieldName, 'Port must be between 1 and 65535', port));
    }

    // 特権ポートの警告（1024未満）
    if (portNum < 1024) {
      errors.push(createValidationError(fieldName, 'Warning: Using privileged port (< 1024)', port));
    }
  }

  return errors;
}

/**
 * URL形式の検証
 */
export function validateUrl(url: string, fieldName: string = 'url'): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!url) {
    errors.push(createValidationError(fieldName, 'URL is required'));
    return errors;
  }

  try {
    const urlObj = new URL(url);
    
    // 許可されたプロトコルのチェック
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      errors.push(createValidationError(fieldName, 'URL must use HTTP or HTTPS protocol', url));
    }

    // ホスト名の存在チェック
    if (!urlObj.hostname) {
      errors.push(createValidationError(fieldName, 'URL must have a valid hostname', url));
    }

    // 長さチェック
    if (url.length > 2048) {
      errors.push(createValidationError(fieldName, 'URL is too long (max 2048 characters)', url));
    }
  } catch (error) {
    errors.push(createValidationError(fieldName, 'Invalid URL format', url));
  }

  return errors;
}

/**
 * Docker イメージ名の検証
 */
export function validateDockerImage(image: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!image) {
    errors.push(createValidationError('image', 'Docker image name is required'));
    return errors;
  }

  // 基本的な形式チェック
  const imageRegex = /^([a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
  if (!imageRegex.test(image)) {
    errors.push(createValidationError('image', 'Invalid Docker image name format', image));
  }

  // 長さチェック
  if (image.length > 255) {
    errors.push(createValidationError('image', 'Docker image name is too long (max 255 characters)', image));
  }

  // 連続する特殊文字のチェック
  if (/[._-]{2,}/.test(image)) {
    errors.push(createValidationError('image', 'Docker image name cannot contain consecutive special characters', image));
  }

  // 開始・終了文字のチェック
  if (/^[._-]|[._-]$/.test(image)) {
    errors.push(createValidationError('image', 'Docker image name cannot start or end with special characters', image));
  }

  return errors;
}

/**
 * Docker タグの検証
 */
export function validateDockerTag(tag: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!tag) {
    return errors; // タグは省略可能
  }

  // 基本的な形式チェック
  const tagRegex = /^[a-zA-Z0-9._-]+$/;
  if (!tagRegex.test(tag)) {
    errors.push(createValidationError('tag', 'Invalid Docker tag format', tag));
  }

  // 長さチェック
  if (tag.length > 128) {
    errors.push(createValidationError('tag', 'Docker tag is too long (max 128 characters)', tag));
  }

  // 予約語チェック
  if (tag === '.' || tag === '..') {
    errors.push(createValidationError('tag', 'Docker tag cannot be "." or ".."', tag));
  }

  return errors;
}

/**
 * JSON形式の検証
 */
export function validateJson(jsonString: string, fieldName: string = 'json'): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!jsonString) {
    return errors; // 空文字列は有効（オプションの場合）
  }

  try {
    JSON.parse(jsonString);
  } catch (error) {
    errors.push(createValidationError(fieldName, 'Invalid JSON format', jsonString));
  }

  return errors;
}

/**
 * リソース制限値の検証（メモリ、CPU等）
 */
export function validateResourceLimit(value: string, type: 'memory' | 'cpu', fieldName?: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const field = fieldName || `${type}_limit`;

  if (!value) {
    return errors; // 制限値は省略可能
  }

  if (type === 'memory') {
    // メモリ形式: 数字 + 単位 (B, KB, MB, GB, TB)
    const memoryRegex = /^\d+(\.\d+)?[KMGT]?B?$/i;
    if (!memoryRegex.test(value)) {
      errors.push(createValidationError(field, 'Invalid memory limit format (e.g., 512MB, 1GB, 2.5GB)', value));
    }

    // 最小値チェック（1MB）
    const numericValue = parseFloat(value);
    const unit = value.replace(/[\d.]/g, '').toLowerCase();
    let bytes = numericValue;

    switch (unit) {
      case 'kb':
        bytes *= 1024;
        break;
      case 'mb':
      case 'm':
        bytes *= 1024 * 1024;
        break;
      case 'gb':
      case 'g':
        bytes *= 1024 * 1024 * 1024;
        break;
      case 'tb':
      case 't':
        bytes *= 1024 * 1024 * 1024 * 1024;
        break;
    }

    if (bytes < 1024 * 1024) { // 1MB未満
      errors.push(createValidationError(field, 'Memory limit must be at least 1MB', value));
    }
  } else if (type === 'cpu') {
    // CPU形式: 小数点数
    const cpuRegex = /^\d*\.?\d+$/;
    if (!cpuRegex.test(value)) {
      errors.push(createValidationError(field, 'Invalid CPU limit format (e.g., 0.5, 1.0, 2)', value));
    }

    const cpuValue = parseFloat(value);
    if (cpuValue <= 0) {
      errors.push(createValidationError(field, 'CPU limit must be greater than 0', value));
    }

    if (cpuValue > 32) {
      errors.push(createValidationError(field, 'CPU limit is too high (max 32)', value));
    }
  }

  return errors;
}

/**
 * 複数のバリデーション結果をマージ
 */
export function mergeValidationResults(results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap(result => result.errors);
  return createValidationResult(allErrors);
}

/**
 * バリデーション関数を組み合わせる
 */
export function combineValidators<T>(
  validators: Array<(value: T) => ValidationError[]>
): (value: T) => ValidationResult {
  return (value: T): ValidationResult => {
    const allErrors = validators.flatMap(validator => validator(value));
    return createValidationResult(allErrors);
  };
}

/**
 * 条件付きバリデーション
 */
export function conditionalValidator<T>(
  condition: (value: T) => boolean,
  validator: (value: T) => ValidationError[]
): (value: T) => ValidationError[] {
  return (value: T): ValidationError[] => {
    if (condition(value)) {
      return validator(value);
    }
    return [];
  };
}