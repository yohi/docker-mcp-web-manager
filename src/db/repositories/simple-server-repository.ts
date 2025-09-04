import { eq, like, and, or, inArray } from 'drizzle-orm';
import { getDatabase } from '../connection';
import { servers, configurations, tools, resources, prompts } from '../schema';
import type {
  Server,
  NewServer,
  ServerWithDetails,
} from '../../types/database';

/**
 * シンプルなサーバーリポジトリ（型安全）
 */
export class SimpleServerRepository {
  private db = getDatabase();

  /**
   * IDでサーバーを取得
   */
  async findById(id: string): Promise<Server | null> {
    const results = await this.db
      .select()
      .from(servers)
      .where(eq(servers.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * 全サーバーを取得
   */
  async findAll(): Promise<Server[]> {
    return await this.db.select().from(servers);
  }

  /**
   * サーバーを作成
   */
  async create(data: NewServer): Promise<Server> {
    const results = await this.db
      .insert(servers)
      .values(data)
      .returning();

    return results[0];
  }

  /**
   * サーバーを更新
   */
  async update(id: string, data: Partial<NewServer>): Promise<Server | null> {
    const results = await this.db
      .update(servers)
      .set(data)
      .where(eq(servers.id, id))
      .returning();

    return results[0] || null;
  }

  /**
   * サーバーを削除
   */
  async delete(id: string): Promise<boolean> {
    const results = await this.db
      .delete(servers)
      .where(eq(servers.id, id))
      .returning();

    return results.length > 0;
  }

  /**
   * 名前でサーバーを検索
   */
  async findByName(name: string): Promise<Server | null> {
    const results = await this.db
      .select()
      .from(servers)
      .where(eq(servers.name, name))
      .limit(1);

    return results[0] || null;
  }

  /**
   * ステータスでサーバーを検索
   */
  async findByStatus(
    status: 'running' | 'stopped' | 'error',
  ): Promise<Server[]> {
    return await this.db
      .select()
      .from(servers)
      .where(eq(servers.status, status));
  }

  /**
   * サーバー詳細情報を取得（関連データを含む）
   */
  async findByIdWithDetails(id: string): Promise<ServerWithDetails | null> {
    const server = await this.findById(id);
    if (!server) {
      return null;
    }

    const [configuration, serverTools, serverResources, serverPrompts] =
      await Promise.all([
        this.db
          .select()
          .from(configurations)
          .where(eq(configurations.serverId, id))
          .limit(1),
        this.db
          .select()
          .from(tools)
          .where(eq(tools.serverId, id)),
        this.db
          .select()
          .from(resources)
          .where(eq(resources.serverId, id)),
        this.db
          .select()
          .from(prompts)
          .where(eq(prompts.serverId, id)),
      ]);

    return {
      ...server,
      configuration: configuration[0] || undefined,
      tools: serverTools,
      resources: serverResources,
      prompts: serverPrompts,
    };
  }

  /**
   * サーバー名での部分一致検索
   */
  async searchByName(searchTerm: string): Promise<Server[]> {
    return await this.db
      .select()
      .from(servers)
      .where(like(servers.name, `%${searchTerm}%`));
  }

  /**
   * 複合検索
   */
  async search(
    searchTerm: string,
    status?: 'running' | 'stopped' | 'error',
  ): Promise<Server[]> {
    let whereCondition = or(
      like(servers.name, `%${searchTerm}%`),
      like(servers.description, `%${searchTerm}%`),
    );

    if (status) {
      whereCondition = and(whereCondition, eq(servers.status, status));
    }

    return await this.db
      .select()
      .from(servers)
      .where(whereCondition);
  }
}