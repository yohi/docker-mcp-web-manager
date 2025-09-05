/**
 * 入力サニタイゼーション
 * 
 * 機能要件：
 * - XSS攻撃対策
 * - SQLインジェクション対策
 * - コマンドインジェクション対策
 * - データ型変換とクリーニング
 */

import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

/**
 * サニタイザー設定
 */
interface SanitizerConfig {
  /** HTMLタグを許可するか */
  allowHtml?: boolean;
  /** 許可するHTMLタグ */
  allowedTags?: string[];
  /** 許可する属性 */
  allowedAttributes?: Record<string, string[]>;
  /** 最大長制限 */
  maxLength?: number;
  /** 前後の空白を削除するか */
  trim?: boolean;
  /** 空文字列をnullに変換するか */
  emptyToNull?: boolean;
}

/**
 * デフォルトサニタイザー設定
 */
const DEFAULT_CONFIG: SanitizerConfig = {
  allowHtml: false,
  allowedTags: [],
  allowedAttributes: {},
  maxLength: undefined,
  trim: true,
  emptyToNull: true,
};

/**
 * 安全なHTMLタグと属性の設定
 */
const SAFE_HTML_CONFIG = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre'
  ],
  allowedAttributes: {
    'p': ['class'],
    'strong': ['class'],
    'em': ['class'],
    'code': ['class'],
    'pre': ['class'],
  },
};

/**
 * 基本的な文字列サニタイゼーション
 */
export function sanitizeString(
  input: unknown, 
  config: SanitizerConfig = {}
): string | null {
  // 設定をマージ
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // 文字列に変換
  let str = String(input || '');
  
  // 前後の空白を削除
  if (finalConfig.trim) {
    str = str.trim();
  }
  
  // 空文字列をnullに変換
  if (finalConfig.emptyToNull && str === '') {
    return null;
  }
  
  // 最大長制限
  if (finalConfig.maxLength && str.length > finalConfig.maxLength) {
    str = str.substring(0, finalConfig.maxLength);
  }
  
  // HTMLサニタイゼーション
  if (finalConfig.allowHtml && finalConfig.allowedTags?.length) {
    str = DOMPurify.sanitize(str, {
      ALLOWED_TAGS: finalConfig.allowedTags,
      ALLOWED_ATTR: Object.keys(finalConfig.allowedAttributes || {}),
    });
  } else if (!finalConfig.allowHtml) {
    // HTMLタグを完全に除去
    str = DOMPurify.sanitize(str, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [] 
    });
    
    // 追加のHTMLエンコード
    str = validator.escape(str);
  }
  
  return str;
}

/**
 * HTMLコンテンツのサニタイゼーション
 */
export function sanitizeHtml(
  input: unknown,
  config?: {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    maxLength?: number;
  }
): string | null {
  const mergedConfig = {
    ...SAFE_HTML_CONFIG,
    ...config,
  };
  
  return sanitizeString(input, {
    allowHtml: true,
    ...mergedConfig,
  });
}

/**
 * プレーンテキストのサニタイゼーション
 */
export function sanitizePlainText(
  input: unknown,
  maxLength?: number
): string | null {
  return sanitizeString(input, {
    allowHtml: false,
    maxLength,
  });
}

/**
 * 数値のサニタイゼーション
 */
export function sanitizeNumber(
  input: unknown,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
    fallback?: number;
  }
): number | null {
  const { min, max, integer = false, fallback } = options || {};
  
  // 数値に変換
  let num = Number(input);
  
  // NaNの場合
  if (isNaN(num)) {
    return fallback ?? null;
  }
  
  // 整数に変換
  if (integer) {
    num = Math.floor(num);
  }
  
  // 範囲制限
  if (min !== undefined && num < min) {
    num = min;
  }
  if (max !== undefined && num > max) {
    num = max;
  }
  
  return num;
}

/**
 * 整数のサニタイゼーション
 */
export function sanitizeInteger(
  input: unknown,
  options?: {
    min?: number;
    max?: number;
    fallback?: number;
  }
): number | null {
  return sanitizeNumber(input, { ...options, integer: true });
}

/**
 * ブール値のサニタイゼーション
 */
export function sanitizeBoolean(
  input: unknown,
  fallback?: boolean
): boolean | null {
  if (typeof input === 'boolean') {
    return input;
  }
  
  if (typeof input === 'string') {
    const str = input.toLowerCase().trim();
    if (str === 'true' || str === '1' || str === 'yes' || str === 'on') {
      return true;
    }
    if (str === 'false' || str === '0' || str === 'no' || str === 'off') {
      return false;
    }
  }
  
  if (typeof input === 'number') {
    return input !== 0;
  }
  
  return fallback ?? null;
}

/**
 * 配列のサニタイゼーション
 */
export function sanitizeArray<T>(
  input: unknown,
  itemSanitizer: (item: unknown) => T | null,
  options?: {
    maxLength?: number;
    uniqueItems?: boolean;
    removeNulls?: boolean;
  }
): T[] {
  const { maxLength, uniqueItems = false, removeNulls = true } = options || {};
  
  // 配列に変換
  let arr: unknown[];
  
  if (Array.isArray(input)) {
    arr = input;
  } else if (typeof input === 'string' && input.includes(',')) {
    arr = input.split(',');
  } else {
    arr = [input];
  }
  
  // 各アイテムをサニタイズ
  let sanitized = arr.map(itemSanitizer);
  
  // nullを除去
  if (removeNulls) {
    sanitized = sanitized.filter(item => item !== null) as T[];
  }
  
  // 重複を除去
  if (uniqueItems) {
    sanitized = [...new Set(sanitized)];
  }
  
  // 最大長制限
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  
  return sanitized;
}

/**
 * オブジェクトのサニタイゼーション
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  input: unknown,
  schema: {
    [K in keyof T]: (value: unknown) => T[K] | null;
  },
  options?: {
    allowExtraKeys?: boolean;
    removeNulls?: boolean;
  }
): Partial<T> {
  const { allowExtraKeys = false, removeNulls = true } = options || {};
  
  // オブジェクトでない場合は空オブジェクトを返す
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  
  const obj = input as Record<string, unknown>;
  const result: Partial<T> = {};
  
  // スキーマに基づいてサニタイズ
  for (const [key, sanitizer] of Object.entries(schema)) {
    if (key in obj) {
      const sanitized = sanitizer(obj[key]);
      if (sanitized !== null || !removeNulls) {
        (result as any)[key] = sanitized;
      }
    }
  }
  
  // 追加キーを許可する場合
  if (allowExtraKeys) {
    for (const [key, value] of Object.entries(obj)) {
      if (!(key in schema)) {
        const sanitized = sanitizePlainText(value);
        if (sanitized !== null || !removeNulls) {
          (result as any)[key] = sanitized;
        }
      }
    }
  }
  
  return result;
}

/**
 * メールアドレスのサニタイゼーション
 */
export function sanitizeEmail(input: unknown): string | null {
  const str = sanitizePlainText(input);
  
  if (!str) return null;
  
  // メールアドレスの形式チェックと正規化
  if (validator.isEmail(str)) {
    return validator.normalizeEmail(str) || null;
  }
  
  return null;
}

/**
 * URLのサニタイゼーション
 */
export function sanitizeUrl(
  input: unknown,
  options?: {
    allowedProtocols?: string[];
    requireProtocol?: boolean;
  }
): string | null {
  const { allowedProtocols = ['http', 'https'], requireProtocol = true } = options || {};
  
  let str = sanitizePlainText(input);
  
  if (!str) return null;
  
  // プロトコルが無い場合は https:// を追加
  if (requireProtocol && !str.match(/^https?:\/\//)) {
    str = `https://${str}`;
  }
  
  // URL形式チェック
  if (validator.isURL(str, {
    protocols: allowedProtocols,
    require_protocol: requireProtocol,
  })) {
    return str;
  }
  
  return null;
}

/**
 * ファイル名のサニタイゼーション
 */
export function sanitizeFilename(input: unknown): string | null {
  let str = sanitizePlainText(input);
  
  if (!str) return null;
  
  // 危険な文字を除去
  str = str.replace(/[<>:"|?*\x00-\x1f]/g, '');
  
  // パスセパレーターを除去
  str = str.replace(/[\/\\]/g, '_');
  
  // ドットで始まるファイル名を防ぐ
  if (str.startsWith('.')) {
    str = '_' + str;
  }
  
  // 予約語をチェック（Windows）
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
  ];
  
  if (reservedNames.includes(str.toUpperCase())) {
    str = `_${str}`;
  }
  
  // 長さ制限
  if (str.length > 255) {
    str = str.substring(0, 255);
  }
  
  return str || null;
}

/**
 * パスのサニタイゼーション
 */
export function sanitizePath(input: unknown): string | null {
  let str = sanitizePlainText(input);
  
  if (!str) return null;
  
  // パストラバーサル攻撃を防ぐ
  str = str.replace(/\.\./g, '');
  
  // 危険な文字を除去
  str = str.replace(/[<>:"|?*\x00-\x1f]/g, '');
  
  // 正規化
  str = str.replace(/\/+/g, '/'); // 連続するスラッシュを単一に
  str = str.replace(/\/$/, ''); // 末尾のスラッシュを除去
  
  // 絶対パスの場合は最初のスラッシュを保持
  if (!str.startsWith('/') && input && String(input).startsWith('/')) {
    str = '/' + str;
  }
  
  return str || null;
}

/**
 * Dockerイメージ名のサニタイゼーション
 */
export function sanitizeDockerImage(input: unknown): string | null {
  let str = sanitizePlainText(input);
  
  if (!str) return null;
  
  // 小文字に変換
  str = str.toLowerCase();
  
  // Dockerイメージ名の形式に合わせる
  str = str.replace(/[^a-z0-9._-\/]/g, '');
  
  // 先頭と末尾の特殊文字を除去
  str = str.replace(/^[._-]+|[._-]+$/g, '');
  
  return str || null;
}

/**
 * 環境変数名のサニタイゼーション
 */
export function sanitizeEnvVarName(input: unknown): string | null {
  let str = sanitizePlainText(input);
  
  if (!str) return null;
  
  // 大文字に変換
  str = str.toUpperCase();
  
  // 英数字とアンダースコアのみ許可
  str = str.replace(/[^A-Z0-9_]/g, '');
  
  // 数字で始まることを防ぐ
  if (str.match(/^[0-9]/)) {
    str = `_${str}`;
  }
  
  return str || null;
}

/**
 * JSONのサニタイゼーション
 */
export function sanitizeJson(
  input: unknown,
  options?: {
    maxDepth?: number;
    maxKeys?: number;
  }
): any | null {
  const { maxDepth = 10, maxKeys = 100 } = options || {};
  
  try {
    let obj: any;
    
    if (typeof input === 'string') {
      obj = JSON.parse(input);
    } else {
      obj = input;
    }
    
    // 深度とキー数をチェックしながらクリーニング
    function cleanObject(value: any, depth: number = 0): any {
      if (depth > maxDepth) {
        return null;
      }
      
      if (value === null || value === undefined) {
        return null;
      }
      
      if (typeof value === 'string') {
        return sanitizePlainText(value);
      }
      
      if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
      
      if (Array.isArray(value)) {
        return value.slice(0, maxKeys).map(item => cleanObject(item, depth + 1));
      }
      
      if (typeof value === 'object') {
        const cleaned: Record<string, any> = {};
        const keys = Object.keys(value).slice(0, maxKeys);
        
        for (const key of keys) {
          const cleanKey = sanitizePlainText(key);
          if (cleanKey) {
            const cleanValue = cleanObject(value[key], depth + 1);
            if (cleanValue !== null) {
              cleaned[cleanKey] = cleanValue;
            }
          }
        }
        
        return cleaned;
      }
      
      return null;
    }
    
    return cleanObject(obj);
  } catch {
    return null;
  }
}

/**
 * 複合的なデータ構造のサニタイゼーション
 */
export function sanitizeComplexData(
  input: unknown,
  schema: {
    [key: string]: {
      type: 'string' | 'number' | 'integer' | 'boolean' | 'email' | 'url' | 'array' | 'object';
      required?: boolean;
      sanitizer?: (value: unknown) => any;
      options?: any;
    };
  }
): Record<string, any> {
  const result: Record<string, any> = {};
  
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result;
  }
  
  const obj = input as Record<string, unknown>;
  
  for (const [key, config] of Object.entries(schema)) {
    const value = obj[key];
    
    if (value === undefined || value === null) {
      if (config.required) {
        continue; // 必須フィールドが無い場合はスキップ
      }
      result[key] = null;
      continue;
    }
    
    let sanitized: any;
    
    if (config.sanitizer) {
      sanitized = config.sanitizer(value);
    } else {
      switch (config.type) {
        case 'string':
          sanitized = sanitizePlainText(value, config.options?.maxLength);
          break;
        case 'number':
          sanitized = sanitizeNumber(value, config.options);
          break;
        case 'integer':
          sanitized = sanitizeInteger(value, config.options);
          break;
        case 'boolean':
          sanitized = sanitizeBoolean(value);
          break;
        case 'email':
          sanitized = sanitizeEmail(value);
          break;
        case 'url':
          sanitized = sanitizeUrl(value, config.options);
          break;
        case 'array':
          sanitized = sanitizeArray(value, config.options?.itemSanitizer || sanitizePlainText, config.options);
          break;
        case 'object':
          sanitized = sanitizeObject(value, config.options?.schema || {}, config.options);
          break;
        default:
          sanitized = sanitizePlainText(value);
      }
    }
    
    result[key] = sanitized;
  }
  
  return result;
}