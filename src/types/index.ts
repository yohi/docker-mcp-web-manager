/**
 * 型定義のエクスポート
 */

// API関連の型
export * from './api';

// 認証関連の型
export * from './auth';

// カタログ関連の型
export type {
  CatalogEntry,
  CatalogConfiguration,
  InstallationStatus,
  CatalogStats,
  InstallationProgress,
  InstallationRequest,
  CatalogSearchFilters,
  CatalogSortOptions
} from './catalog';

// ダッシュボード関連の型
export type {
  DashboardStats,
  DashboardOverview,
  QuickAction,
  ActivityFeed,
  MetricCard,
  NotificationSummary,
  HealthSummary
} from './dashboard';

// サーバー関連の型
export type {
  ServerConfig,
  VolumeMount as ServerVolumeMount,
  PortMapping as ServerPortMapping,
  ServerStatus as ServerStatusType,
  ServerState,
  HealthStatus,
  ResourceUsage,
  ServerLog,
  ServerAction,
  CreateServerRequest
} from './server';

// 共通の型定義
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterOptions {
  [key: string]: any;
}

export interface SearchOptions {
  query?: string;
  filters?: FilterOptions;
  sort?: SortOptions;
  pagination?: {
    page: number;
    limit: number;
  };
}