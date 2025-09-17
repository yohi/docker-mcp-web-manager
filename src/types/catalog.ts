/**
 * カタログ関連の型定義
 */

export interface CatalogDependency {
  name: string;
  version: string;
  required: boolean;
}

export interface EnvironmentVariable {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface VolumeMount {
  source: string;
  target: string;
  description: string;
  required: boolean;
}

export interface PortMapping {
  port: number;
  protocol: 'tcp' | 'udp';
  description: string;
}

export interface CatalogConfiguration {
  environment?: EnvironmentVariable[];
  volumes?: VolumeMount[];
  ports?: PortMapping[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  displayName: string;
  description: string;
  longDescription?: string;
  version: string;
  author: string;
  authorUrl?: string;
  category: string;
  tags: string[];
  imageUrl: string;
  sourceUrl?: string;
  documentationUrl?: string;
  downloadCount: number;
  rating: number;
  ratingCount: number;
  size: number;
  lastUpdated: string;
  createdAt: string;
  verified: boolean;
  featured: boolean;
  icon?: string;
  screenshots?: string[];
  dependencies?: CatalogDependency[];
  configuration?: CatalogConfiguration;
  installationStatus?: InstallationStatus;
}

export type InstallationStatus = 'not_installed' | 'installing' | 'installed' | 'failed';

export interface CatalogFilter {
  category?: string;
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  searchQuery?: string;
}

export interface CatalogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}