import { eq, and, or, desc, asc, inArray } from 'drizzle-orm';
import { jobs, idempotencyKeys } from '../schema';
import { BaseRepository } from './base-repository';
import db from '../connection';
import {
  Job,
  JobRow,
  JobResponse,
  IdempotencyKeyRow,
} from '../../types/models';

// =============================================================================
// Job Repository
// 非同期操作ジョブの管理を提供
// =============================================================================

export class JobRepository extends BaseRepository<typeof jobs, JobRow, Job> {
  constructor() {
    super(jobs, 'id', ['type', 'targetId']);
  }

  /**
   * データベースの行をJobモデルに変換
   */
  protected mapRowToModel(row: JobRow): Job {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      target: {
        type: row.targetType,
        id: row.targetId,
      },
      progress: {
        current: row.progressCurrent,
        total: row.progressTotal,
        message: row.progressMessage || '',
      },
      result: this.safeParseJson(row.result),
      error: row.errorCode
        ? {
            code: row.errorCode,
            message: row.errorMessage || '',
            details: this.safeParseJson(row.errorDetails),
          }
        : undefined,
      createdAt: this.parseDate(row.createdAt),
      updatedAt: this.parseDate(row.updatedAt),
      completedAt: row.completedAt ? this.parseDate(row.completedAt) : undefined,
    };
  }

  /**
   * Jobモデルをデータベースの行に変換
   */
  protected mapModelToRow(model: Partial<Job>): Partial<JobRow> {
    return {
      id: model.id,
      type: model.type,
      status: model.status,
      targetType: model.target?.type,
      targetId: model.target?.id,
      progressCurrent: model.progress?.current,
      progressTotal: model.progress?.total,
      progressMessage: model.progress?.message,
      result: this.safeStringifyJson(model.result),
      errorCode: model.error?.code,
      errorMessage: model.error?.message,
      errorDetails: this.safeStringifyJson(model.error?.details),
      completedAt: model.completedAt ? model.completedAt.toISOString() : undefined,
    };
  }

  /**
   * 新しいジョブを作成
   */
  async createJob(jobData: {
    type: Job['type'];
    target: Job['target'];
    estimatedDuration?: number;
  }): Promise<JobResponse> {
    try {
      const job: Partial<Job> = {
        id: this.generateId(),
        type: jobData.type,
        status: 'pending',
        target: jobData.target,
        progress: {
          current: 0,
          total: 100,
          message: 'Job created and queued for execution',
        },
      };

      await this.create(job);

      return {
        id: job.id!,
        status: 'pending',
        message: 'Operation started successfully',
        estimatedDuration: jobData.estimatedDuration,
      };
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * 冪等性キーを使用してジョブを作成または既存のジョブIDを返す
   */
  async createOrGetJobWithIdempotency(
    idempotencyKey: string,
    scope: string,
    requestHash: string,
    jobData: {
      type: Job['type'];
      target: Job['target'];
      estimatedDuration?: number;
    }
  ): Promise<JobResponse> {
    try {
      return await this.transaction(async (tx) => {
        // 既存の冪等性キーを確認
        const [existingKey] = await db
          .select()
          .from(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.key, idempotencyKey),
              eq(idempotencyKeys.scope, scope)
            )
          )
          .limit(1)
          .execute();

        if (existingKey) {
          // 有効期限をチェック
          const now = new Date();
          const expiresAt = new Date(existingKey.expiresAt);

          if (now < expiresAt) {
            // リクエストハッシュの不一致チェック
            if (existingKey.requestHash !== requestHash) {
              throw new Error('IDEMPOTENCY_KEY_MISMATCH');
            }

            // 既存のジョブを返す
            const existingJob = await this.findById(existingKey.jobId);
            if (existingJob) {
              return {
                id: existingJob.id,
                status: existingJob.status,
                message: 'Existing job found for idempotency key',
              };
            }
          } else {
            // 期限切れのキーを削除
            await db
              .delete(idempotencyKeys)
              .where(eq(idempotencyKeys.key, idempotencyKey))
              .execute();
          }
        }

        // 新しいジョブを作成
        const jobResponse = await this.createJob(jobData);

        // 冪等性キーを保存
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24時間後に期限切れ

        await db
          .insert(idempotencyKeys)
          .values({
            key: idempotencyKey,
            scope,
            requestHash,
            jobId: jobResponse.id,
            expiresAt: expiresAt.toISOString(),
          })
          .execute();

        return jobResponse;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_MISMATCH') {
        throw error;
      }
      console.error('Error creating job with idempotency:', error);
      throw error;
    }
  }

  /**
   * ジョブステータスを更新
   */
  async updateJobStatus(
    id: string,
    status: Job['status'],
    progress?: Partial<Job['progress']>,
    result?: any,
    error?: Job['error']
  ): Promise<boolean> {
    try {
      const updateData: Partial<JobRow> = {
        status,
        updatedAt: new Date().toISOString(),
      };

      if (progress) {
        updateData.progressCurrent = progress.current;
        updateData.progressTotal = progress.total;
        updateData.progressMessage = progress.message;
      }

      if (result !== undefined) {
        updateData.result = this.safeStringifyJson(result);
      }

      if (error) {
        updateData.errorCode = error.code;
        updateData.errorMessage = error.message;
        updateData.errorDetails = this.safeStringifyJson(error.details);
      }

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        updateData.completedAt = new Date().toISOString();
      }

      const result_db = await db
        .update(jobs)
        .set(updateData)
        .where(eq(jobs.id, id))
        .execute();

      return result_db.changes > 0;
    } catch (error) {
      console.error(`Error updating job status for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * ジョブの進捗を更新
   */
  async updateJobProgress(
    id: string,
    current: number,
    message?: string
  ): Promise<boolean> {
    try {
      const result = await db
        .update(jobs)
        .set({
          progressCurrent: current,
          progressMessage: message,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error updating job progress for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 対象別のジョブ一覧を取得
   */
  async findByTarget(
    targetType: Job['target']['type'],
    targetId: string,
    options: {
      status?: Job['status'][];
      limit?: number;
    } = {}
  ): Promise<Job[]> {
    try {
      const { status, limit = 50 } = options;

      let query = db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.targetType, targetType),
            eq(jobs.targetId, targetId)
          )
        )
        .orderBy(desc(jobs.createdAt))
        .limit(limit);

      if (status && status.length > 0) {
        query = db
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.targetType, targetType),
              eq(jobs.targetId, targetId),
              inArray(jobs.status, status)
            )
          )
          .orderBy(desc(jobs.createdAt))
          .limit(limit);
      }

      const rows = await query.execute();
      return rows.map((row) => this.mapRowToModel(row));
    } catch (error) {
      console.error(`Error finding jobs by target ${targetType}:${targetId}:`, error);
      throw error;
    }
  }

  /**
   * 進行中のジョブ一覧を取得
   */
  async findInProgress(): Promise<Job[]> {
    try {
      const rows = await db
        .select()
        .from(jobs)
        .where(inArray(jobs.status, ['pending', 'running']))
        .orderBy(asc(jobs.createdAt))
        .execute();

      return rows.map((row) => this.mapRowToModel(row));
    } catch (error) {
      console.error('Error finding in-progress jobs:', error);
      throw error;
    }
  }

  /**
   * 対象の最新ジョブを取得
   */
  async findLatestByTarget(
    targetType: Job['target']['type'],
    targetId: string
  ): Promise<Job | null> {
    try {
      const [row] = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.targetType, targetType),
            eq(jobs.targetId, targetId)
          )
        )
        .orderBy(desc(jobs.createdAt))
        .limit(1)
        .execute();

      return row ? this.mapRowToModel(row) : null;
    } catch (error) {
      console.error(`Error finding latest job for target ${targetType}:${targetId}:`, error);
      throw error;
    }
  }

  /**
   * ジョブをキャンセル
   */
  async cancelJob(id: string): Promise<boolean> {
    try {
      const job = await this.findById(id);
      if (!job) return false;

      // キャンセル可能なステータスかチェック
      if (!['pending', 'running'].includes(job.status)) {
        return false;
      }

      return await this.updateJobStatus(id, 'cancelled');
    } catch (error) {
      console.error(`Error cancelling job ${id}:`, error);
      throw error;
    }
  }

  /**
   * 古いジョブを削除（クリーンアップ）
   */
  async cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await db
        .delete(jobs)
        .where(
          and(
            inArray(jobs.status, ['completed', 'failed', 'cancelled']),
            db.sql`${jobs.createdAt} < ${cutoffDate.toISOString()}`
          )
        )
        .execute();

      console.log(`Cleaned up ${result.changes} old jobs`);
      return result.changes;
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      throw error;
    }
  }

  /**
   * 期限切れの冪等性キーを削除
   */
  async cleanupExpiredIdempotencyKeys(): Promise<number> {
    try {
      const now = new Date();
      const result = await db
        .delete(idempotencyKeys)
        .where(db.sql`${idempotencyKeys.expiresAt} < ${now.toISOString()}`)
        .execute();

      console.log(`Cleaned up ${result.changes} expired idempotency keys`);
      return result.changes;
    } catch (error) {
      console.error('Error cleaning up expired idempotency keys:', error);
      throw error;
    }
  }

  /**
   * ジョブ統計を取得
   */
  async getJobStats(): Promise<{
    totalJobs: number;
    byStatus: Record<Job['status'], number>;
    byType: Record<Job['type'], number>;
    recentCompletionRate: number;
  }> {
    try {
      // 総ジョブ数
      const [{ totalJobs }] = await db
        .select({ totalJobs: db.sql<number>`count(*)` })
        .from(jobs)
        .execute();

      // ステータス別
      const statusCounts = await db
        .select({
          status: jobs.status,
          count: db.sql<number>`count(*)`,
        })
        .from(jobs)
        .groupBy(jobs.status)
        .execute();

      const byStatus: Record<Job['status'], number> = {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      statusCounts.forEach((row) => {
        byStatus[row.status as Job['status']] = row.count;
      });

      // タイプ別
      const typeCounts = await db
        .select({
          type: jobs.type,
          count: db.sql<number>`count(*)`,
        })
        .from(jobs)
        .groupBy(jobs.type)
        .execute();

      const byType: Record<Job['type'], number> = {
        install: 0,
        start: 0,
        stop: 0,
        test: 0,
        enable: 0,
        disable: 0,
        delete: 0,
      };

      typeCounts.forEach((row) => {
        byType[row.type as Job['type']] = row.count;
      });

      // 最近の完了率（過去24時間）
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const [{ recentTotal }] = await db
        .select({ recentTotal: db.sql<number>`count(*)` })
        .from(jobs)
        .where(db.sql`${jobs.createdAt} > ${oneDayAgo.toISOString()}`)
        .execute();

      const [{ recentCompleted }] = await db
        .select({ recentCompleted: db.sql<number>`count(*)` })
        .from(jobs)
        .where(
          and(
            eq(jobs.status, 'completed'),
            db.sql`${jobs.createdAt} > ${oneDayAgo.toISOString()}`
          )
        )
        .execute();

      const recentCompletionRate = recentTotal > 0 ? (recentCompleted / recentTotal) * 100 : 0;

      return {
        totalJobs,
        byStatus,
        byType,
        recentCompletionRate: Math.round(recentCompletionRate * 100) / 100,
      };
    } catch (error) {
      console.error('Error getting job stats:', error);
      throw error;
    }
  }
}