/**
 * ダッシュボード関連の型定義
 */

export interface ServerStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
}

export interface CatalogStats {
  available: number;
  installed: number;
}

export interface SystemStats {
  uptime: string;
  version: string;
  lastUpdated: string;
}

export interface ResourceStats {
  cpu: number;
  memory: number;
  disk: number;
}

export interface DashboardStats {
  servers: ServerStats;
  catalog: CatalogStats;
  system: SystemStats;
  resources: ResourceStats;
}

/**
 * サーバーの状態を表す型
 */
export type ServerStatus = 'running' | 'stopped' | 'error' | 'unknown';

/**
 * システムの健康状態を表す型
 */
export type SystemHealth = 'healthy' | 'warning' | 'critical';

/**
 * ダッシュボードタブの型
 */
export type DashboardTab = 'overview' | 'servers' | 'monitoring' | 'settings';