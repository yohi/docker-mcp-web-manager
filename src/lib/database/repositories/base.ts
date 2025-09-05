/**
 * 基底リポジトリクラス
 * 共通のデータベース操作とエラーハンドリングを提供
 */

import { Database } from 'better-sqlite3';
import { DatabaseConnection } from '../connection';
import { BaseEntity, PaginatedResult, QueryOptions, DatabaseResult, SearchFilter, SortOption, ValidationResult } from '@/types/database';
import { Result } from '@/types/common';

/**
 * 基底リポジトリクラス
 */
export abstract class BaseRepository<T extends BaseEntity, TCreate, TUpdate> {
  protected db: Database;
  protected tableName: string;

  constructor(tableName: string) {
    this.db = DatabaseConnection.getInstance().getDatabase();
    this.tableName = tableName;
  }

  /**
   * IDによる単一レコード取得
   */
  async findById(id: string): Promise<Result<T | null, Error>> {
    try {
      const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
      const row = stmt.get(id);
      
      if (!row) {
        return { success: true, data: null };
      }

      const entity = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: entity };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 全レコード取得（ページネーション対応）
   */
  async findAll(options: QueryOptions = {}): Promise<Result<PaginatedResult<T>, Error>> {
    try {
      const { page = 1, limit = 50, filter, sort } = options;
      const offset = (page - 1) * limit;

      // WHERE句とORDER BY句の構築
      const { whereClause, whereParams } = this.buildWhereClause(filter);
      const orderByClause = this.buildOrderByClause(sort);

      // カウントクエリ
      const countSql = `SELECT COUNT(*) as total FROM ${this.tableName}${whereClause}`;
      const countStmt = this.db.prepare(countSql);
      const { total } = countStmt.get(whereParams) as { total: number };

      // データ取得クエリ
      const dataSql = `SELECT * FROM ${this.tableName}${whereClause}${orderByClause} LIMIT ? OFFSET ?`;
      const dataStmt = this.db.prepare(dataSql);
      const rows = dataStmt.all([...whereParams, limit, offset]) as Record<string, unknown>[];

      const data = rows.map(row => this.mapRowToEntity(row));

      const totalPages = Math.ceil(total / limit);
      const pagination = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      };

      return {
        success: true,
        data: { data, pagination }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 条件による検索
   */
  async findWhere(filter: SearchFilter, options: QueryOptions = {}): Promise<Result<T[], Error>> {
    try {
      const { sort } = options;
      const { whereClause, whereParams } = this.buildWhereClause(filter);
      const orderByClause = this.buildOrderByClause(sort);

      const sql = `SELECT * FROM ${this.tableName}${whereClause}${orderByClause}`;
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(whereParams) as Record<string, unknown>[];

      const data = rows.map(row => this.mapRowToEntity(row));
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * レコード作成
   */
  async create(input: TCreate): Promise<Result<T, Error>> {
    try {
      const validationResult = this.validateCreate(input);
      if (!validationResult.valid) {
        return {
          success: false,
          error: new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`)
        };
      }

      const entity = this.createEntityFromInput(input);
      const { sql, params } = this.buildInsertQuery(entity);

      const stmt = this.db.prepare(sql);
      const result = stmt.run(params);

      // 作成されたレコードを取得
      const createdResult = await this.findById(entity.id);
      if (!createdResult.success || !createdResult.data) {
        return {
          success: false,
          error: new Error('Failed to retrieve created record')
        };
      }

      return { success: true, data: createdResult.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * レコード更新
   */
  async update(id: string, input: TUpdate): Promise<Result<T, Error>> {
    try {
      // 既存レコードの確認
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return existingResult;
      }
      if (!existingResult.data) {
        return {
          success: false,
          error: new Error('Record not found')
        };
      }

      const validationResult = this.validateUpdate(input);
      if (!validationResult.valid) {
        return {
          success: false,
          error: new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`)
        };
      }

      const { sql, params } = this.buildUpdateQuery(id, input);
      const stmt = this.db.prepare(sql);
      stmt.run(params);

      // 更新されたレコードを取得
      const updatedResult = await this.findById(id);
      if (!updatedResult.success || !updatedResult.data) {
        return {
          success: false,
          error: new Error('Failed to retrieve updated record')
        };
      }

      return { success: true, data: updatedResult.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * レコード削除
   */
  async delete(id: string): Promise<Result<boolean, Error>> {
    try {
      // 既存レコードの確認
      const existingResult = await this.findById(id);
      if (!existingResult.success) {
        return { success: false, error: existingResult.error };
      }
      if (!existingResult.data) {
        return {
          success: false,
          error: new Error('Record not found')
        };
      }

      const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
      const result = stmt.run(id);

      return { success: true, data: result.changes > 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * レコード数取得
   */
  async count(filter?: SearchFilter): Promise<Result<number, Error>> {
    try {
      const { whereClause, whereParams } = this.buildWhereClause(filter);
      const sql = `SELECT COUNT(*) as total FROM ${this.tableName}${whereClause}`;
      const stmt = this.db.prepare(sql);
      const { total } = stmt.get(whereParams) as { total: number };

      return { success: true, data: total };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 存在チェック
   */
  async exists(id: string): Promise<Result<boolean, Error>> {
    try {
      const stmt = this.db.prepare(`SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`);
      const row = stmt.get(id);
      return { success: true, data: row !== undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * トランザクション実行
   */
  protected transaction<R>(fn: (db: Database) => R): Result<R, Error> {
    const tx = this.db.transaction(fn);
    try {
      const result = tx();
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  // 抽象メソッド - 子クラスで実装
  protected abstract mapRowToEntity(row: Record<string, unknown>): T;
  protected abstract createEntityFromInput(input: TCreate): T;
  protected abstract validateCreate(input: TCreate): ValidationResult;
  protected abstract validateUpdate(input: TUpdate): ValidationResult;

  // ヘルパーメソッド
  private buildWhereClause(filter?: SearchFilter): { whereClause: string; whereParams: unknown[] } {
    if (!filter || Object.keys(filter).length === 0) {
      return { whereClause: '', whereParams: [] };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null) continue;

      switch (key) {
        case 'query':
          // 汎用検索（実装は子クラスでオーバーライド可能）
          conditions.push('(name LIKE ? OR description LIKE ?)');
          params.push(`%${value}%`, `%${value}%`);
          break;
        case 'status':
          if (Array.isArray(value)) {
            conditions.push(`status IN (${value.map(() => '?').join(', ')})`);
            params.push(...value);
          } else {
            conditions.push('status = ?');
            params.push(value);
          }
          break;
        case 'dateFrom':
          conditions.push('created_at >= ?');
          params.push(value);
          break;
        case 'dateTo':
          conditions.push('created_at <= ?');
          params.push(value);
          break;
        case 'createdBy':
          conditions.push('created_by = ?');
          params.push(value);
          break;
        default:
          // その他のフィールド
          conditions.push(`${key} = ?`);
          params.push(value);
          break;
      }
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, whereParams: params };
  }

  private buildOrderByClause(sort?: SortOption): string {
    if (!sort) {
      return ' ORDER BY created_at DESC';
    }
    return ` ORDER BY ${sort.field} ${sort.direction.toUpperCase()}`;
  }

  private buildInsertQuery(entity: T): { sql: string; params: unknown[] } {
    const fields = Object.keys(entity);
    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    const params = Object.values(entity);
    return { sql, params };
  }

  private buildUpdateQuery(id: string, input: TUpdate): { sql: string; params: unknown[] } {
    const fields = Object.keys(input as object).filter(key => (input as any)[key] !== undefined);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;
    const params = [...fields.map(field => (input as any)[field]), id];
    return { sql, params };
  }

  /**
   * 現在時刻のISO文字列を取得
   */
  protected getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * UUIDv4生成
   */
  protected generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}