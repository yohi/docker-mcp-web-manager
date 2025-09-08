// =============================================================================
// API キャッシュシステム
// インメモリキャッシュとRedis統合キャッシングの包括的実装
// =============================================================================

import { Redis } from 'ioredis';
import { z } from 'zod';

/**
 * キャッシュエントリスキーマ
 */
const CacheEntrySchema = z.object({
  key: z.string(),
  value: z.any(),
  ttl: z.number(),
  createdAt: z.number(),
  accessCount: z.number().default(0),
  tags: z.array(z.string()).optional(),
});

type CacheEntry = z.infer<typeof CacheEntrySchema>;

/**
 * キャッシュ統計情報
 */
interface CacheStats {
  hits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
  memoryUsage: number;
  entryCount: number;
}

/**
 * キャッシュ設定
 */
interface CacheConfig {
  defaultTTL: number;
  maxMemoryUsage: number;
  cleanupInterval: number;
  enableRedis: boolean;
  redisUrl?: string;
  enableCompression: boolean;
  enableStats: boolean;
}

/**
 * インメモリ キャッシュマネージャー
 */
class InMemoryCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    hitRate: 0,
    memoryUsage: 0,
    entryCount: 0,
  };

  constructor(private config: CacheConfig) {
    if (config.cleanupInterval > 0) {
      setInterval(() => this.cleanup(), config.cleanupInterval);
    }
  }

  /**
   * キャッシュから値を取得
   */
  get<T>(key: string): T | null {
    this.stats.totalRequests++;

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // TTL チェック
    const now = Date.now();
    if (now > entry.createdAt + entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // アクセス回数を更新
    entry.accessCount++;
    this.stats.hits++;
    this.updateHitRate();

    return entry.value as T;
  }

  /**
   * キャッシュに値を設定
   */
  set<T>(key: string, value: T, ttl?: number, tags?: string[]): void {
    const entry: CacheEntry = {
      key,
      value,
      ttl: ttl || this.config.defaultTTL,
      createdAt: Date.now(),
      accessCount: 0,
      tags,
    };

    this.cache.set(key, entry);
    this.updateStats();

    // メモリ使用量チェック
    if (this.stats.memoryUsage > this.config.maxMemoryUsage) {
      this.evictLRU();
    }
  }

  /**
   * キャッシュから削除
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.updateStats();
    return deleted;
  }

  /**
   * タグによる削除
   */
  deleteByTag(tag: string): number {
    let deleteCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.includes(tag)) {
        this.cache.delete(key);
        deleteCount++;
      }
    }

    this.updateStats();
    return deleteCount;
  }

  /**
   * キャッシュクリア
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * 期限切れエントリのクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.createdAt + entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.updateStats();
      console.log(`[Cache] Cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * LRU (Least Recently Used) による退避
   */
  private evictLRU(): void {
    // アクセス回数が最も少ないエントリを削除
    let lruKey: string | null = null;
    let minAccessCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccessCount) {
        minAccessCount = entry.accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.updateStats();
    }
  }

  /**
   * 統計情報を更新
   */
  private updateStats(): void {
    this.stats.entryCount = this.cache.size;
    this.stats.memoryUsage = this.estimateMemoryUsage();
  }

  /**
   * ヒット率を更新
   */
  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? this.stats.hits / this.stats.totalRequests 
      : 0;
  }

  /**
   * メモリ使用量を推定
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length * 2; // UTF-16
      totalSize += JSON.stringify(entry).length * 2;
    }

    return totalSize;
  }

  /**
   * 統計情報をリセット
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      memoryUsage: 0,
      entryCount: 0,
    };
  }

  /**
   * 統計情報を取得
   */
  getStats(): CacheStats {
    this.updateStats();
    return { ...this.stats };
  }
}

/**
 * Redis キャッシュマネージャー
 */
class RedisCache {
  private redis: Redis | null = null;
  private connected = false;

  constructor(private config: CacheConfig) {
    if (config.enableRedis && config.redisUrl) {
      this.initializeRedis();
    }
  }

  /**
   * Redis 接続を初期化
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(this.config.redisUrl!, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      await this.redis.ping();
      this.connected = true;
      console.log('[Cache] Redis connection established');
    } catch (error) {
      console.error('[Cache] Redis connection failed:', error);
      this.connected = false;
    }
  }

  /**
   * キャッシュから値を取得
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.redis) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }

      return this.config.enableCompression
        ? this.decompress(value)
        : JSON.parse(value);
    } catch (error) {
      console.error('[Cache] Redis get error:', error);
      return null;
    }
  }

  /**
   * キャッシュに値を設定
   */
  async set<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    if (!this.connected || !this.redis) {
      return;
    }

    try {
      const serializedValue = this.config.enableCompression
        ? this.compress(value)
        : JSON.stringify(value);

      const expireTime = ttl || this.config.defaultTTL;
      await this.redis.setex(key, Math.floor(expireTime / 1000), serializedValue);

      // タグ情報を保存
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          await this.redis.sadd(`tag:${tag}`, key);
          await this.redis.expire(`tag:${tag}`, Math.floor(expireTime / 1000));
        }
      }
    } catch (error) {
      console.error('[Cache] Redis set error:', error);
    }
  }

  /**
   * キャッシュから削除
   */
  async delete(key: string): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      console.error('[Cache] Redis delete error:', error);
      return false;
    }
  }

  /**
   * タグによる削除
   */
  async deleteByTag(tag: string): Promise<number> {
    if (!this.connected || !this.redis) {
      return 0;
    }

    try {
      const keys = await this.redis.smembers(`tag:${tag}`);
      if (keys.length === 0) {
        return 0;
      }

      const deleteCount = await this.redis.del(...keys);
      await this.redis.del(`tag:${tag}`);
      
      return deleteCount;
    } catch (error) {
      console.error('[Cache] Redis deleteByTag error:', error);
      return 0;
    }
  }

  /**
   * データ圧縮
   */
  private compress<T>(data: T): string {
    // 実際の実装では、gzip や brotli を使用
    return JSON.stringify(data);
  }

  /**
   * データ展開
   */
  private decompress<T>(data: string): T {
    // 実際の実装では、対応する展開処理を行う
    return JSON.parse(data);
  }
}

/**
 * 統合キャッシュマネージャー
 */
export class CacheManager {
  private memoryCache: InMemoryCache;
  private redisCache: RedisCache;

  constructor(config: Partial<CacheConfig> = {}) {
    const defaultConfig: CacheConfig = {
      defaultTTL: 5 * 60 * 1000, // 5分
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      cleanupInterval: 60 * 1000, // 1分
      enableRedis: false,
      enableCompression: false,
      enableStats: true,
      ...config,
    };

    this.memoryCache = new InMemoryCache(defaultConfig);
    this.redisCache = new RedisCache(defaultConfig);
  }

  /**
   * キャッシュから値を取得（L1: Memory, L2: Redis）
   */
  async get<T>(key: string): Promise<T | null> {
    // L1 キャッシュ（メモリ）から取得
    let value = this.memoryCache.get<T>(key);
    if (value !== null) {
      return value;
    }

    // L2 キャッシュ（Redis）から取得
    value = await this.redisCache.get<T>(key);
    if (value !== null) {
      // L1 キャッシュにも保存
      this.memoryCache.set(key, value);
      return value;
    }

    return null;
  }

  /**
   * キャッシュに値を設定
   */
  async set<T>(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    // L1 キャッシュ（メモリ）に保存
    this.memoryCache.set(key, value, ttl, tags);

    // L2 キャッシュ（Redis）に保存
    await this.redisCache.set(key, value, ttl, tags);
  }

  /**
   * キャッシュから削除
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.redisCache.delete(key);
  }

  /**
   * タグによる削除
   */
  async deleteByTag(tag: string): Promise<void> {
    this.memoryCache.deleteByTag(tag);
    await this.redisCache.deleteByTag(tag);
  }

  /**
   * 統計情報を取得
   */
  getStats(): CacheStats {
    return this.memoryCache.getStats();
  }

  /**
   * キャッシュをクリア
   */
  clear(): void {
    this.memoryCache.clear();
  }
}

/**
 * グローバル キャッシュインスタンス
 */
export const globalCache = new CacheManager({
  enableRedis: process.env.REDIS_URL !== undefined,
  redisUrl: process.env.REDIS_URL,
  enableCompression: process.env.NODE_ENV === 'production',
  defaultTTL: 5 * 60 * 1000, // 5分
});

/**
 * キャッシュデコレーター（関数用）
 */
export function cached<T extends (...args: any[]) => any>(
  ttl: number = 5 * 60 * 1000,
  tags?: string[]
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: Parameters<T>) {
      const cacheKey = `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;
      
      // キャッシュから取得
      let result = await globalCache.get(cacheKey);
      if (result !== null) {
        return result;
      }

      // オリジナルメソッドを実行
      result = await originalMethod.apply(this, args);
      
      // キャッシュに保存
      await globalCache.set(cacheKey, result, ttl, tags);
      
      return result;
    };

    return descriptor;
  };
}

/**
 * React Hook: API レスポンスキャッシュ
 */
export function useCachedApi<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 5 * 60 * 1000,
  tags?: string[]
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // キャッシュから取得
      let cachedData = await globalCache.get<T>(key);
      
      if (cachedData !== null) {
        setData(cachedData);
        setLoading(false);
        return;
      }

      // データを取得
      const result = await fetcher();
      
      // キャッシュに保存
      await globalCache.set(key, result, ttl, tags);
      
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttl, tags]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    clearCache: () => globalCache.delete(key),
  };
}

// React をインポート
import React from 'react';