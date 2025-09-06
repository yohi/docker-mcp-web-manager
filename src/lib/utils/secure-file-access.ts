import path from 'path';
import fs from 'fs/promises';
import { createReadStream, Stats } from 'fs';
import crypto from 'crypto';

// =============================================================================
// Secure File Access Utilities
// Path traversal protection and secure file download
// =============================================================================

/**
 * 許可されたログファイル拡張子
 */
const ALLOWED_LOG_EXTENSIONS = ['.log', '.txt'] as const;

/**
 * 許可されたログディレクトリ（絶対パス）
 */
const ALLOWED_LOG_DIRECTORIES = [
  '/var/log/',
  '/app/logs/',
  './logs/',
  '/tmp/mcp-logs/',
] as const;

/**
 * ファイルサイズの制限（バイト単位）
 */
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB（設定可能）

/**
 * 許可されたMIMEタイプ
 */
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'application/octet-stream',
] as const;

/**
 * セキュアファイルアクセス結果
 */
export interface SecureFileAccessResult {
  success: boolean;
  error?: string;
  file?: {
    path: string;
    size: number;
    mimeType: string;
    sanitizedName: string;
    readStream?: NodeJS.ReadableStream;
  };
}

/**
 * セキュアなレスポンスヘッダー設定
 */
export interface SecureDownloadHeaders {
  'Content-Type': string;
  'Content-Disposition': string;
  'X-Content-Type-Options': 'nosniff';
  'Cache-Control': string;
  'Content-Security-Policy': string;
  'X-Frame-Options': 'DENY';
  'Strict-Transport-Security': string;
  'Content-Length'?: string;
}

/**
 * パス正規化と検証
 * Directory traversal攻撃を防ぐための厳格な検証
 */
export function normalizeAndValidatePath(inputPath: string): {
  valid: boolean;
  normalizedPath?: string;
  error?: string;
} {
  try {
    // 基本的な入力検証
    if (!inputPath || typeof inputPath !== 'string') {
      return { valid: false, error: 'Path must be a non-empty string' };
    }

    // 危険な文字の検証
    const dangerousPatterns = [
      /\.\./,           // Parent directory references
      /[\x00-\x1F]/,    // Control characters
      /[\x7F-\xFF]/,    // Non-ASCII characters
      /[<>:"|?*]/,      // Windows reserved characters
      /^-/,             // Leading dash (command injection prevention)
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(inputPath)) {
        return {
          valid: false,
          error: `Path contains dangerous pattern: ${inputPath}`,
        };
      }
    }

    // パス長の制限
    if (inputPath.length > 255) {
      return {
        valid: false,
        error: 'Path too long (max 255 characters)',
      };
    }

    // パスの正規化
    const normalizedPath = path.resolve(path.normalize(inputPath));

    // null bytes check (after normalization)
    if (normalizedPath.includes('\0')) {
      return {
        valid: false,
        error: 'Path contains null bytes',
      };
    }

    return {
      valid: true,
      normalizedPath,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Path normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Allowlistベースのディレクトリアクセス制御
 */
export function validateDirectoryAccess(filePath: string): {
  allowed: boolean;
  error?: string;
} {
  try {
    const absolutePath = path.resolve(filePath);

    // 許可されたディレクトリ内かチェック
    const isInAllowedDirectory = ALLOWED_LOG_DIRECTORIES.some((allowedDir) => {
      const resolvedAllowedDir = path.resolve(allowedDir);
      return absolutePath.startsWith(resolvedAllowedDir);
    });

    if (!isInAllowedDirectory) {
      return {
        allowed: false,
        error: `File access denied: ${absolutePath} is not in allowed directories`,
      };
    }

    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      error: `Directory access validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * ファイル拡張子とタイプの検証
 */
export function validateFileTypeAndExtension(filePath: string): {
  valid: boolean;
  mimeType?: string;
  error?: string;
} {
  try {
    const extension = path.extname(filePath).toLowerCase();

    // 拡張子のallowlist検証
    if (!ALLOWED_LOG_EXTENSIONS.includes(extension as any)) {
      return {
        valid: false,
        error: `File extension not allowed: ${extension}. Allowed: ${ALLOWED_LOG_EXTENSIONS.join(', ')}`,
      };
    }

    // MIMEタイプの決定
    const mimeType = extension === '.txt' ? 'text/plain' : 'text/plain';

    return {
      valid: true,
      mimeType,
    };
  } catch (error) {
    return {
      valid: false,
      error: `File type validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * ファイルの存在とサイズの検証
 */
export async function validateFileExistenceAndSize(filePath: string): Promise<{
  valid: boolean;
  stats?: Stats;
  error?: string;
}> {
  try {
    const stats = await fs.stat(filePath);

    // ファイル（非ディレクトリ）であることを確認
    if (!stats.isFile()) {
      return {
        valid: false,
        error: 'Path does not point to a regular file',
      };
    }

    // ファイルサイズの検証
    if (stats.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE} bytes)`,
      };
    }

    // 空ファイルのチェック
    if (stats.size === 0) {
      return {
        valid: false,
        error: 'File is empty',
      };
    }

    return {
      valid: true,
      stats,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') {
        return {
          valid: false,
          error: 'File not found',
        };
      }
      if (error.code === 'EACCES') {
        return {
          valid: false,
          error: 'File access denied',
        };
      }
    }

    return {
      valid: false,
      error: `File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * シンボリックリンクの解決と検証
 */
export async function resolveAndValidateRealPath(filePath: string): Promise<{
  valid: boolean;
  realPath?: string;
  error?: string;
}> {
  try {
    // 実際のパスに解決（シンボリックリンクを辿る）
    const realPath = await fs.realpath(filePath);

    // 解決後のパスが許可されたディレクトリ内かを再チェック
    const directoryValidation = validateDirectoryAccess(realPath);
    if (!directoryValidation.allowed) {
      return {
        valid: false,
        error: `Real path access denied: ${directoryValidation.error}`,
      };
    }

    return {
      valid: true,
      realPath,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Real path resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * ファイル名の安全化（サニタイゼーション）
 */
export function sanitizeFileName(fileName: string): string {
  // ファイル名から危険な文字を除去
  const sanitized = fileName
    .replace(/[^\w\s.-]/g, '') // 英数字、スペース、ピリオド、ハイフンのみ許可
    .replace(/\s+/g, '_')      // スペースをアンダースコアに変換
    .replace(/\.+/g, '.')      // 連続するピリオドを1つに
    .replace(/^\./, '')        // 先頭のピリオドを除去
    .substring(0, 100);        // 長さ制限

  // 空になった場合のフォールバック
  return sanitized || 'download';
}

/**
 * セキュアなレスポンスヘッダーの生成
 */
export function generateSecureHeaders(
  fileName: string,
  mimeType: string,
  fileSize?: number,
  isSensitive: boolean = true
): SecureDownloadHeaders {
  const sanitizedFileName = sanitizeFileName(fileName);
  
  const headers: SecureDownloadHeaders = {
    'Content-Type': mimeType,
    'Content-Disposition': `attachment; filename="${sanitizedFileName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': isSensitive ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  if (fileSize !== undefined) {
    headers['Content-Length'] = fileSize.toString();
  }

  return headers;
}

/**
 * ファイル内容の基本的な検証
 * マジックナンバーチェック等でログファイルとしての妥当性を確認
 */
export async function validateFileContent(filePath: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    // ファイルの最初の数バイトを読み込み
    const buffer = Buffer.alloc(512);
    const fileHandle = await fs.open(filePath, 'r');
    
    try {
      const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0);
      const content = buffer.slice(0, bytesRead).toString('utf8', 0, Math.min(bytesRead, 512));

      // 基本的なテキストファイル検証
      // バイナリファイルの除外（制御文字の割合でチェック）
      const controlCharCount = (content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
      const controlCharRatio = controlCharCount / content.length;

      if (controlCharRatio > 0.1) { // 10%以上が制御文字の場合はバイナリとみなす
        return {
          valid: false,
          error: 'File appears to be binary, not a text log file',
        };
      }

      // 極端に長い行の検証（ログファイルらしさのチェック）
      const lines = content.split('\n');
      const hasExtremelyLongLines = lines.some(line => line.length > 10000);

      if (hasExtremelyLongLines) {
        console.warn(`File has extremely long lines, may not be a typical log file: ${filePath}`);
        // 警告のみでエラーにはしない
      }

      return { valid: true };
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    return {
      valid: false,
      error: `File content validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 完全なセキュアファイルアクセス検証
 * 全てのセキュリティチェックを統合して実行
 */
export async function secureFileAccess(inputPath: string): Promise<SecureFileAccessResult> {
  try {
    // 1. パス正規化と基本検証
    const pathValidation = normalizeAndValidatePath(inputPath);
    if (!pathValidation.valid) {
      return {
        success: false,
        error: pathValidation.error,
      };
    }

    const normalizedPath = pathValidation.normalizedPath!;

    // 2. ディレクトリアクセス制御
    const directoryValidation = validateDirectoryAccess(normalizedPath);
    if (!directoryValidation.allowed) {
      return {
        success: false,
        error: directoryValidation.error,
      };
    }

    // 3. ファイル拡張子とタイプ検証
    const typeValidation = validateFileTypeAndExtension(normalizedPath);
    if (!typeValidation.valid) {
      return {
        success: false,
        error: typeValidation.error,
      };
    }

    // 4. シンボリックリンク解決と再検証
    const realPathValidation = await resolveAndValidateRealPath(normalizedPath);
    if (!realPathValidation.valid) {
      return {
        success: false,
        error: realPathValidation.error,
      };
    }

    const realPath = realPathValidation.realPath!;

    // 5. ファイル存在とサイズ検証
    const existenceValidation = await validateFileExistenceAndSize(realPath);
    if (!existenceValidation.valid) {
      return {
        success: false,
        error: existenceValidation.error,
      };
    }

    // 6. ファイル内容検証
    const contentValidation = await validateFileContent(realPath);
    if (!contentValidation.valid) {
      return {
        success: false,
        error: contentValidation.error,
      };
    }

    const stats = existenceValidation.stats!;
    const fileName = path.basename(realPath);
    const sanitizedName = sanitizeFileName(fileName);

    return {
      success: true,
      file: {
        path: realPath,
        size: stats.size,
        mimeType: typeValidation.mimeType!,
        sanitizedName,
        readStream: createReadStream(realPath),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Secure file access failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * ログアクセスのセキュリティ監査ログ
 */
export function logFileAccess(
  userId: string | undefined,
  filePath: string,
  success: boolean,
  userAgent?: string,
  ipAddress?: string
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event: 'file_download_attempt',
    userId: userId || 'anonymous',
    filePath,
    success,
    userAgent: userAgent || 'unknown',
    ipAddress: ipAddress || 'unknown',
    securityLevel: 'high',
  };

  // 構造化ログとして出力（実際の実装では適切なロガーを使用）
  console.log('[SECURITY_AUDIT]', JSON.stringify(logEntry));
}