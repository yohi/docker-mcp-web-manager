import { NextRequest, NextResponse } from 'next/server';
import { CacheManager, globalCache } from './api-cache';

// =============================================================================
// 統合キャッシュ戦略システム
// 多層キャッシュ、無効化戦略、パフォーマンス最適化の実装
// =============================================================================

/**
 * キャッシュ戦略の種類
 */
export enum CacheStrategy {
  CACHE_ASIDE = 'cache-aside',           // キャッシュ・アサイド
  WRITE_THROUGH = 'write-through',       // ライトスルー
  WRITE_BEHIND = 'write-behind',         // ライトビハインド
  REFRESH_AHEAD = 'refresh-ahead',       // リフレッシュ・アヘッド
}

/**
 * キャッシュレベル
 */
export enum CacheLevel {
  L1_MEMORY = 'l1-memory',               // L1: インメモリ
  L2_REDIS = 'l2-redis',                 // L2: Redis
  L3_CDN = 'l3-cdn',                     // L3: CDN
  L4_BROWSER = 'l4-browser',             // L4: ブラウザ
}

/**
 * キャッシュポリシー設定
 */
interface CachePolicy {
  strategy: CacheStrategy;
  levels: CacheLevel[];
  ttl: {
    [CacheLevel.L1_MEMORY]?: number;
    [CacheLevel.L2_REDIS]?: number;
    [CacheLevel.L3_CDN]?: number;
    [CacheLevel.L4_BROWSER]?: number;
  };
  tags?: string[];
  invalidateOn?: string[];
  compressionThreshold?: number;
  maxSize?: number;
}

/**
 * キャッシュコンテキスト
 */
interface CacheContext {
  key: string;
  policy: CachePolicy;
  metadata: {
    userId?: string;
    sessionId?: string;
    userAgent?: string;
    ip?: string;
  };
}

/**
 * 統合キャッシュマネージャー
 */
export class IntegratedCacheManager {
  private policies = new Map<string, CachePolicy>();
  private cacheManager: CacheManager;

  constructor() {
    this.cacheManager = globalCache;
    this.initializeDefaultPolicies();
  }

  /**
   * デフォルトキャッシュポリシーを初期化
   */
  private initializeDefaultPolicies(): void {
    // サーバー一覧のキャッシュポリシー
    this.registerPolicy('servers.list', {
      strategy: CacheStrategy.CACHE_ASIDE,
      levels: [CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS, CacheLevel.L4_BROWSER],
      ttl: {
        [CacheLevel.L1_MEMORY]: 2 * 60 * 1000,      // 2分
        [CacheLevel.L2_REDIS]: 5 * 60 * 1000,       // 5分
        [CacheLevel.L4_BROWSER]: 1 * 60 * 1000,     // 1分
      },
      tags: ['servers'],
      invalidateOn: ['servers.create', 'servers.update', 'servers.delete'],
    });

    // サーバー詳細のキャッシュポリシー
    this.registerPolicy('servers.detail', {
      strategy: CacheStrategy.CACHE_ASIDE,
      levels: [CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS],
      ttl: {
        [CacheLevel.L1_MEMORY]: 5 * 60 * 1000,      // 5分
        [CacheLevel.L2_REDIS]: 15 * 60 * 1000,      // 15分
      },
      tags: ['servers'],
      invalidateOn: ['servers.update', 'servers.delete', 'servers.status'],
    });

    // カタログ情報のキャッシュポリシー
    this.registerPolicy('catalog.list', {
      strategy: CacheStrategy.REFRESH_AHEAD,
      levels: [CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS, CacheLevel.L4_BROWSER],
      ttl: {
        [CacheLevel.L1_MEMORY]: 30 * 60 * 1000,     // 30分
        [CacheLevel.L2_REDIS]: 60 * 60 * 1000,      // 1時間
        [CacheLevel.L4_BROWSER]: 15 * 60 * 1000,    // 15分
      },
      tags: ['catalog'],
      invalidateOn: ['catalog.sync'],
    });

    // ユーザーセッション情報のキャッシュポリシー
    this.registerPolicy('user.session', {
      strategy: CacheStrategy.WRITE_THROUGH,
      levels: [CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS],
      ttl: {
        [CacheLevel.L1_MEMORY]: 5 * 60 * 1000,      // 5分
        [CacheLevel.L2_REDIS]: 24 * 60 * 60 * 1000, // 24時間
      },
      tags: ['session'],
      invalidateOn: ['user.logout', 'user.update'],
    });

    // システム設定のキャッシュポリシー
    this.registerPolicy('config.settings', {
      strategy: CacheStrategy.WRITE_THROUGH,
      levels: [CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS],
      ttl: {
        [CacheLevel.L1_MEMORY]: 60 * 60 * 1000,     // 1時間
        [CacheLevel.L2_REDIS]: 4 * 60 * 60 * 1000,  // 4時間
      },
      tags: ['config'],
      invalidateOn: ['config.update'],
    });
  }

  /**
   * キャッシュポリシーを登録
   */
  registerPolicy(key: string, policy: CachePolicy): void {
    this.policies.set(key, policy);
  }

  /**
   * キャッシュポリシーを取得
   */
  getPolicy(key: string): CachePolicy | undefined {
    return this.policies.get(key);
  }

  /**
   * データをキャッシュに保存
   */
  async set<T>(
    context: CacheContext,
    data: T,
    customTTL?: number
  ): Promise<void> {
    const { key, policy } = context;

    for (const level of policy.levels) {
      const ttl = customTTL || policy.ttl[level];
      if (!ttl) continue;

      try {
        switch (level) {
          case CacheLevel.L1_MEMORY:
          case CacheLevel.L2_REDIS:
            await this.cacheManager.set(
              this.buildKey(key, level, context.metadata),
              data,
              ttl,
              policy.tags
            );
            break;

          case CacheLevel.L4_BROWSER:
            // ブラウザキャッシュは HTTP ヘッダーで制御
            break;
        }
      } catch (error) {
        console.error(`[Cache] Error setting cache for level ${level}:`, error);
      }
    }
  }

  /**
   * キャッシュからデータを取得
   */
  async get<T>(context: CacheContext): Promise<T | null> {
    const { key, policy } = context;

    // L1 から順番にチェック
    for (const level of policy.levels) {
      try {
        let data: T | null = null;

        switch (level) {
          case CacheLevel.L1_MEMORY:
          case CacheLevel.L2_REDIS:
            data = await this.cacheManager.get<T>(
              this.buildKey(key, level, context.metadata)
            );
            break;

          case CacheLevel.L4_BROWSER:
            // ブラウザキャッシュは HTTP ヘッダーで処理
            continue;
        }

        if (data !== null) {
          // 上位レベルにもデータを保存（プロモーション）
          await this.promoteToUpperLevels(context, data, level);
          return data;
        }
      } catch (error) {
        console.error(`[Cache] Error getting cache from level ${level}:`, error);
      }
    }

    return null;
  }

  /**
   * キャッシュからデータを削除
   */
  async delete(context: CacheContext): Promise<void> {
    const { key, policy } = context;

    for (const level of policy.levels) {
      try {
        switch (level) {
          case CacheLevel.L1_MEMORY:
          case CacheLevel.L2_REDIS:
            await this.cacheManager.delete(
              this.buildKey(key, level, context.metadata)
            );
            break;
        }
      } catch (error) {
        console.error(`[Cache] Error deleting cache for level ${level}:`, error);
      }
    }
  }

  /**
   * タグによるキャッシュ無効化
   */
  async invalidateByTag(tag: string): Promise<void> {
    try {
      await this.cacheManager.deleteByTag(tag);
      console.log(`[Cache] Invalidated cache for tag: ${tag}`);
    } catch (error) {
      console.error(`[Cache] Error invalidating cache for tag ${tag}:`, error);
    }
  }

  /**
   * イベントによるキャッシュ無効化
   */
  async invalidateByEvent(event: string): Promise<void> {
    for (const [policyKey, policy] of this.policies.entries()) {
      if (policy.invalidateOn?.includes(event)) {
        if (policy.tags) {
          for (const tag of policy.tags) {
            await this.invalidateByTag(tag);
          }
        }
      }
    }
  }

  /**
   * 上位レベルへのデータプロモーション
   */
  private async promoteToUpperLevels<T>(
    context: CacheContext,
    data: T,
    currentLevel: CacheLevel
  ): Promise<void> {
    const { policy } = context;
    const levelIndex = policy.levels.indexOf(currentLevel);
    
    // 現在のレベルより上位のレベルにデータを保存
    for (let i = 0; i < levelIndex; i++) {
      const upperLevel = policy.levels[i];
      const ttl = policy.ttl[upperLevel];
      
      if (ttl) {
        await this.set({
          ...context,
          policy: {
            ...policy,
            levels: [upperLevel],
          }
        }, data, ttl);
      }
    }
  }

  /**
   * キャッシュキーの構築
   */
  private buildKey(
    baseKey: string, 
    level: CacheLevel, 
    metadata: CacheContext['metadata']
  ): string {
    let key = `${level}:${baseKey}`;
    
    // ユーザー固有のキャッシュの場合
    if (metadata.userId) {
      key += `:user:${metadata.userId}`;
    }
    
    // セッション固有のキャッシュの場合
    if (metadata.sessionId) {
      key += `:session:${metadata.sessionId}`;
    }

    return key;
  }
}

/**
 * HTTP レスポンスキャッシュミドルウェア
 */
export class HttpCacheMiddleware {
  private cacheManager: IntegratedCacheManager;

  constructor() {
    this.cacheManager = new IntegratedCacheManager();
  }

  /**
   * リクエストキャッシュチェック
   */
  async handleRequest(
    request: NextRequest,
    policyKey: string,
    keyGenerator?: (req: NextRequest) => string
  ): Promise<NextResponse | null> {
    const policy = this.cacheManager.getPolicy(policyKey);
    if (!policy) return null;

    // ブラウザキャッシュ対応レベルをチェック
    if (!policy.levels.includes(CacheLevel.L4_BROWSER)) {
      return null;
    }

    const cacheKey = keyGenerator ? keyGenerator(request) : this.generateCacheKey(request);
    const context: CacheContext = {
      key: cacheKey,
      policy,
      metadata: {
        userAgent: request.headers.get('user-agent') || undefined,
        ip: request.headers.get('x-forwarded-for') || request.ip,
      }
    };

    // キャッシュからデータを取得
    const cachedData = await this.cacheManager.get(context);
    if (cachedData) {
      return this.createCachedResponse(cachedData, policy);
    }

    return null;
  }

  /**
   * レスポンスキャッシュ設定
   */
  async handleResponse(
    request: NextRequest,
    response: NextResponse,
    policyKey: string,
    data?: any,
    keyGenerator?: (req: NextRequest) => string
  ): Promise<NextResponse> {
    const policy = this.cacheManager.getPolicy(policyKey);
    if (!policy || !data) return response;

    const cacheKey = keyGenerator ? keyGenerator(request) : this.generateCacheKey(request);
    const context: CacheContext = {
      key: cacheKey,
      policy,
      metadata: {
        userAgent: request.headers.get('user-agent') || undefined,
        ip: request.headers.get('x-forwarded-for') || request.ip,
      }
    };

    // データをキャッシュに保存
    await this.cacheManager.set(context, data);

    // HTTP キャッシュヘッダーを設定
    return this.setCacheHeaders(response, policy);
  }

  /**
   * キャッシュキー生成
   */
  private generateCacheKey(request: NextRequest): string {
    const url = new URL(request.url);
    return `${request.method}:${url.pathname}:${url.search}`;
  }

  /**
   * キャッシュされたレスポンス作成
   */
  private createCachedResponse(data: any, policy: CachePolicy): NextResponse {
    const response = NextResponse.json(data);
    return this.setCacheHeaders(response, policy);
  }

  /**
   * キャッシュヘッダー設定
   */
  private setCacheHeaders(response: NextResponse, policy: CachePolicy): NextResponse {
    const browserTTL = policy.ttl[CacheLevel.L4_BROWSER];
    
    if (browserTTL) {
      const maxAge = Math.floor(browserTTL / 1000);
      response.headers.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}`);
      response.headers.set('Expires', new Date(Date.now() + browserTTL).toUTCString());
    }

    // ETag 設定
    const etag = this.generateETag(response);
    if (etag) {
      response.headers.set('ETag', etag);
    }

    // バリエーション設定
    response.headers.set('Vary', 'Accept-Encoding, Authorization');

    return response;
  }

  /**
   * ETag 生成
   */
  private generateETag(response: NextResponse): string | null {
    try {
      const content = JSON.stringify(response);
      return `"${Buffer.from(content).toString('base64').substring(0, 16)}"`;
    } catch (error) {
      return null;
    }
  }
}

/**
 * キャッシュウォームアップサービス
 */
export class CacheWarmupService {
  private cacheManager: IntegratedCacheManager;

  constructor() {
    this.cacheManager = new IntegratedCacheManager();
  }

  /**
   * キャッシュウォームアップ実行
   */
  async warmupCache(): Promise<void> {
    console.log('[Cache] Starting cache warmup...');

    try {
      // 重要なデータを事前にキャッシュ
      await this.warmupCriticalData();
      
      // 頻繁にアクセスされるデータをキャッシュ
      await this.warmupFrequentData();

      console.log('[Cache] Cache warmup completed successfully');
    } catch (error) {
      console.error('[Cache] Cache warmup failed:', error);
    }
  }

  /**
   * 重要データのウォームアップ
   */
  private async warmupCriticalData(): Promise<void> {
    // システム設定
    // カタログ情報
    // アクティブなサーバー一覧
    // 実装は具体的なデータ取得ロジックに依存
  }

  /**
   * 頻繁アクセスデータのウォームアップ
   */
  private async warmupFrequentData(): Promise<void> {
    // ダッシュボード統計
    // 最近のアクティビティ
    // ユーザー設定
    // 実装は具体的なデータ取得ロジックに依存
  }
}

/**
 * グローバルキャッシュインスタンス
 */
export const integratedCacheManager = new IntegratedCacheManager();
export const httpCacheMiddleware = new HttpCacheMiddleware();
export const cacheWarmupService = new CacheWarmupService();

/**
 * キャッシュデコレーター（クラスメソッド用）
 */
export function CachedMethod(policyKey: string, customTTL?: number) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const policy = integratedCacheManager.getPolicy(policyKey);
      if (!policy) {
        return await originalMethod.apply(this, args);
      }

      const cacheKey = `${target.constructor.name}.${propertyName}:${JSON.stringify(args)}`;
      const context: CacheContext = {
        key: cacheKey,
        policy,
        metadata: {}
      };

      // キャッシュから取得
      let result = await integratedCacheManager.get(context);
      if (result !== null) {
        return result;
      }

      // オリジナルメソッドを実行
      result = await originalMethod.apply(this, args);
      
      // キャッシュに保存
      await integratedCacheManager.set(context, result, customTTL);
      
      return result;
    };

    return descriptor;
  };
}