/**
 * API関連の型定義
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  timestamp: string;
}

export interface ResponseMeta {
  version: string;
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  type: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  result?: any;
  error?: string;
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, HealthCheck>;
}

export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  timestamp: string;
  duration: number;
  output?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ErrorResponse extends ApiResponse {
  success: false;
  error: ApiError;
  validationErrors?: ValidationError[];
}