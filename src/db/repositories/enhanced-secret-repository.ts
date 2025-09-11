// 強化されたSecretRepository実装

import { eq, and, lt, like, or, sql, type SQLWrapper } from 'drizzle-orm';
import { EnhancedBaseRepository } from './enhanced-base-repository';
import { secrets } from '@/db/schema';
import type {
  Secret,
  CreateSecretRequest,
  UpdateSecretRequest,
  SecretFilters,
} from '@/types/mcp';
import type { SecretRepository as ISecretRepository } from '@/types/repository';
import { ValidationError, DuplicateError } from '@/types/repository';

export class EnhancedSecretRepository
  extends EnhancedBaseRepository<Secret, CreateSecretRequest, UpdateSecretRequest, SecretFilters>
  implements ISecretRepository
{
  protected tableName = 'secrets';
  protected table = secrets;
  protected primaryKey = 'id' as keyof Secret;

  /**
   * 検索条件の構築
   */
  protected buildSearchConditions(search: string): SQLWrapper[] {
    const searchTerm = `%${search}%`;
    return [
      like(this.table.name, searchTerm),
      like(this.table.description, searchTerm),
    ];
  }

  /**
   * カスタムフィルター条件の構築
   */
  protected buildCustomConditions(filters: SecretFilters): SQLWrapper | undefined {
    const conditions: SQLWrapper[] = [];

    // 有効期限によるフィルター
    if (filters.expired !== undefined) {
      const now = new Date().toISOString();
      if (filters.expired) {
        // 期限切れのもの
        conditions.push(
          and(
            sql`${this.table.expiresAt} IS NOT NULL`,
            lt(this.table.expiresAt, now)
          )
        );
      } else {
        // 有効なもの（期限なしまたは期限内）
        conditions.push(
          or(
            sql`${this.table.expiresAt} IS NULL`,
            sql`${this.table.expiresAt} > ${now}`
          )
        );
      }
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * 作成時のバリデーション
   */
  protected async validateCreate(data: CreateSecretRequest): Promise<void> {
    // 名前の重複チェック
    const existing = await this.findByName(data.name);
    if (existing) {
      throw new DuplicateError(this.tableName, 'name', data.name);
    }

    // 値の検証
    if (!data.value || data.value.trim().length === 0) {
      throw new ValidationError('Secret value cannot be empty', 'value');
    }

    // 有効期限の検証
    if (data.expiresAt) {
      const expiryDate = new Date(data.expiresAt);
      const now = new Date();
      if (expiryDate <= now) {
        throw new ValidationError('Expiry date must be in the future', 'expiresAt');
      }
    }
  }

  /**
   * 更新時のバリデーション
   */
  protected async validateUpdate(id: string, data: UpdateSecretRequest): Promise<void> {
    // 名前の重複チェック（自分以外）
    if (data.name) {
      const existing = await this.findByName(data.name);
      if (existing && existing.id !== id) {
        throw new DuplicateError(this.tableName, 'name', data.name);
      }
    }

    // 値の検証
    if (data.value !== undefined && (!data.value || data.value.trim().length === 0)) {
      throw new ValidationError('Secret value cannot be empty', 'value');
    }

    // 有効期限の検証
    if (data.expiresAt) {
      const expiryDate = new Date(data.expiresAt);
      const now = new Date();
      if (expiryDate <= now) {
        throw new ValidationError('Expiry date must be in the future', 'expiresAt');
      }
    }
  }

  /**
   * 作成前処理
   */
  protected async beforeCreate(data: CreateSecretRequest): Promise<CreateSecretRequest & { id: string; createdAt: string; updatedAt: string }> {
    const baseData = await super.beforeCreate(data);
    
    // 暗号化関連のフィールドを設定（実際の暗号化はサービス層で実行）
    return {
      ...baseData,
      iv: data.iv || '', // 暗号化サービスから設定される
      tag: data.tag || '', // 暗号化サービスから設定される
      keyVersion: data.keyVersion || 1,
    } as CreateSecretRequest & { id: string; createdAt: string; updatedAt: string };
  }

  // ===== ISecretRepository インターフェース実装 =====

  async findByName(name: string): Promise<Secret | null> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(eq(this.table.name, name))
        .limit(1);

      return results[0] as Secret || null;
    } catch (error) {
      throw this.wrapError(error, 'findByName');
    }
  }

  async findExpiredSecrets(): Promise<Secret[]> {
    try {
      const now = new Date().toISOString();
      const db = await this.getDb();
      
      const results = await db
        .select()
        .from(this.table)
        .where(
          and(
            sql`${this.table.expiresAt} IS NOT NULL`,
            lt(this.table.expiresAt, now)
          )
        )
        .orderBy(this.table.expiresAt);

      return results as Secret[];
    } catch (error) {
      throw this.wrapError(error, 'findExpiredSecrets');
    }
  }

  async findByKeyVersion(version: number): Promise<Secret[]> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(eq(this.table.keyVersion, version))
        .orderBy(this.table.createdAt);

      return results as Secret[];
    } catch (error) {
      throw this.wrapError(error, 'findByKeyVersion');
    }
  }

  async rotateKey(oldVersion: number, newVersion: number): Promise<number> {
    try {
      const db = await this.getDb();
      
      // キーローテーション処理（実際の再暗号化はサービス層で実行）
      const results = await db
        .update(this.table)
        .set({
          keyVersion: newVersion,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(this.table.keyVersion, oldVersion))
        .returning();

      return results.length;
    } catch (error) {
      throw this.wrapError(error, 'rotateKey');
    }
  }

  async cleanupExpired(): Promise<number> {
    try {
      const now = new Date().toISOString();
      const db = await this.getDb();
      
      const results = await db
        .delete(this.table)
        .where(
          and(
            sql`${this.table.expiresAt} IS NOT NULL`,
            lt(this.table.expiresAt, now)
          )
        )
        .returning();

      return results.length;
    } catch (error) {
      throw this.wrapError(error, 'cleanupExpired');
    }
  }

  // ===== 追加のユーティリティメソッド =====

  /**
   * 有効期限が近いシークレットを取得
   */
  async findExpiringSecrets(daysAhead: number = 7): Promise<Secret[]> {
    try {
      const future = new Date();
      future.setDate(future.getDate() + daysAhead);
      const futureIso = future.toISOString();
      const now = new Date().toISOString();

      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(
          and(
            sql`${this.table.expiresAt} IS NOT NULL`,
            sql`${this.table.expiresAt} > ${now}`,
            lt(this.table.expiresAt, futureIso)
          )
        )
        .orderBy(this.table.expiresAt);

      return results as Secret[];
    } catch (error) {
      throw this.wrapError(error, 'findExpiringSecrets');
    }
  }

  /**
   * キーバージョン別の統計を取得
   */
  async getKeyVersionStats(): Promise<{ version: number; count: number }[]> {
    try {
      const db = await this.getDb();
      const results = await db
        .select({
          version: this.table.keyVersion,
          count: sql<number>`count(*)`,
        })
        .from(this.table)
        .groupBy(this.table.keyVersion)
        .orderBy(this.table.keyVersion);

      return results.map(r => ({ version: r.version, count: Number(r.count) }));
    } catch (error) {
      throw this.wrapError(error, 'getKeyVersionStats');
    }
  }

  /**
   * メタデータによる検索
   */
  async findByMetadata(key: string, value?: any): Promise<Secret[]> {
    try {
      const db = await this.getDb();
      let condition: SQLWrapper;

      if (value !== undefined) {
        // 特定のキー・値ペアで検索
        condition = sql`json_extract(${this.table.metadata}, '$.${key}') = ${value}`;
      } else {
        // キーの存在のみで検索
        condition = sql`json_extract(${this.table.metadata}, '$.${key}') IS NOT NULL`;
      }

      const results = await db
        .select()
        .from(this.table)
        .where(condition)
        .orderBy(this.table.createdAt);

      return results as Secret[];
    } catch (error) {
      throw this.wrapError(error, 'findByMetadata');
    }
  }
}