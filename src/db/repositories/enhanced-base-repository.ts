// 強化されたベースリポジトリ実装（新しい型定義に対応）

import { eq, asc, desc, count, and, or, sql, type SQLWrapper } from 'drizzle-orm';
import { getDatabase } from '@/db/client';
import type { Database } from '@/db/client';
import {
  BaseRepository,
  ListResponse,
  ListOptions,
  RepositoryError,
  NotFoundError,
  DuplicateError,
  ValidationError,
  Transaction,
} from '@/types/repository';

export abstract class EnhancedBaseRepository<
  T extends Record<string, any>,
  TCreate extends Record<string, any>,
  TUpdate extends Partial<TCreate>,
  TFilters extends ListOptions = ListOptions
> implements BaseRepository<T, TCreate, TUpdate, TFilters> {
  
  protected db: Database | null = null;
  protected abstract tableName: string;
  protected abstract table: any;
  protected abstract primaryKey: keyof T;

  /**
   * データベース接続を取得（遅延初期化）
   */
  protected async getDb(): Promise<Database> {
    if (!this.db) {
      this.db = await getDatabase();
    }
    return this.db;
  }

  /**
   * エラーラッピング
   */
  protected wrapError(error: any, operation: string): RepositoryError {
    if (error instanceof RepositoryError) {
      return error;
    }

    // SQLiteエラーコードのマッピング
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return new DuplicateError(this.tableName, 'unknown', 'unknown');
    }

    return new RepositoryError(
      `${operation} failed in ${this.tableName}: ${error.message}`,
      'OPERATION_FAILED',
      error
    );
  }

  /**
   * WHERE条件構築のヘルパー
   */
  protected buildWhereClause(filters: TFilters): SQLWrapper | undefined {
    const conditions: SQLWrapper[] = [];

    // 検索条件
    if ('search' in filters && filters.search) {
      const searchConditions = this.buildSearchConditions(filters.search);
      if (searchConditions.length > 0) {
        conditions.push(or(...searchConditions));
      }
    }

    // カスタムフィルター条件を追加（子クラスでオーバーライド）
    const customConditions = this.buildCustomConditions(filters);
    if (customConditions) {
      conditions.push(customConditions);
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * 検索条件の構築（子クラスでオーバーライド）
   */
  protected buildSearchConditions(search: string): SQLWrapper[] {
    // デフォルトは空の配列（検索なし）
    return [];
  }

  /**
   * カスタムフィルター条件の構築（子クラスでオーバーライド）
   */
  protected buildCustomConditions(filters: TFilters): SQLWrapper | undefined {
    return undefined;
  }

  /**
   * ソート条件の構築
   */
  protected buildOrderByClause(sortBy?: string, sortOrder?: 'asc' | 'desc') {
    const column = sortBy || 'createdAt';
    const order = sortOrder || 'desc';
    
    if (!this.table[column]) {
      throw new ValidationError(`Invalid sort column: ${column}`, 'sortBy');
    }

    return order === 'asc' ? asc(this.table[column]) : desc(this.table[column]);
  }

  /**
   * バリデーション（子クラスでオーバーライド）
   */
  protected async validateCreate(data: TCreate): Promise<void> {
    // デフォルトは何もしない
  }

  protected async validateUpdate(id: string, data: TUpdate): Promise<void> {
    // デフォルトは何もしない
  }

  /**
   * 作成前処理（子クラスでオーバーライド）
   */
  protected async beforeCreate(data: TCreate): Promise<TCreate> {
    return {
      ...data,
      id: data.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as TCreate;
  }

  /**
   * 更新前処理（子クラスでオーバーライド）
   */
  protected async beforeUpdate(id: string, data: TUpdate): Promise<TUpdate> {
    return {
      ...data,
      updatedAt: new Date().toISOString(),
    } as TUpdate;
  }

  // ===== BaseRepository インターフェース実装 =====

  async create(data: TCreate): Promise<T> {
    try {
      await this.validateCreate(data);
      const processedData = await this.beforeCreate(data);

      const db = await this.getDb();
      const results = await db
        .insert(this.table)
        .values(processedData)
        .returning();

      const created = results[0] as T;
      if (!created) {
        throw new RepositoryError('Failed to create record', 'CREATE_FAILED');
      }

      return created;
    } catch (error) {
      throw this.wrapError(error, 'create');
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(eq(this.table[this.primaryKey as string], id))
        .limit(1);

      return results[0] as T || null;
    } catch (error) {
      throw this.wrapError(error, 'findById');
    }
  }

  async findAll(filters?: TFilters): Promise<ListResponse<T>> {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy,
        sortOrder,
        ...otherFilters
      } = filters || {} as TFilters;

      // 制限値の検証
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safePage = Math.max(1, page);
      const offset = (safePage - 1) * safeLimit;

      const whereClause = this.buildWhereClause(filters || {} as TFilters);
      const orderByClause = this.buildOrderByClause(sortBy, sortOrder);

      const db = await this.getDb();

      // データと件数を並行取得
      const [results, totalCount] = await Promise.all([
        db
          .select()
          .from(this.table)
          .where(whereClause)
          .orderBy(orderByClause)
          .limit(safeLimit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(this.table)
          .where(whereClause),
      ]);

      const total = totalCount[0]?.count || 0;
      const totalPages = Math.ceil(total / safeLimit);

      return {
        items: results as T[],
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
      };
    } catch (error) {
      throw this.wrapError(error, 'findAll');
    }
  }

  async update(id: string, data: TUpdate): Promise<T | null> {
    try {
      await this.validateUpdate(id, data);
      
      // 存在チェック
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError(this.tableName, id);
      }

      const processedData = await this.beforeUpdate(id, data);

      const db = await this.getDb();
      const results = await db
        .update(this.table)
        .set(processedData)
        .where(eq(this.table[this.primaryKey as string], id))
        .returning();

      return results[0] as T || null;
    } catch (error) {
      throw this.wrapError(error, 'update');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const db = await this.getDb();
      const results = await db
        .delete(this.table)
        .where(eq(this.table[this.primaryKey as string], id))
        .returning();

      return results.length > 0;
    } catch (error) {
      throw this.wrapError(error, 'delete');
    }
  }

  async createMany(data: TCreate[]): Promise<T[]> {
    try {
      if (data.length === 0) {
        return [];
      }

      // 全件のバリデーションと前処理
      const processedData = await Promise.all(
        data.map(async (item) => {
          await this.validateCreate(item);
          return await this.beforeCreate(item);
        })
      );

      const db = await this.getDb();
      const results = await db
        .insert(this.table)
        .values(processedData)
        .returning();

      return results as T[];
    } catch (error) {
      throw this.wrapError(error, 'createMany');
    }
  }

  async updateMany(ids: string[], data: TUpdate): Promise<T[]> {
    try {
      if (ids.length === 0) {
        return [];
      }

      // バッチ更新のためのバリデーション
      await Promise.all(
        ids.map(id => this.validateUpdate(id, data))
      );

      const processedData = await this.beforeUpdate('batch', data);

      const db = await this.getDb();
      const results = await db
        .update(this.table)
        .set(processedData)
        .where(or(...ids.map(id => eq(this.table[this.primaryKey as string], id))))
        .returning();

      return results as T[];
    } catch (error) {
      throw this.wrapError(error, 'updateMany');
    }
  }

  async deleteMany(ids: string[]): Promise<number> {
    try {
      if (ids.length === 0) {
        return 0;
      }

      const db = await this.getDb();
      const results = await db
        .delete(this.table)
        .where(or(...ids.map(id => eq(this.table[this.primaryKey as string], id))))
        .returning();

      return results.length;
    } catch (error) {
      throw this.wrapError(error, 'deleteMany');
    }
  }

  // ===== 追加のユーティリティメソッド =====

  async count(filters?: TFilters): Promise<number> {
    try {
      const whereClause = this.buildWhereClause(filters || {} as TFilters);
      
      const db = await this.getDb();
      const result = await db
        .select({ count: count() })
        .from(this.table)
        .where(whereClause);

      return result[0]?.count || 0;
    } catch (error) {
      throw this.wrapError(error, 'count');
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const db = await this.getDb();
      const result = await db
        .select({ count: count() })
        .from(this.table)
        .where(eq(this.table[this.primaryKey as string], id))
        .limit(1);

      return (result[0]?.count || 0) > 0;
    } catch (error) {
      throw this.wrapError(error, 'exists');
    }
  }

  async transaction<TResult>(
    callback: (tx: Database) => Promise<TResult>
  ): Promise<TResult> {
    try {
      const db = await this.getDb();
      return await db.transaction(callback);
    } catch (error) {
      throw this.wrapError(error, 'transaction');
    }
  }

  /**
   * カスタム条件による検索
   */
  async findByCondition(
    condition: SQLWrapper,
    options?: {
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<T[]> {
    try {
      const { limit = 100, sortBy, sortOrder } = options || {};
      const orderByClause = this.buildOrderByClause(sortBy, sortOrder);

      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(condition)
        .orderBy(orderByClause)
        .limit(Math.min(limit, 1000)); // 安全な上限

      return results as T[];
    } catch (error) {
      throw this.wrapError(error, 'findByCondition');
    }
  }
}