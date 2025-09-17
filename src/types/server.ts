/**
 * サーバー関連の型定義
 */

export interface ServerConfig {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  image: string;
  version: string;
  category: string;
  tags: string[];
  author?: string;
  environment?: Record<string, string>;
  volumes?: VolumeMount[];
  ports?: PortMapping[];
  capabilities?: string[];
  networks?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VolumeMount {
  source: string;
  target: string;
  type?: 'bind' | 'volume' | 'tmpfs';
  readonly?: boolean;
}

export interface PortMapping {
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
}

export interface ServerStatus {
  id: string;
  state: ServerState;
  health: HealthStatus;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
  resources?: ResourceUsage;
}

export type ServerState =
  | 'created'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead';

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'none';

export interface ResourceUsage {
  cpuPercentage: number;
  memoryUsage: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export interface ServerLog {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  source?: string;
}

export interface ServerAction {
  type: 'start' | 'stop' | 'restart' | 'remove' | 'logs' | 'exec';
  timestamp: string;
  userId?: string;
  result: 'success' | 'error';
  error?: string;
}

export interface CreateServerRequest {
  name: string;
  displayName: string;
  description?: string;
  image: string;
  version?: string;
  category: string;
  tags?: string[];
  author?: string;
  environment?: Record<string, string>;
  volumes?: VolumeMount[];
  ports?: PortMapping[];
  capabilities?: string[];
  autoStart?: boolean;
}