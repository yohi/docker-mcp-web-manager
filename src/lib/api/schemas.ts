// API Schema Definitions
import { z } from 'zod';

// Common schemas used across API endpoints
export const CommonSchemas = {
  // ID validation (UUID or similar)
  id: z.string().min(1, 'ID is required'),

  // Pagination
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),

  // Sorting
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),

  // Status
  status: z.enum(['active', 'inactive', 'pending', 'error']).optional(),

  // Timestamps
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
};

// Server specific schemas
export const ServerSchemas = {
  createServer: z.object({
    name: z.string().min(1, 'Name is required'),
    image: z.string().min(1, 'Image is required'),
    description: z.string().optional(),
    version: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    environment: z.record(z.string()).optional(),
    resourceLimits: z.object({
      memory: z.string().optional(),
      cpu: z.string().optional(),
    }).optional(),
    status: z.enum(['active', 'inactive', 'pending', 'error']).optional(),
    configuration: z.object({
      environment: z.record(z.string()).optional(),
      enabledTools: z.array(z.string()).optional(),
      resourceLimits: z.object({
        memory: z.string().optional(),
        cpu: z.string().optional(),
      }).optional(),
      networkConfig: z.object({
        mode: z.string().optional(),
      }).optional(),
    }).optional(),
  }),

  updateServer: z.object({
    name: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    environment: z.record(z.string()).optional(),
    resourceLimits: z.object({
      memory: z.string().optional(),
      cpu: z.string().optional(),
    }).optional(),
    status: z.enum(['active', 'inactive', 'pending', 'error']).optional(),
    configuration: z.object({
      environment: z.record(z.string()).optional(),
      enabledTools: z.array(z.string()).optional(),
      resourceLimits: z.object({
        memory: z.string().optional(),
        cpu: z.string().optional(),
      }).optional(),
      networkConfig: z.object({
        mode: z.string().optional(),
      }).optional(),
    }).optional(),
  }),
};

// Settings specific schemas
export const SettingsSchemas = {
  updateSettings: z.object({
    theme: z.enum(['light', 'dark', 'auto']).optional(),
    language: z.string().optional(),
    notifications: z.boolean().optional(),
    autoBackup: z.boolean().optional(),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  }),

  backupData: z.object({
    includeSettings: z.boolean().optional().default(true),
    includeServers: z.boolean().optional().default(true),
    includeTools: z.boolean().optional().default(true),
    compressed: z.boolean().optional().default(true),
  }),

  restoreData: z.object({
    data: z.string().min(1, 'Backup data is required'),
    overwrite: z.boolean().optional().default(false),
    verify: z.boolean().optional().default(true),
  }),
};

// Monitoring specific schemas
export const MonitoringSchemas = {
  getMetrics: z.object({
    timeRange: z.enum(['1h', '6h', '24h', '7d', '30d']).optional().default('24h'),
    interval: z.enum(['1m', '5m', '15m', '1h', '1d']).optional().default('5m'),
    metrics: z.array(z.string()).optional(),
  }),
};
