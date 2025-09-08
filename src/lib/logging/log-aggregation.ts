import { LogEntry, LogLevel } from './structured-logger';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// =============================================================================
// ログ集約・分析システム
// ログパース、集約、分析、レポート生成の包括的実装
// =============================================================================

/**
 * ログ分析結果スキーマ
 */
const LogAnalysisSchema = z.object({
  timeRange: z.object({
    start: z.date(),
    end: z.date(),
    duration: z.number(),
  }),
  totalLogs: z.number(),
  logsByLevel: z.record(z.string(), z.number()),
  topComponents: z.array(z.object({
    component: z.string(),
    count: z.number(),
    percentage: z.number(),
  })),
  errorAnalysis: z.object({
    totalErrors: z.number(),
    errorRate: z.number(),
    topErrors: z.array(z.object({
      error: z.string(),
      count: z.number(),
      percentage: z.number(),
    })),
    componentErrors: z.record(z.string(), z.number()),
  }),
  performanceMetrics: z.object({
    averageResponseTime: z.number(),
    slowRequests: z.number(),
    p95ResponseTime: z.number(),
    p99ResponseTime: z.number(),
  }),
  httpAnalysis: z.object({
    totalRequests: z.number(),
    statusCodeDistribution: z.record(z.string(), z.number()),
    topEndpoints: z.array(z.object({
      endpoint: z.string(),
      count: z.number(),
      averageTime: z.number(),
    })),
    userAgents: z.record(z.string(), z.number()),
  }),
  securityEvents: z.object({
    failedAuth: z.number(),
    suspiciousIPs: z.array(z.string()),
    rateLimitViolations: z.number(),
  }),
});

export type LogAnalysis = z.infer<typeof LogAnalysisSchema>;

/**
 * ログクエリ条件
 */
interface LogQuery {
  startTime?: Date;
  endTime?: Date;
  levels?: LogLevel[];
  components?: string[];
  users?: string[];
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

/**
 * ログ集約結果
 */
interface LogAggregation {
  total: number;
  byHour: Record<string, number>;
  byLevel: Record<LogLevel, number>;
  byComponent: Record<string, number>;
  byUser: Record<string, number>;
}

/**
 * ログストレージインターface
 */
interface LogStorage {
  write(entries: LogEntry[]): Promise<void>;
  query(query: LogQuery): Promise<LogEntry[]>;
  aggregate(query: LogQuery): Promise<LogAggregation>;
}

/**
 * ファイルベースログストレージ
 */
class FileLogStorage implements LogStorage {
  constructor(private baseDir: string) {}

  /**
   * ログエントリ書き込み
   */
  async write(entries: LogEntry[]): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      
      // 日付別にファイル分割
      const entriesByDate = new Map<string, LogEntry[]>();
      
      for (const entry of entries) {
        const date = new Date(entry.timestamp).toISOString().split('T')[0];
        if (!entriesByDate.has(date)) {
          entriesByDate.set(date, []);
        }
        entriesByDate.get(date)!.push(entry);
      }

      // 各日付のファイルに書き込み
      for (const [date, dateEntries] of entriesByDate) {
        const filePath = path.join(this.baseDir, `${date}.jsonl`);
        const content = dateEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
        await fs.appendFile(filePath, content);
      }
    } catch (error) {
      console.error('[LogStorage] Failed to write entries:', error);
      throw error;
    }
  }

  /**
   * ログクエリ実行
   */
  async query(query: LogQuery): Promise<LogEntry[]> {
    try {
      const files = await this.getRelevantFiles(query);
      const results: LogEntry[] = [];
      let processedCount = 0;

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry: LogEntry = JSON.parse(line);
            
            if (this.matchesQuery(entry, query)) {
              results.push(entry);
              
              if (query.limit && results.length >= query.limit) {
                return this.applyOffset(results, query.offset);
              }
            }
          } catch (error) {
            // 無効なJSON行はスキップ
            continue;
          }
        }
      }

      return this.applyOffset(results, query.offset);
    } catch (error) {
      console.error('[LogStorage] Failed to query entries:', error);
      return [];
    }
  }

  /**
   * ログ集約実行
   */
  async aggregate(query: LogQuery): Promise<LogAggregation> {
    const entries = await this.query({ ...query, limit: undefined, offset: undefined });
    
    const aggregation: LogAggregation = {
      total: entries.length,
      byHour: {},
      byLevel: {} as Record<LogLevel, number>,
      byComponent: {},
      byUser: {},
    };

    // レベル別集約初期化
    for (const level of Object.values(LogLevel)) {
      if (typeof level === 'number') {
        aggregation.byLevel[level] = 0;
      }
    }

    for (const entry of entries) {
      // 時間別集約
      const hour = new Date(entry.timestamp).toISOString().slice(0, 13);
      aggregation.byHour[hour] = (aggregation.byHour[hour] || 0) + 1;

      // レベル別集約
      aggregation.byLevel[entry.level]++;

      // コンポーネント別集約
      aggregation.byComponent[entry.component] = (aggregation.byComponent[entry.component] || 0) + 1;

      // ユーザー別集約
      if (entry.userId) {
        aggregation.byUser[entry.userId] = (aggregation.byUser[entry.userId] || 0) + 1;
      }
    }

    return aggregation;
  }

  /**
   * 関連ファイル取得
   */
  private async getRelevantFiles(query: LogQuery): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      const logFiles = files.filter(file => file.endsWith('.jsonl')).sort();

      if (!query.startTime && !query.endTime) {
        return logFiles.map(file => path.join(this.baseDir, file));
      }

      // 時間範囲フィルター
      const startDate = query.startTime ? query.startTime.toISOString().split('T')[0] : '';
      const endDate = query.endTime ? query.endTime.toISOString().split('T')[0] : '';

      return logFiles
        .filter(file => {
          const fileDate = file.replace('.jsonl', '');
          return (!startDate || fileDate >= startDate) && (!endDate || fileDate <= endDate);
        })
        .map(file => path.join(this.baseDir, file));
    } catch (error) {
      console.error('[LogStorage] Failed to get relevant files:', error);
      return [];
    }
  }

  /**
   * クエリマッチング
   */
  private matchesQuery(entry: LogEntry, query: LogQuery): boolean {
    // 時間範囲チェック
    const entryTime = new Date(entry.timestamp);
    if (query.startTime && entryTime < query.startTime) return false;
    if (query.endTime && entryTime > query.endTime) return false;

    // レベルチェック
    if (query.levels && !query.levels.includes(entry.level)) return false;

    // コンポーネントチェック
    if (query.components && !query.components.includes(entry.component)) return false;

    // ユーザーチェック
    if (query.users && (!entry.userId || !query.users.includes(entry.userId))) return false;

    // 検索テキストチェック
    if (query.searchTerm) {
      const searchLower = query.searchTerm.toLowerCase();
      const entryText = JSON.stringify(entry).toLowerCase();
      if (!entryText.includes(searchLower)) return false;
    }

    return true;
  }

  /**
   * オフセット適用
   */
  private applyOffset(results: LogEntry[], offset?: number): LogEntry[] {
    if (!offset || offset <= 0) return results;
    return results.slice(offset);
  }
}

/**
 * ログ分析エンジン
 */
export class LogAnalyzer {
  private storage: LogStorage;

  constructor(storageDir: string = './logs/storage') {
    this.storage = new FileLogStorage(storageDir);
  }

  /**
   * ログエントリ保存
   */
  async saveEntries(entries: LogEntry[]): Promise<void> {
    await this.storage.write(entries);
  }

  /**
   * 包括的ログ分析実行
   */
  async analyzeTimeRange(startTime: Date, endTime: Date): Promise<LogAnalysis> {
    const query: LogQuery = { startTime, endTime };
    const entries = await this.storage.query(query);
    
    if (entries.length === 0) {
      throw new Error('No logs found for the specified time range');
    }

    return {
      timeRange: {
        start: startTime,
        end: endTime,
        duration: endTime.getTime() - startTime.getTime(),
      },
      totalLogs: entries.length,
      logsByLevel: this.analyzeLogsByLevel(entries),
      topComponents: this.analyzeTopComponents(entries),
      errorAnalysis: this.analyzeErrors(entries),
      performanceMetrics: this.analyzePerformance(entries),
      httpAnalysis: this.analyzeHttpRequests(entries),
      securityEvents: this.analyzeSecurityEvents(entries),
    };
  }

  /**
   * レベル別分析
   */
  private analyzeLogsByLevel(entries: LogEntry[]): Record<string, number> {
    const levelCounts: Record<string, number> = {};
    
    for (const entry of entries) {
      const levelName = LogLevel[entry.level];
      levelCounts[levelName] = (levelCounts[levelName] || 0) + 1;
    }

    return levelCounts;
  }

  /**
   * トップコンポーネント分析
   */
  private analyzeTopComponents(entries: LogEntry[]): Array<{
    component: string;
    count: number;
    percentage: number;
  }> {
    const componentCounts: Record<string, number> = {};
    
    for (const entry of entries) {
      componentCounts[entry.component] = (componentCounts[entry.component] || 0) + 1;
    }

    return Object.entries(componentCounts)
      .map(([component, count]) => ({
        component,
        count,
        percentage: Math.round((count / entries.length) * 10000) / 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * エラー分析
   */
  private analyzeErrors(entries: LogEntry[]): LogAnalysis['errorAnalysis'] {
    const errorEntries = entries.filter(entry => entry.level >= LogLevel.ERROR);
    const errorCounts: Record<string, number> = {};
    const componentErrors: Record<string, number> = {};

    for (const entry of errorEntries) {
      // エラーメッセージ別カウント
      const errorKey = entry.error?.name || entry.message;
      errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;

      // コンポーネント別エラーカウント
      componentErrors[entry.component] = (componentErrors[entry.component] || 0) + 1;
    }

    const topErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({
        error,
        count,
        percentage: Math.round((count / errorEntries.length) * 10000) / 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors: errorEntries.length,
      errorRate: Math.round((errorEntries.length / entries.length) * 10000) / 100,
      topErrors,
      componentErrors,
    };
  }

  /**
   * パフォーマンス分析
   */
  private analyzePerformance(entries: LogEntry[]): LogAnalysis['performanceMetrics'] {
    const performanceEntries = entries.filter(entry => entry.performance?.duration !== undefined);
    
    if (performanceEntries.length === 0) {
      return {
        averageResponseTime: 0,
        slowRequests: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
      };
    }

    const durations = performanceEntries
      .map(entry => entry.performance!.duration)
      .sort((a, b) => a - b);

    const averageResponseTime = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    const slowRequests = durations.filter(duration => duration > 2000).length;
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      averageResponseTime: Math.round(averageResponseTime),
      slowRequests,
      p95ResponseTime: durations[p95Index] || 0,
      p99ResponseTime: durations[p99Index] || 0,
    };
  }

  /**
   * HTTP リクエスト分析
   */
  private analyzeHttpRequests(entries: LogEntry[]): LogAnalysis['httpAnalysis'] {
    const httpEntries = entries.filter(entry => entry.httpContext !== undefined);
    
    if (httpEntries.length === 0) {
      return {
        totalRequests: 0,
        statusCodeDistribution: {},
        topEndpoints: [],
        userAgents: {},
      };
    }

    const statusCodeCounts: Record<string, number> = {};
    const endpointStats: Record<string, { count: number; totalTime: number }> = {};
    const userAgentCounts: Record<string, number> = {};

    for (const entry of httpEntries) {
      const { httpContext, performance } = entry;
      if (!httpContext) continue;

      // ステータスコード分布
      const statusCode = httpContext.statusCode.toString();
      statusCodeCounts[statusCode] = (statusCodeCounts[statusCode] || 0) + 1;

      // エンドポイント統計
      const endpoint = `${httpContext.method} ${httpContext.url}`;
      if (!endpointStats[endpoint]) {
        endpointStats[endpoint] = { count: 0, totalTime: 0 };
      }
      endpointStats[endpoint].count++;
      
      if (performance?.duration) {
        endpointStats[endpoint].totalTime += performance.duration;
      }

      // User Agent 分析
      if (httpContext.userAgent) {
        const userAgent = this.normalizeUserAgent(httpContext.userAgent);
        userAgentCounts[userAgent] = (userAgentCounts[userAgent] || 0) + 1;
      }
    }

    // トップエンドポイント
    const topEndpoints = Object.entries(endpointStats)
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        averageTime: stats.totalTime > 0 ? Math.round(stats.totalTime / stats.count) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRequests: httpEntries.length,
      statusCodeDistribution: statusCodeCounts,
      topEndpoints,
      userAgents: userAgentCounts,
    };
  }

  /**
   * セキュリティイベント分析
   */
  private analyzeSecurityEvents(entries: LogEntry[]): LogAnalysis['securityEvents'] {
    let failedAuth = 0;
    const suspiciousIPs = new Set<string>();
    let rateLimitViolations = 0;
    const ipRequestCounts: Record<string, number> = {};

    for (const entry of entries) {
      // 認証失敗検出
      if (entry.level >= LogLevel.WARN && 
          (entry.message.includes('authentication') || entry.message.includes('login'))) {
        failedAuth++;
      }

      // Rate limit 違反検出
      if (entry.message.includes('rate limit') || entry.message.includes('too many requests')) {
        rateLimitViolations++;
      }

      // IP別リクエスト数追跡
      const ip = entry.httpContext?.ip;
      if (ip) {
        ipRequestCounts[ip] = (ipRequestCounts[ip] || 0) + 1;
      }
    }

    // 異常に多いリクエスト数のIPを検出
    for (const [ip, count] of Object.entries(ipRequestCounts)) {
      if (count > 1000) { // 閾値は設定可能
        suspiciousIPs.add(ip);
      }
    }

    return {
      failedAuth,
      suspiciousIPs: Array.from(suspiciousIPs),
      rateLimitViolations,
    };
  }

  /**
   * User Agent 正規化
   */
  private normalizeUserAgent(userAgent: string): string {
    // 主要ブラウザ・ツールの識別
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('curl')) return 'curl';
    if (userAgent.includes('wget')) return 'wget';
    if (userAgent.includes('Postman')) return 'Postman';
    
    return 'Other';
  }

  /**
   * ログクエリ実行
   */
  async queryLogs(query: LogQuery): Promise<LogEntry[]> {
    return await this.storage.query(query);
  }

  /**
   * ログ集約実行
   */
  async aggregateLogs(query: LogQuery): Promise<LogAggregation> {
    return await this.storage.aggregate(query);
  }

  /**
   * 最近のエラーログ取得
   */
  async getRecentErrors(hours: number = 24): Promise<LogEntry[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await this.storage.query({
      startTime,
      levels: [LogLevel.ERROR, LogLevel.FATAL],
      limit: 100,
    });
  }

  /**
   * スロークエリ検出
   */
  async detectSlowRequests(hours: number = 24, thresholdMs: number = 2000): Promise<LogEntry[]> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const entries = await this.storage.query({ startTime });
    
    return entries.filter(entry => 
      entry.performance?.duration && entry.performance.duration > thresholdMs
    );
  }

  /**
   * アクティブユーザー分析
   */
  async analyzeActiveUsers(hours: number = 24): Promise<{
    totalUsers: number;
    topUsers: Array<{ userId: string; requestCount: number }>;
  }> {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const entries = await this.storage.query({ startTime });
    
    const userCounts: Record<string, number> = {};
    
    for (const entry of entries) {
      if (entry.userId) {
        userCounts[entry.userId] = (userCounts[entry.userId] || 0) + 1;
      }
    }

    const topUsers = Object.entries(userCounts)
      .map(([userId, requestCount]) => ({ userId, requestCount }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    return {
      totalUsers: Object.keys(userCounts).length,
      topUsers,
    };
  }
}

/**
 * グローバルログアナライザー
 */
export const logAnalyzer = new LogAnalyzer();