// 強化されたToolRepository実装

import { eq, and, like, inArray, or, sql, type SQLWrapper } from 'drizzle-orm';
import { EnhancedBaseRepository } from './enhanced-base-repository';
import { tools } from '@/db/schema';
import type {
  Tool,
  CreateToolRequest,
  UpdateToolRequest,
  ToolFilters,
} from '@/types/mcp';
import type { ToolRepository as IToolRepository } from '@/types/repository';
import { ValidationError, DuplicateError } from '@/types/repository';

export class EnhancedToolRepository
  extends EnhancedBaseRepository<Tool, CreateToolRequest, UpdateToolRequest, ToolFilters>
  implements IToolRepository
{
  protected tableName = 'tools';
  protected table = tools;
  protected primaryKey = 'id' as keyof Tool;

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
  protected buildCustomConditions(filters: ToolFilters): SQLWrapper | undefined {
    const conditions: SQLWrapper[] = [];

    // サーバーIDフィルター
    if (filters.serverId) {
      conditions.push(eq(this.table.serverId, filters.serverId));
    }

    // 有効/無効フィルター
    if (filters.enabled !== undefined) {
      conditions.push(eq(this.table.enabled, filters.enabled));
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * 作成時のバリデーション
   */
  protected async validateCreate(data: CreateToolRequest): Promise<void> {
    // サーバー内でのツール名重複チェック
    const existing = await this.findByName(data.serverId, data.name);
    if (existing) {
      throw new DuplicateError(this.tableName, 'name', `${data.serverId}:${data.name}`);
    }

    // 入力スキーマの検証
    if (!data.inputSchema || typeof data.inputSchema !== 'object') {
      throw new ValidationError('Input schema is required and must be a valid JSON schema', 'inputSchema');
    }

    // 出力スキーマの検証（オプション）
    if (data.outputSchema && typeof data.outputSchema !== 'object') {
      throw new ValidationError('Output schema must be a valid JSON schema', 'outputSchema');
    }
  }

  /**
   * 更新時のバリデーション
   */
  protected async validateUpdate(id: string, data: UpdateToolRequest): Promise<void> {
    // 現在のレコードを取得
    const current = await this.findById(id);
    if (!current) {
      return; // エラーは上位で処理される
    }

    // ツール名重複チェック（自分以外）
    if (data.name) {
      const existing = await this.findByName(current.serverId, data.name);
      if (existing && existing.id !== id) {
        throw new DuplicateError(this.tableName, 'name', `${current.serverId}:${data.name}`);
      }
    }

    // スキーマの検証
    if (data.inputSchema && typeof data.inputSchema !== 'object') {
      throw new ValidationError('Input schema must be a valid JSON schema', 'inputSchema');
    }

    if (data.outputSchema && typeof data.outputSchema !== 'object') {
      throw new ValidationError('Output schema must be a valid JSON schema', 'outputSchema');
    }
  }

  // ===== IToolRepository インターフェース実装 =====

  async findByServerId(serverId: string): Promise<Tool[]> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(eq(this.table.serverId, serverId))
        .orderBy(this.table.name);

      return results as Tool[];
    } catch (error) {
      throw this.wrapError(error, 'findByServerId');
    }
  }

  async findByName(serverId: string, name: string): Promise<Tool | null> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(
          and(
            eq(this.table.serverId, serverId),
            eq(this.table.name, name)
          )
        )
        .limit(1);

      return results[0] as Tool || null;
    } catch (error) {
      throw this.wrapError(error, 'findByName');
    }
  }

  async findEnabledByServerId(serverId: string): Promise<Tool[]> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(
          and(
            eq(this.table.serverId, serverId),
            eq(this.table.enabled, true)
          )
        )
        .orderBy(this.table.name);

      return results as Tool[];
    } catch (error) {
      throw this.wrapError(error, 'findEnabledByServerId');
    }
  }

  async enableByIds(ids: string[]): Promise<number> {
    try {
      if (ids.length === 0) {
        return 0;
      }

      const db = await this.getDb();
      const results = await db
        .update(this.table)
        .set({
          enabled: true,
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(this.table.id, ids))
        .returning();

      return results.length;
    } catch (error) {
      throw this.wrapError(error, 'enableByIds');
    }
  }

  async disableByIds(ids: string[]): Promise<number> {
    try {
      if (ids.length === 0) {
        return 0;
      }

      const db = await this.getDb();
      const results = await db
        .update(this.table)
        .set({
          enabled: false,
          updatedAt: new Date().toISOString(),
        })
        .where(inArray(this.table.id, ids))
        .returning();

      return results.length;
    } catch (error) {
      throw this.wrapError(error, 'disableByIds');
    }
  }

  async deleteByServerId(serverId: string): Promise<number> {
    try {
      const db = await this.getDb();
      const results = await db
        .delete(this.table)
        .where(eq(this.table.serverId, serverId))
        .returning();

      return results.length;
    } catch (error) {
      throw this.wrapError(error, 'deleteByServerId');
    }
  }

  // ===== 追加のユーティリティメソッド =====

  /**
   * サーバー別の有効/無効ツール数を取得
   */
  async getEnabledDisabledCounts(serverId: string): Promise<{ enabled: number; disabled: number }> {
    try {
      const db = await this.getDb();
      const results = await db
        .select({
          enabled: this.table.enabled,
          count: sql<number>`count(*)`,
        })
        .from(this.table)
        .where(eq(this.table.serverId, serverId))
        .groupBy(this.table.enabled);

      let enabledCount = 0;
      let disabledCount = 0;

      for (const result of results) {
        if (result.enabled) {
          enabledCount = Number(result.count);
        } else {
          disabledCount = Number(result.count);
        }
      }

      return { enabled: enabledCount, disabled: disabledCount };
    } catch (error) {
      throw this.wrapError(error, 'getEnabledDisabledCounts');
    }
  }

  /**
   * 入力スキーマに特定のプロパティを持つツールを検索
   */
  async findByInputSchemaProperty(property: string): Promise<Tool[]> {
    try {
      const db = await this.getDb();
      const results = await db
        .select()
        .from(this.table)
        .where(
          sql`json_extract(${this.table.inputSchema}, '$.properties.${property}') IS NOT NULL`
        )
        .orderBy(this.table.name);

      return results as Tool[];
    } catch (error) {
      throw this.wrapError(error, 'findByInputSchemaProperty');
    }
  }

  /**
   * メタデータによる検索
   */
  async findByMetadata(key: string, value?: any): Promise<Tool[]> {
    try {
      const db = await this.getDb();
      let condition: SQLWrapper;

      if (value !== undefined) {
        condition = sql`json_extract(${this.table.metadata}, '$.${key}') = ${value}`;
      } else {
        condition = sql`json_extract(${this.table.metadata}, '$.${key}') IS NOT NULL`;
      }

      const results = await db
        .select()
        .from(this.table)
        .where(condition)
        .orderBy(this.table.name);

      return results as Tool[];
    } catch (error) {
      throw this.wrapError(error, 'findByMetadata');
    }
  }

  /**
   * ツールの依存関係をチェック
   */
  async checkDependencies(toolId: string): Promise<{ dependentTools: Tool[]; dependsOnTools: Tool[] }> {
    try {
      // 簡単な実装：メタデータのdependencies配列を使用
      const tool = await this.findById(toolId);
      if (!tool) {
        return { dependentTools: [], dependsOnTools: [] };
      }

      const db = await this.getDb();

      // このツールに依存するツール
      const dependentTools = await db
        .select()
        .from(this.table)
        .where(
          and(
            eq(this.table.serverId, tool.serverId),
            sql`json_extract(${this.table.metadata}, '$.dependencies') LIKE '%${toolId}%'`
          )
        );

      // このツールが依存するツール
      let dependsOnTools: Tool[] = [];
      if (tool.metadata?.dependencies && Array.isArray(tool.metadata.dependencies)) {
        const dependencyIds = tool.metadata.dependencies as string[];
        if (dependencyIds.length > 0) {
          dependsOnTools = await db
            .select()
            .from(this.table)
            .where(inArray(this.table.id, dependencyIds));
        }
      }

      return {
        dependentTools: dependentTools as Tool[],
        dependsOnTools: dependsOnTools as Tool[],
      };
    } catch (error) {
      throw this.wrapError(error, 'checkDependencies');
    }
  }

  /**
   * バルク有効化（依存関係を考慮）
   */
  async enableWithDependencies(toolIds: string[]): Promise<{ enabled: Tool[]; skipped: string[] }> {
    try {
      const enabled: Tool[] = [];
      const skipped: string[] = [];

      // トランザクション内で依存関係を考慮して有効化
      await this.transaction(async (tx) => {
        for (const toolId of toolIds) {
          const tool = await this.findById(toolId);
          if (!tool) {
            skipped.push(toolId);
            continue;
          }

          // 依存関係チェック
          const { dependsOnTools } = await this.checkDependencies(toolId);
          const disabledDependencies = dependsOnTools.filter(dep => !dep.enabled);

          if (disabledDependencies.length > 0) {
            skipped.push(toolId);
            continue;
          }

          // 有効化
          const updated = await this.update(toolId, { enabled: true });
          if (updated) {
            enabled.push(updated);
          }
        }
      });

      return { enabled, skipped };
    } catch (error) {
      throw this.wrapError(error, 'enableWithDependencies');
    }
  }
}