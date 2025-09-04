import type { PaginationMeta, PaginatedResponse } from '../../types/database';
import { getDatabase } from '../connection';
import { eq, asc, desc, sql, count } from 'drizzle-orm';

// データベース型の統合
type Database = ReturnType<typeof getDatabase>;

/**
 * 基底リポジトリクラス
 * 共通のCRUD操作とページネーション機能を提供
 */
export abstract class BaseRepository<T, TInsert> {
  protected db: Database;
  protected abstract tableName: string;
  protected abstract table: any;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * IDによる単一レコード取得
   */
  async findById(id: string): Promise<T | null> {
    try {
      const results = await this.db
        .select()
        .from(this.table)
        .where(eq(this.table.id, id))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      throw new Error(`Failed to find ${this.tableName} by id: ${error}`);
    }
  }

  /**
   * 全レコード取得（ページネーション対応）
   */
  async findAll(options?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    where?: any;
  }): Promise<PaginatedResponse<T>> {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        where,
      } = options || {};

      const offset = (page - 1) * limit;

      // ソート設定
      const orderByClause =
        sortOrder === 'asc' ? asc(this.table[sortBy]) : desc(this.table[sortBy]);

      // 基本クエリ
      let query = this.db.select().from(this.table);
      let countQuery = this.db.select({ count: count() }).from(this.table);

      // WHERE条件を適用
      if (where) {
        query = query.where(where);
        countQuery = countQuery.where(where);
      }

      // ページネーションとソート
      query = query.orderBy(orderByClause).limit(limit).offset(offset);

      // 並行実行で件数とデータを取得
      const [results, totalCount] = await Promise.all([
        query,
        countQuery,
      ]);

      const total = totalCount[0]?.count || 0;
      const totalPages = Math.ceil(total / limit);

      const meta: PaginationMeta = {
        page,
        limit,
        total,
        totalPages,
      };

      return {
        data: results as T[],
        meta,
      };
    } catch (error) {
      throw new Error(`Failed to find all ${this.tableName}: ${error}`);
    }
  }

  /**
   * 新規レコード作成
   */
  async create(data: TInsert): Promise<T> {
    try {
      const results = await this.db
        .insert(this.table)
        .values(data)
        .returning();

      return results[0] as T;
    } catch (error) {
      throw new Error(`Failed to create ${this.tableName}: ${error}`);
    }
  }

  /**
   * レコード更新
   */
  async update(id: string, data: Partial<TInsert>): Promise<T | null> {
    try {
      const results = await this.db
        .update(this.table)
        .set({
          ...data,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(this.table.id, id))
        .returning();

      return results[0] || null;
    } catch (error) {
      throw new Error(`Failed to update ${this.tableName}: ${error}`);
    }
  }

  /**
   * レコード削除
   */
  async delete(id: string): Promise<boolean> {
    try {
      const results = await this.db
        .delete(this.table)
        .where(eq(this.table.id, id))
        .returning();

      return results.length > 0;
    } catch (error) {
      throw new Error(`Failed to delete ${this.tableName}: ${error}`);
    }
  }

  /**
   * 条件による検索
   */
  async findByCondition(
    condition: any,
    options?: {
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<T[]> {
    try {
      const { limit = 100, sortBy = 'createdAt', sortOrder = 'desc' } =
        options || {};

      const orderByClause =
        sortOrder === 'asc' ? asc(this.table[sortBy]) : desc(this.table[sortBy]);

      const results = await this.db
        .select()
        .from(this.table)
        .where(condition)
        .orderBy(orderByClause)
        .limit(limit);

      return results as T[];
    } catch (error) {
      throw new Error(
        `Failed to find ${this.tableName} by condition: ${error}`,
      );
    }
  }

  /**
   * レコード数をカウント
   */
  async count(condition?: any): Promise<number> {
    try {
      let query = this.db.select({ count: count() }).from(this.table);

      if (condition) {
        query = query.where(condition);
      }

      const result = await query;
      return result[0]?.count || 0;
    } catch (error) {
      throw new Error(`Failed to count ${this.tableName}: ${error}`);
    }
  }

  /**
   * レコードが存在するかチェック
   */
  async exists(condition: any): Promise<boolean> {
    try {
      const result = await this.db
        .select({ count: count() })
        .from(this.table)
        .where(condition);

      return (result[0]?.count || 0) > 0;
    } catch (error) {
      throw new Error(`Failed to check if ${this.tableName} exists: ${error}`);
    }
  }

  /**
   * バッチ挿入
   */
  async createMany(data: TInsert[]): Promise<T[]> {
    try {
      if (data.length === 0) {
        return [];
      }

      const results = await this.db
        .insert(this.table)
        .values(data)
        .returning();

      return results as T[];
    } catch (error) {
      throw new Error(`Failed to create many ${this.tableName}: ${error}`);
    }
  }

  /**
   * トランザクション実行
   */
  async transaction<TResult>(
    callback: (tx: Database) => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await this.db.transaction(callback);
    } catch (error) {
      throw new Error(`Transaction failed in ${this.tableName}: ${error}`);
    }
  }
}