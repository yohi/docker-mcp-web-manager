// Zodスキーマの統合エクスポート
export * from './docker-mcp-schemas';

// 共通のバリデーションスキーマ
import { z } from 'zod';

// ページネーション共通スキーマ
export const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  total: z.number().min(0),
  totalPages: z.number().min(0),
});

// 検索クエリ共通スキーマ
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100).optional(),
  category: z.string().max(50).optional(),
  sort: z.enum(['name', 'created_at', 'updated_at', 'popularity']).default('updated_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ID検証用スキーマ
export const uuidSchema = z.string().uuid();
export const objectIdSchema = z.string().min(1).max(50);

// 環境変数スキーマ
export const environmentVariableSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Invalid environment variable name'),
  value: z.string().max(2000),
  required: z.boolean().default(false),
  description: z.string().max(500).optional(),
});

// セキュリティ関連スキーマ
export const sanitizedStringSchema = z.string()
  .max(1000)
  .refine(
    (val) => !/[;&|`$(){}[\]<>'"\\]/.test(val),
    'String contains dangerous characters'
  )
  .refine(
    (val) => !val.includes('..'),
    'String contains path traversal patterns'
  );

// ファイルパススキーマ
export const filePathSchema = z.string()
  .max(255)
  .refine(
    (val) => !val.includes('..'),
    'Path contains traversal patterns'
  )
  .refine(
    (val) => !val.startsWith('/') && !val.match(/^[A-Za-z]:/),
    'Absolute paths are not allowed'
  )
  .refine(
    (val) => /\.(log|txt)$/i.test(val),
    'Invalid file extension'
  );

// ネットワークポートスキーマ
export const portSchema = z.number().min(1).max(65535);

// メモリサイズスキーマ（例: "512m", "1g"）
export const memorySizeSchema = z.string().regex(
  /^\d+[kmgKMG]?[bB]?$/,
  'Invalid memory size format'
);

// CPU制限スキーマ（例: "0.5", "2"）
export const cpuLimitSchema = z.string().regex(
  /^\d+(\.\d+)?$/,
  'Invalid CPU limit format'
);

// タイムスタンプスキーマ
export const timestampSchema = z.string().datetime();

// 共通エラーレスポンススキーマ
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    timestamp: timestampSchema,
    requestId: z.string().uuid().optional(),
  }),
});

// 成功レスポンススキーマ
export const successResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  timestamp: timestampSchema,
});

// 型エクスポート
export type Pagination = z.infer<typeof paginationSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type EnvironmentVariable = z.infer<typeof environmentVariableSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;