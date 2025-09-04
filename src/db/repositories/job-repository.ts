import { eq, and, lt, inArray } from 'drizzle-orm';
import { BaseRepository } from './base-repository';
import { jobs, idempotencyKeys } from '../schema';
import type {
  Job,
  NewJob,
  IdempotencyKey,
  NewIdempotencyKey,
  PaginatedResponse,
} from '../../types/database';

/**
 * ジョブリポジトリ
 * 非同期操作の管理を担当
 */
export class JobRepository extends BaseRepository<Job, NewJob> {
  protected tableName = 'jobs';
  protected table = jobs;

  /**
   * ターゲットとタイプでジョブを検索
   */
  async findByTargetAndType(
    targetType: 'server' | 'catalog' | 'gateway',
    targetId: string,
    jobType: string,
  ): Promise<Job[]> {
    try {
      return await this.findByCondition(
        and(
          eq(jobs.targetType, targetType),
          eq(jobs.targetId, targetId),
          eq(jobs.type, jobType),
        ),
        {
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
      );
    } catch (error) {
      throw new Error(`Failed to find jobs by target and type: ${error}`);
    }
  }

  /**
   * 実行中のジョブを検索
   */
  async findInProgressJobs(): Promise<Job[]> {
    try {
      return await this.findByCondition(
        inArray(jobs.status, ['pending', 'running']),
        {
          sortBy: 'createdAt',
          sortOrder: 'asc',
        },
      );
    } catch (error) {
      throw new Error(`Failed to find in-progress jobs: ${error}`);
    }
  }

  /**
   * 特定ターゲットの実行中ジョブを検索
   */
  async findInProgressJobsByTarget(
    targetType: 'server' | 'catalog' | 'gateway',
    targetId: string,
  ): Promise<Job[]> {
    try {
      return await this.findByCondition(
        and(
          eq(jobs.targetType, targetType),
          eq(jobs.targetId, targetId),
          inArray(jobs.status, ['pending', 'running']),
        ),
      );
    } catch (error) {
      throw new Error(`Failed to find in-progress jobs by target: ${error}`);
    }
  }

  /**
   * ジョブステータスを更新
   */
  async updateStatus(
    id: string,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    options?: {
      result?: any;
      errorCode?: string;
      errorMessage?: string;
      errorDetails?: any;
      progressCurrent?: number;
      progressMessage?: string;
    },
  ): Promise<Job | null> {
    try {
      const updateData: Partial<NewJob> = {
        status,
        ...options,
      };

      // 完了・失敗・キャンセル時は完了時刻を設定
      if (['completed', 'failed', 'cancelled'].includes(status)) {
        updateData.completedAt = new Date().toISOString();
      }

      return await this.update(id, updateData);
    } catch (error) {
      throw new Error(`Failed to update job status: ${error}`);
    }
  }

  /**
   * ジョブの進捗を更新
   */
  async updateProgress(
    id: string,
    current: number,
    message?: string,
  ): Promise<Job | null> {
    try {
      return await this.update(id, {
        progressCurrent: current,
        progressMessage: message,
        status: current >= 100 ? 'completed' : 'running',
      });
    } catch (error) {
      throw new Error(`Failed to update job progress: ${error}`);
    }
  }

  /**
   * ジョブ履歴を取得（ページネーション対応）
   */
  async getJobHistory(
    targetType?: 'server' | 'catalog' | 'gateway',
    targetId?: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      type?: string;
    },
  ): Promise<PaginatedResponse<Job>> {
    try {
      const { page = 1, limit = 20, status, type } = options || {};

      const whereConditions: unknown[] = [];

      if (targetType && targetId) {
        whereConditions.push(eq(jobs.targetType, targetType));
        whereConditions.push(eq(jobs.targetId, targetId));
      }

      if (status) {
        whereConditions.push(eq(jobs.status, status));
      }

      if (type) {
        whereConditions.push(eq(jobs.type, type));
      }

      const whereCondition =
        whereConditions.length > 0 ? and(...whereConditions) : undefined;

      return await this.findAll({
        page,
        limit,
        where: whereCondition,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
    } catch (error) {
      throw new Error(`Failed to get job history: ${error}`);
    }
  }

  /**
   * 古いジョブを削除（クリーンアップ用）
   */
  async deleteOldJobs(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const results = await this.db
        .delete(jobs)
        .where(lt(jobs.createdAt, cutoffDate.toISOString()))
        .returning();

      return results.length;
    } catch (error) {
      throw new Error(`Failed to delete old jobs: ${error}`);
    }
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
    try {
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
    } catch (error) {
      throw new Error(`Failed to create idempotency key: ${error}`);
    }
  }

  /**
   * 冪等性キーでジョブIDを検索
   */
  async findJobByIdempotencyKey(
    key: string,
    scope: string,
  ): Promise<{ jobId: string; requestHash: string } | null> {
    try {
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
    } catch (error) {
      throw new Error(`Failed to find job by idempotency key: ${error}`);
    }
  }

  /**
   * 期限切れの冪等性キーを削除
   */
  async deleteExpiredIdempotencyKeys(): Promise<number> {
    try {
      const now = new Date().toISOString();

      const results = await this.db
        .delete(idempotencyKeys)
        .where(lt(idempotencyKeys.expiresAt, now))
        .returning();

      return results.length;
    } catch (error) {
      throw new Error(`Failed to delete expired idempotency keys: ${error}`);
    }
  }

  /**
   * ジョブ統計情報を取得
   */
  async getJobStatistics(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    try {
      const [total, pending, running, completed, failed, cancelled] =
        await Promise.all([
          this.count(),
          this.count(eq(jobs.status, 'pending')),
          this.count(eq(jobs.status, 'running')),
          this.count(eq(jobs.status, 'completed')),
          this.count(eq(jobs.status, 'failed')),
          this.count(eq(jobs.status, 'cancelled')),
        ]);

      return {
        total,
        pending,
        running,
        completed,
        failed,
        cancelled,
      };
    } catch (error) {
      throw new Error(`Failed to get job statistics: ${error}`);
    }
  }

  /**
   * 実行時間の長いジョブを検索（デバッグ用）
   */
  async findLongRunningJobs(thresholdMinutes: number = 30): Promise<Job[]> {
    try {
      const thresholdTime = new Date();
      thresholdTime.setMinutes(thresholdTime.getMinutes() - thresholdMinutes);

      return await this.findByCondition(
        and(
          inArray(jobs.status, ['pending', 'running']),
          lt(jobs.createdAt, thresholdTime.toISOString()),
        ),
      );
    } catch (error) {
      throw new Error(`Failed to find long running jobs: ${error}`);
    }
  }
}