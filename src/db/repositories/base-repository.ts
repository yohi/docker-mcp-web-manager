import { eq, and, or, sql, asc, desc, like, between } from 'drizzle-orm';
import { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import db from '../connection';
import { PaginatedResponse } from '../../types/models';

// =============================================================================
// Base Repository Class
// Provides common CRUD operations and query building utilities
// =============================================================================

export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  filters?: Record<string, any>;
  search?: string;
}

export interface WhereCondition {
  column: SQLiteColumn;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between';
  value: any;
}

export abstract class BaseRepository<TTable extends SQLiteTable, TRow, TModel> {
  constructor(
    protected table: TTable,
    protected primaryKey: keyof TRow,
    protected searchColumns: (keyof TRow)[] = []
  ) {}

  /**
   * データベースの行をモデルオブジェクトに変換する抽象メソッド
   */
  protected abstract mapRowToModel(row: TRow): TModel;

  /**
   * モデルオブジェクトをデータベースの行に変換する抽象メソッド
   */
  protected abstract mapModelToRow(model: Partial<TModel>): Partial<TRow>;

  /**
   * IDによる単一レコード取得
   */
  async findById(id: string): Promise<TModel | null> {
    try {
      const rows = await db
        .select()
        .from(this.table)
        .where(eq(this.table[this.primaryKey as string], id))
        .limit(1)
        .execute();

      return rows.length > 0 ? this.mapRowToModel(rows[0] as TRow) : null;
    } catch (error) {
      console.error(`Error finding ${this.table} by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 全レコード取得（ページネーション対応）
   */
  async findAll(options: QueryOptions = {}): Promise<PaginatedResponse<TModel>> {
    const { page = 1, limit = 20, sort, order = 'asc', filters, search } = options;
    const offset = (page - 1) * limit;

    try {
      // WHERE条件の構築
      const whereConditions = this.buildWhereConditions(filters, search);
      
      // ORDER BY条件の構築
      const orderByConditions = this.buildOrderByConditions(sort, order);

      // データ取得クエリ
      let query = db.select().from(this.table);
      
      if (whereConditions.length > 0) {
        query = query.where(and(...whereConditions));
      }
      
      if (orderByConditions.length > 0) {
        query = query.orderBy(...orderByConditions);
      }

      const rows = await query.limit(limit).offset(offset).execute();

      // 総件数取得クエリ
      let countQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(this.table);
      
      if (whereConditions.length > 0) {
        countQuery = countQuery.where(and(...whereConditions));
      }

      const [{ count: total }] = await countQuery.execute();

      return {
        data: rows.map((row) => this.mapRowToModel(row as TRow)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error(`Error finding all ${this.table}:`, error);
      throw error;
    }
  }

  /**
   * 新しいレコードの作成
   */
  async create(model: Partial<TModel>): Promise<TModel> {
    try {
      const row = this.mapModelToRow(model);
      const [insertedRow] = await db
        .insert(this.table)
        .values(row)
        .returning()
        .execute();

      return this.mapRowToModel(insertedRow as TRow);
    } catch (error) {
      console.error(`Error creating ${this.table}:`, error);
      throw error;
    }
  }

  /**
   * 既存レコードの更新
   */
  async update(id: string, model: Partial<TModel>): Promise<TModel | null> {
    try {
      const row = this.mapModelToRow(model);
      // updatedAtフィールドがある場合は自動更新
      if ('updatedAt' in row) {
        row.updatedAt = new Date().toISOString() as any;
      }

      const [updatedRow] = await db
        .update(this.table)
        .set(row)
        .where(eq(this.table[this.primaryKey as string], id))
        .returning()
        .execute();

      return updatedRow ? this.mapRowToModel(updatedRow as TRow) : null;
    } catch (error) {
      console.error(`Error updating ${this.table} with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * レコードの削除
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(this.table)
        .where(eq(this.table[this.primaryKey as string], id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error deleting ${this.table} with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * レコードの存在チェック
   */
  async exists(id: string): Promise<boolean> {
    try {
      const rows = await db
        .select({ id: this.table[this.primaryKey as string] })
        .from(this.table)
        .where(eq(this.table[this.primaryKey as string], id))
        .limit(1)
        .execute();

      return rows.length > 0;
    } catch (error) {
      console.error(`Error checking existence of ${this.table} with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * カスタム条件での検索
   */
  async findWhere(conditions: WhereCondition[]): Promise<TModel[]> {
    try {
      const whereClause = conditions.map((condition) => {
        switch (condition.operator) {
          case 'eq':
            return eq(condition.column, condition.value);
          case 'ne':
            return sql`${condition.column} != ${condition.value}`;
          case 'gt':
            return sql`${condition.column} > ${condition.value}`;
          case 'gte':
            return sql`${condition.column} >= ${condition.value}`;
          case 'lt':
            return sql`${condition.column} < ${condition.value}`;
          case 'lte':
            return sql`${condition.column} <= ${condition.value}`;
          case 'like':
            return like(condition.column, condition.value);
          case 'in':
            return sql`${condition.column} IN ${condition.value}`;
          case 'between':
            return between(condition.column, condition.value[0], condition.value[1]);
          default:
            throw new Error(`Unsupported operator: ${condition.operator}`);
        }
      });

      const rows = await db
        .select()
        .from(this.table)
        .where(and(...whereClause))
        .execute();

      return rows.map((row) => this.mapRowToModel(row as TRow));
    } catch (error) {
      console.error(`Error finding ${this.table} with custom conditions:`, error);
      throw error;
    }
  }

  /**
   * WHERE条件の構築
   */
  protected buildWhereConditions(filters?: Record<string, any>, search?: string): any[] {
    const conditions = [];

    // フィルター条件の処理
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && key in this.table) {
          if (Array.isArray(value)) {
            conditions.push(sql`${this.table[key]} IN ${value}`);
          } else {
            conditions.push(eq(this.table[key], value));
          }
        }
      }
    }

    // 検索条件の処理
    if (search && this.searchColumns.length > 0) {
      const searchConditions = this.searchColumns.map((column) =>
        like(this.table[column as string], `%${search}%`)
      );
      conditions.push(or(...searchConditions));
    }

    return conditions;
  }

  /**
   * ORDER BY条件の構築
   */
  protected buildOrderByConditions(sort?: string, order: 'asc' | 'desc' = 'asc'): any[] {
    if (!sort || !(sort in this.table)) {
      // デフォルトソート（作成日時の降順）
      if ('createdAt' in this.table) {
        return [desc(this.table.createdAt)];
      }
      return [];
    }

    const column = this.table[sort];
    return [order === 'asc' ? asc(column) : desc(column)];
  }

  /**
   * トランザクション実行のヘルパーメソッド
   */
  protected async transaction<T>(
    callback: (tx: typeof db) => Promise<T>
  ): Promise<T> {
    return db.transaction(callback);
  }

  /**
   * JSONフィールドの安全なパース
   */
  protected safeParseJson<T>(jsonString?: string | null, defaultValue: T = {} as T): T {
    if (!jsonString) return defaultValue;
    
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      console.warn('Failed to parse JSON:', jsonString, error);
      return defaultValue;
    }
  }

  /**
   * JSONフィールドの安全な文字列化
   */
  protected safeStringifyJson(obj: any): string | null {
    if (obj === null || obj === undefined) return null;
    
    try {
      return JSON.stringify(obj);
    } catch (error) {
      console.warn('Failed to stringify JSON:', obj, error);
      return null;
    }
  }

  /**
   * 日付文字列をDateオブジェクトに変換
   */
  protected parseDate(dateString?: string | null): Date {
    if (!dateString) return new Date();
    return new Date(dateString);
  }

  /**
   * UUIDの生成
   */
  protected generateId(): string {
    return crypto.randomUUID();
  }
}