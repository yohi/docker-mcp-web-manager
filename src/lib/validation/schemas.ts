/**
 * Zodバリデーションスキーマ
 * 
 * 機能要件：
 * - 包括的な入力検証
 * - サーバー・クライアント共通のスキーマ
 * - セキュリティ重視のバリデーション
 * - 日本語エラーメッセージ
 */

import { z } from 'zod';
import { ErrorCodes } from '@/lib/errors/types';

/**
 * 共通のバリデーションヘルパー
 */
const commonValidation = {
  // 安全な文字列（XSS防止）
  safeString: (minLength = 0, maxLength = 255) =>
    z.string()
      .min(minLength, `${minLength}文字以上で入力してください`)
      .max(maxLength, `${maxLength}文字以内で入力してください`)
      .regex(/^[^<>'"]*$/, 'HTMLタグやスクリプト文字は使用できません'),

  // IDフォーマット（英数字、ハイフン、アンダースコア）
  idFormat: () =>
    z.string()
      .min(1, 'IDを入力してください')
      .max(64, 'IDは64文字以内で入力してください')
      .regex(/^[a-zA-Z0-9_-]+$/, 'IDは英数字、ハイフン、アンダースコアのみ使用できます'),

  // 名前フォーマット（サーバー名等）
  nameFormat: () =>
    z.string()
      .min(1, '名前を入力してください')
      .max(128, '名前は128文字以内で入力してください')
      .regex(/^[a-zA-Z0-9_.-]+$/, '名前は英数字、ドット、ハイフン、アンダースコアのみ使用できます'),

  // Docker イメージ名
  dockerImage: () =>
    z.string()
      .min(1, 'Dockerイメージ名を入力してください')
      .max(512, 'Dockerイメージ名が長すぎます')
      .regex(
        /^[a-z0-9]+([\._-][a-z0-9]+)*(\/[a-z0-9]+([\._-][a-z0-9]+)*)*$/,
        '有効なDockerイメージ名を入力してください'
      ),

  // ポート番号
  port: () =>
    z.number()
      .int('ポート番号は整数で入力してください')
      .min(1, 'ポート番号は1以上で入力してください')
      .max(65535, 'ポート番号は65535以下で入力してください'),

  // IPアドレス
  ipAddress: () =>
    z.string()
      .regex(
        /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
        '有効なIPアドレスを入力してください'
      ),

  // URL
  url: () =>
    z.string()
      .url('有効なURLを入力してください')
      .max(2048, 'URLは2048文字以内で入力してください'),

  // 環境変数名
  envVarName: () =>
    z.string()
      .min(1, '環境変数名を入力してください')
      .max(128, '環境変数名は128文字以内で入力してください')
      .regex(/^[A-Z][A-Z0-9_]*$/, '環境変数名は大文字の英字で始まり、大文字英数字とアンダースコアのみ使用できます'),

  // パス
  filePath: () =>
    z.string()
      .min(1, 'パスを入力してください')
      .max(4096, 'パスは4096文字以内で入力してください')
      .regex(/^[^<>:"|?*\x00-\x1f]*$/, '無効な文字が含まれています'),

  // JSONスキーマ
  jsonString: () =>
    z.string()
      .refine((str) => {
        try {
          JSON.parse(str);
          return true;
        } catch {
          return false;
        }
      }, '有効なJSON形式で入力してください'),
};

/**
 * サーバー作成スキーマ
 */
export const serverCreateSchema = z.object({
  name: commonValidation.nameFormat(),
  image: commonValidation.dockerImage(),
  tag: z.string()
    .max(128, 'タグは128文字以内で入力してください')
    .regex(/^[a-zA-Z0-9_.-]*$/, 'タグは英数字、ドット、ハイフン、アンダースコアのみ使用できます')
    .default('latest'),
  ports: z.array(z.object({
    host: commonValidation.port(),
    container: commonValidation.port(),
    protocol: z.enum(['tcp', 'udp'], {
      errorMap: () => ({ message: 'プロトコルはtcpまたはudpを選択してください' }),
    }).default('tcp'),
  })).default([]),
  environment: z.array(z.object({
    key: commonValidation.envVarName(),
    value: z.string().max(1024, '環境変数の値は1024文字以内で入力してください'),
    isSecret: z.boolean().default(false),
  })).default([]),
  volumes: z.array(z.object({
    host: commonValidation.filePath(),
    container: commonValidation.filePath(),
    mode: z.enum(['ro', 'rw'], {
      errorMap: () => ({ message: 'マウントモードはroまたはrwを選択してください' }),
    }).default('rw'),
  })).default([]),
  network: z.string().max(64, 'ネットワーク名は64文字以内で入力してください').optional(),
  restart: z.enum(['no', 'always', 'unless-stopped', 'on-failure'], {
    errorMap: () => ({ message: '再起動ポリシーを正しく選択してください' }),
  }).default('unless-stopped'),
  cpuLimit: z.number()
    .min(0.1, 'CPU制限は0.1以上で設定してください')
    .max(32, 'CPU制限は32以下で設定してください')
    .optional(),
  memoryLimit: z.number()
    .int('メモリ制限は整数で入力してください')
    .min(128, 'メモリ制限は128MB以上で設定してください')
    .max(32768, 'メモリ制限は32GB以下で設定してください')
    .optional(),
  healthCheck: z.object({
    test: z.string().min(1, 'ヘルスチェックコマンドを入力してください').max(256, 'ヘルスチェックコマンドは256文字以内で入力してください'),
    interval: z.number().int().min(1).max(300).default(30),
    timeout: z.number().int().min(1).max(300).default(10),
    retries: z.number().int().min(1).max(10).default(3),
  }).optional(),
  labels: z.array(z.object({
    key: z.string().min(1, 'ラベルキーを入力してください').max(128, 'ラベルキーは128文字以内で入力してください'),
    value: z.string().max(256, 'ラベル値は256文字以内で入力してください'),
  })).default([]),
  autoStart: z.boolean().default(true),
});

/**
 * サーバー更新スキーマ
 */
export const serverUpdateSchema = serverCreateSchema.partial().extend({
  id: commonValidation.idFormat(),
});

/**
 * 認証スキーマ
 */
export const loginSchema = z.object({
  email: z.string()
    .min(1, 'メールアドレスを入力してください')
    .email('有効なメールアドレスを入力してください')
    .max(255, 'メールアドレスは255文字以内で入力してください'),
  password: z.string()
    .min(1, 'パスワードを入力してください')
    .min(8, 'パスワードは8文字以上で入力してください')
    .max(128, 'パスワードは128文字以内で入力してください')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'パスワードは大文字、小文字、数字を含む必要があります'),
  provider: z.enum(['credentials', 'bitwarden'], {
    errorMap: () => ({ message: '認証プロバイダーを選択してください' }),
  }).default('credentials'),
  remember: z.boolean().default(false),
});

/**
 * 設定管理スキーマ
 */
export const configurationSchema = z.object({
  serverId: commonValidation.idFormat(),
  name: z.string().min(1, '設定名を入力してください').max(128, '設定名は128文字以内で入力してください'),
  description: z.string().max(512, '説明は512文字以内で入力してください').optional(),
  environment: z.record(z.string(), z.string().max(1024, '環境変数の値は1024文字以内で入力してください')).default({}),
  resources: z.object({
    cpuLimit: z.number().min(0.1).max(32).optional(),
    memoryLimit: z.number().int().min(128).max(32768).optional(),
    diskLimit: z.number().int().min(1).max(1000000).optional(), // GB
  }).default({}),
  networking: z.object({
    ports: z.array(z.object({
      host: commonValidation.port(),
      container: commonValidation.port(),
      protocol: z.enum(['tcp', 'udp']).default('tcp'),
    })).default([]),
    network: z.string().max(64).optional(),
    hostname: z.string().max(64).optional(),
  }).default({}),
  volumes: z.array(z.object({
    host: commonValidation.filePath(),
    container: commonValidation.filePath(),
    mode: z.enum(['ro', 'rw']).default('rw'),
  })).default([]),
  isActive: z.boolean().default(true),
});

/**
 * シークレット管理スキーマ
 */
export const secretSchema = z.object({
  name: z.string()
    .min(1, 'シークレット名を入力してください')
    .max(128, 'シークレット名は128文字以内で入力してください')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'シークレット名は英数字、ドット、ハイフン、アンダースコアのみ使用できます'),
  value: z.string()
    .min(1, 'シークレットの値を入力してください')
    .max(4096, 'シークレットの値は4096文字以内で入力してください'),
  description: z.string().max(512, '説明は512文字以内で入力してください').optional(),
  expiresAt: z.string().datetime('有効期限は正しい日時形式で入力してください').optional(),
  tags: z.array(z.string().max(64, 'タグは64文字以内で入力してください')).default([]),
});

/**
 * Bitwarden統合スキーマ
 */
export const bitwardenConfigSchema = z.object({
  serverUrl: commonValidation.url().optional(),
  email: z.string().email('有効なメールアドレスを入力してください').max(255),
  organizationId: z.string().max(64).optional(),
  collectionId: z.string().max(64).optional(),
  syncInterval: z.number().int().min(300).max(86400).default(3600), // 5分〜24時間
  enabled: z.boolean().default(false),
});

/**
 * テスト実行スキーマ
 */
export const testExecutionSchema = z.object({
  serverId: commonValidation.idFormat(),
  tool: z.string().min(1, 'ツール名を入力してください').max(128),
  parameters: z.record(z.string(), z.any()).default({}),
  timeout: z.number().int().min(1).max(300).default(30),
  retries: z.number().int().min(0).max(3).default(0),
});

/**
 * ログ検索スキーマ
 */
export const logSearchSchema = z.object({
  serverId: commonValidation.idFormat().optional(),
  level: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  query: z.string().max(256, '検索クエリは256文字以内で入力してください').optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

/**
 * インポート・エクスポートスキーマ
 */
export const importExportSchema = z.object({
  format: z.enum(['json', 'yaml'], {
    errorMap: () => ({ message: 'フォーマットはjsonまたはyamlを選択してください' }),
  }),
  includeSecrets: z.boolean().default(false),
  includeConfigurations: z.boolean().default(true),
  includeServers: z.boolean().default(true),
  encryptSecrets: z.boolean().default(true),
});

/**
 * ページネーションスキーマ
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * 検索フィルタースキーマ
 */
export const searchFilterSchema = z.object({
  query: z.string().max(256, '検索クエリは256文字以内で入力してください').optional(),
  category: z.string().max(64).optional(),
  status: z.string().max(32).optional(),
  tags: z.array(z.string().max(64)).default([]),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

/**
 * APIレスポンススキーマ
 */
export const apiResponseSchema = z.object({
  error: z.boolean(),
  data: z.any(),
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string().optional(),
    pagination: z.object({
      page: z.number().int().min(1),
      limit: z.number().int().min(1),
      total: z.number().int().min(0),
      pages: z.number().int().min(0),
    }).optional(),
  }).optional(),
});

/**
 * ファイルアップロードスキーマ
 */
export const fileUploadSchema = z.object({
  filename: z.string()
    .min(1, 'ファイル名を入力してください')
    .max(255, 'ファイル名は255文字以内で入力してください')
    .regex(/^[^<>:"|?*\x00-\x1f]*$/, 'ファイル名に無効な文字が含まれています'),
  size: z.number().int().min(1).max(100 * 1024 * 1024), // 最大100MB
  mimeType: z.string().max(127),
  checksum: z.string().regex(/^[a-f0-9]{64}$/, '無効なチェックサムです'), // SHA-256
});

/**
 * バリデーションエラーハンドラー
 */
export function handleValidationError(error: z.ZodError): {
  code: string;
  message: string;
  fields: Record<string, string[]>;
} {
  const fields: Record<string, string[]> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!fields[path]) {
      fields[path] = [];
    }
    fields[path].push(err.message);
  });

  return {
    code: ErrorCodes.VALID_007,
    message: '入力値に不正があります',
    fields,
  };
}

/**
 * スキーマエクスポート用の型定義
 */
export type ServerCreateInput = z.infer<typeof serverCreateSchema>;
export type ServerUpdateInput = z.infer<typeof serverUpdateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ConfigurationInput = z.infer<typeof configurationSchema>;
export type SecretInput = z.infer<typeof secretSchema>;
export type BitwardenConfigInput = z.infer<typeof bitwardenConfigSchema>;
export type TestExecutionInput = z.infer<typeof testExecutionSchema>;
export type LogSearchInput = z.infer<typeof logSearchSchema>;
export type ImportExportInput = z.infer<typeof importExportSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchFilterInput = z.infer<typeof searchFilterSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;