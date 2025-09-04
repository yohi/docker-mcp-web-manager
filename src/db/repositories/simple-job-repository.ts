import { eq, and, lt, inArray } from 'drizzle-orm';
import { getDatabase } from '../connection';
import { jobs, idempotencyKeys } from '../schema';
import type {
  Job,
  NewJob,
  IdempotencyKey,
  NewIdempotencyKey,
} from '../../types/database';

/**
 * シンプルなジョブリポジトリ（型安全）
 */
export class SimpleJobRepository {
  private db = getDatabase();

  /**
   * IDでジョブを取得
   */
  async findById(id: string): Promise<Job | null> {
    const results = await this.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * 全ジョブを取得
   */
  async findAll(): Promise<Job[]> {
    return await this.db.select().from(jobs);
  }

  /**
   * ジョブを作成
   */
  async create(data: NewJob): Promise<Job> {
    const results = await this.db
      .insert(jobs)
      .values(data)
      .returning();

    return results[0];
  }

  /**
   * ジョブを更新
   */
  async update(id: string, data: Partial<NewJob>): Promise<Job | null> {
    const results = await this.db
      .update(jobs)
      .set(data)
      .where(eq(jobs.id, id))
      .returning();

    return results[0] || null;
  }

  /**
   * 実行中のジョブを検索
   */
  async findInProgressJobs(): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .where(inArray(jobs.status, ['pending', 'running']));
  }

  /**
   * ターゲットとタイプでジョブを検索
   */
  async findByTargetAndType(
    targetType: 'server' | 'catalog' | 'gateway',
    targetId: string,
    jobType: 'install' | 'start' | 'stop' | 'test' | 'enable' | 'disable' | 'delete',
  ): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.targetType, targetType),
          eq(jobs.targetId, targetId),
          eq(jobs.type, jobType),
        ),
      );
  }

  /**
   * 特定ターゲットの実行中ジョブを検索
   */
  async findInProgressJobsByTarget(
    targetType: 'server' | 'catalog' | 'gateway',
    targetId: string,
  ): Promise<Job[]> {
    return await this.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.targetType, targetType),
          eq(jobs.targetId, targetId),
          inArray(jobs.status, ['pending', 'running']),
        ),
      );
  }

  /**
   * ジョブステータスを更新
   */
  async updateStatus(
    id: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    options?: {
      result?: string;
      errorCode?: string;
      errorMessage?: string;
      errorDetails?: string;
      progressCurrent?: number;
      progressMessage?: string;
    },
  ): Promise<Job | null> {
    const updateData: Partial<NewJob> = {
      status,
      ...options,
    };

    // 完了・失敗・キャンセル時は完了時刻を設定
    if (['completed', 'failed', 'cancelled'].includes(status)) {
      updateData.completedAt = new Date().toISOString();
    }

    return await this.update(id, updateData);
  }

  /**
   * 古いジョブを削除
   */
  async deleteOldJobs(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const results = await this.db
      .delete(jobs)
      .where(lt(jobs.createdAt, cutoffDate.toISOString()))
      .returning();

    return results.length;
  }

  /**
   * 冪等性キーを作成
   */
  async createIdempotencyKey(
    key: string,
    scope: string,
    requestHash: string,
    jobId: string,
    expiresInHours: number = 24,
  ): Promise<IdempotencyKey> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const idempotencyKey: NewIdempotencyKey = {
      key,
      scope,
      requestHash,
      jobId,
      expiresAt: expiresAt.toISOString(),
    };

    const results = await this.db
      .insert(idempotencyKeys)
      .values(idempotencyKey)
      .returning();

    return results[0];
  }

  /**
   * 冪等性キーでジョブIDを検索
   */
  async findJobByIdempotencyKey(
    key: string,
    scope: string,
  ): Promise<{ jobId: string; requestHash: string } | null> {
    const results = await this.db
      .select({
        jobId: idempotencyKeys.jobId,
        requestHash: idempotencyKeys.requestHash,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.scope, scope),
        ),
      )
      .limit(1);

    return results[0] || null;
  }

  /**
   * 期限切れの冪等性キーを削除
   */
  async deleteExpiredIdempotencyKeys(): Promise<number> {
    const now = new Date().toISOString();

    const results = await this.db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, now))
      .returning();

    return results.length;
  }
}