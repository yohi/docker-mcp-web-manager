/**
 * エラータイプ定義
 * 
 * 機能要件：
 * - 構造化エラー情報の定義
 * - エラーコード体系の実装
 * - エラーレベルとカテゴリの分類
 * - 国際化対応エラーメッセージ
 */

/**
 * エラーレベル
 */
export enum ErrorLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * エラーカテゴリ
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NETWORK = 'network',
  DATABASE = 'database',
  DOCKER = 'docker',
  MCP = 'mcp',
  SECURITY = 'security',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system',
  BUSINESS = 'business',
  UNKNOWN = 'unknown',
}

/**
 * HTTPステータスコード
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

/**
 * エラーコード定義（階層構造）
 */
export const ErrorCodes = {
  // 認証エラー（AUTH_xxx）
  AUTH_001: 'AUTH_001', // 認証情報が無効
  AUTH_002: 'AUTH_002', // トークンが期限切れ
  AUTH_003: 'AUTH_003', // 認証が必要
  AUTH_004: 'AUTH_004', // Bitwarden認証エラー
  AUTH_005: 'AUTH_005', // セッションが無効

  // 認可エラー（AUTHZ_xxx）
  AUTHZ_001: 'AUTHZ_001', // アクセス権限がない
  AUTHZ_002: 'AUTHZ_002', // ロール不足
  AUTHZ_003: 'AUTHZ_003', // リソースアクセス拒否
  AUTHZ_004: 'AUTHZ_004', // 操作権限がない

  // バリデーションエラー（VALID_xxx）
  VALID_001: 'VALID_001', // 必須フィールドが空
  VALID_002: 'VALID_002', // フォーマットが無効
  VALID_003: 'VALID_003', // 値の範囲外
  VALID_004: 'VALID_004', // 文字数制限違反
  VALID_005: 'VALID_005', // 型変換エラー
  VALID_006: 'VALID_006', // JSONパースエラー
  VALID_007: 'VALID_007', // スキーマ検証エラー

  // サーバー管理エラー（SERVER_xxx）
  SERVER_001: 'SERVER_001', // サーバーが見つからない
  SERVER_002: 'SERVER_002', // サーバーの開始に失敗
  SERVER_003: 'SERVER_003', // サーバーの停止に失敗
  SERVER_004: 'SERVER_004', // サーバー作成に失敗
  SERVER_005: 'SERVER_005', // サーバー削除に失敗
  SERVER_006: 'SERVER_006', // サーバー設定の更新に失敗
  SERVER_007: 'SERVER_007', // サーバー状態の取得に失敗

  // 設定管理エラー（CONFIG_xxx）
  CONFIG_001: 'CONFIG_001', // 設定が見つからない
  CONFIG_002: 'CONFIG_002', // 設定の読み込みに失敗
  CONFIG_003: 'CONFIG_003', // 設定の保存に失敗
  CONFIG_004: 'CONFIG_004', // 設定の検証に失敗
  CONFIG_005: 'CONFIG_005', // デフォルト設定の読み込みに失敗

  // シークレット管理エラー（SECRET_xxx）
  SECRET_001: 'SECRET_001', // シークレットが見つからない
  SECRET_002: 'SECRET_002', // シークレットの復号化に失敗
  SECRET_003: 'SECRET_003', // シークレットの暗号化に失敗
  SECRET_004: 'SECRET_004', // キーの生成に失敗
  SECRET_005: 'SECRET_005', // Bitwarden同期に失敗

  // カタログエラー（CATALOG_xxx）
  CATALOG_001: 'CATALOG_001', // カタログの取得に失敗
  CATALOG_002: 'CATALOG_002', // サーバーのインストールに失敗
  CATALOG_003: 'CATALOG_003', // サーバーの検索に失敗

  // Dockerエラー（DOCKER_xxx）
  DOCKER_001: 'DOCKER_001', // Docker接続に失敗
  DOCKER_002: 'DOCKER_002', // コンテナの作成に失敗
  DOCKER_003: 'DOCKER_003', // コンテナの開始に失敗
  DOCKER_004: 'DOCKER_004', // コンテナの停止に失敗
  DOCKER_005: 'DOCKER_005', // イメージの取得に失敗

  // MCPエラー（MCP_xxx）
  MCP_001: 'MCP_001', // MCP CLIの実行に失敗
  MCP_002: 'MCP_002', // MCPサーバーとの通信に失敗
  MCP_003: 'MCP_003', // MCP設定の読み込みに失敗
  MCP_004: 'MCP_004', // ツールの実行に失敗

  // ネットワークエラー（NET_xxx）
  NET_001: 'NET_001', // 接続タイムアウト
  NET_002: 'NET_002', // 接続拒否
  NET_003: 'NET_003', // DNSエラー
  NET_004: 'NET_004', // SSL証明書エラー

  // データベースエラー（DB_xxx）
  DB_001: 'DB_001', // データベース接続に失敗
  DB_002: 'DB_002', // クエリの実行に失敗
  DB_003: 'DB_003', // トランザクションに失敗
  DB_004: 'DB_004', // データの整合性エラー

  // システムエラー（SYS_xxx）
  SYS_001: 'SYS_001', // ファイルの読み込みに失敗
  SYS_002: 'SYS_002', // ファイルの書き込みに失敗
  SYS_003: 'SYS_003', // ディスク容量不足
  SYS_004: 'SYS_004', // メモリ不足
  SYS_005: 'SYS_005', // 予期しないシステムエラー

  // レート制限エラー（RATE_xxx）
  RATE_001: 'RATE_001', // IPベースレート制限
  RATE_002: 'RATE_002', // ユーザーベースレート制限
  RATE_003: 'RATE_003', // APIレート制限

  // 不明なエラー（UNKNOWN_xxx）
  UNKNOWN_001: 'UNKNOWN_001', // 予期しないエラー
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * エラーコンテキスト情報
 */
export interface ErrorContext {
  /** ユーザーID */
  userId?: string;
  /** リクエストID */
  requestId?: string;
  /** セッションID */
  sessionId?: string;
  /** IPアドレス */
  ipAddress?: string;
  /** ユーザーエージェント */
  userAgent?: string;
  /** リクエストパス */
  path?: string;
  /** HTTPメソッド */
  method?: string;
  /** 追加のコンテキスト情報 */
  metadata?: Record<string, unknown>;
  /** スタックトレース */
  stackTrace?: string;
  /** 関連するリソースID */
  resourceId?: string;
  /** 操作名 */
  operation?: string;
}

/**
 * 構造化エラー情報
 */
export interface StructuredError {
  /** エラーコード */
  code: ErrorCode;
  /** エラーメッセージ（英語） */
  message: string;
  /** 日本語エラーメッセージ */
  messageJa?: string;
  /** エラーレベル */
  level: ErrorLevel;
  /** エラーカテゴリ */
  category: ErrorCategory;
  /** HTTPステータスコード */
  httpStatus: HttpStatus;
  /** タイムスタンプ */
  timestamp: string;
  /** エラーコンテキスト */
  context?: ErrorContext;
  /** 原因エラー */
  cause?: Error | StructuredError;
  /** ユーザーへの推奨アクション */
  suggestedAction?: string;
  /** 詳細情報（デバッグ用） */
  details?: Record<string, unknown>;
  /** 復旧可能かどうか */
  recoverable: boolean;
  /** 再試行可能かどうか */
  retryable: boolean;
}

/**
 * エラー統計情報
 */
export interface ErrorStatistics {
  /** エラーの総数 */
  total: number;
  /** カテゴリ別エラー数 */
  byCategory: Record<ErrorCategory, number>;
  /** レベル別エラー数 */
  byLevel: Record<ErrorLevel, number>;
  /** 時間範囲での発生数 */
  byTimeRange: {
    lastHour: number;
    lastDay: number;
    lastWeek: number;
  };
  /** 最頻出エラーコード */
  topErrors: Array<{
    code: ErrorCode;
    count: number;
    percentage: number;
  }>;
}

/**
 * エラー通知設定
 */
export interface ErrorNotificationConfig {
  /** 通知を有効にするエラーレベル */
  minLevel: ErrorLevel;
  /** 通知チャンネル */
  channels: Array<'email' | 'slack' | 'webhook' | 'database'>;
  /** レート制限（分あたりの最大通知数） */
  rateLimit: number;
  /** 重複除去の時間窓（秒） */
  deduplicationWindow: number;
}

/**
 * エラーレスポンス（API用）
 */
export interface ErrorResponse {
  /** エラーかどうかの識別子 */
  error: true;
  /** エラー情報 */
  data: {
    /** エラーコード */
    code: ErrorCode;
    /** エラーメッセージ */
    message: string;
    /** 詳細情報 */
    details?: Record<string, unknown>;
    /** タイムスタンプ */
    timestamp: string;
    /** リクエストID */
    requestId?: string;
  };
  /** メタデータ */
  meta?: {
    /** 追跡用ID */
    traceId?: string;
    /** API バージョン */
    apiVersion: string;
  };
}