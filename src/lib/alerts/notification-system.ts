import { LogEntry, LogLevel } from '../logging/structured-logger';
import { z } from 'zod';

// =============================================================================
// アラート通知システム
// 通知チャネル、ルール、テンプレート、配信管理の包括的実装
// =============================================================================

/**
 * アラート重要度レベル
 */
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 通知チャネルタイプ
 */
export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  SMS = 'sms',
  PUSH = 'push',
}

/**
 * アラートルールスキーマ
 */
const AlertRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  conditions: z.object({
    logLevel: z.nativeEnum(LogLevel).optional(),
    component: z.string().optional(),
    message: z.string().optional(),
    errorRate: z.number().optional(),
    responseTime: z.number().optional(),
    frequency: z.number().optional(),
    timeWindow: z.number(),
  }),
  severity: z.nativeEnum(AlertSeverity),
  channels: z.array(z.nativeEnum(NotificationChannel)),
  cooldown: z.number(),
  recipients: z.object({
    email: z.array(z.string()).optional(),
    slack: z.array(z.string()).optional(),
    webhook: z.array(z.string()).optional(),
    sms: z.array(z.string()).optional(),
  }),
  template: z.string().optional(),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

/**
 * アラートイベントスキーマ
 */
const AlertEventSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  severity: z.nativeEnum(AlertSeverity),
  title: z.string(),
  message: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.any()),
  resolved: z.boolean().default(false),
  resolvedAt: z.date().optional(),
  notifications: z.array(z.object({
    channel: z.nativeEnum(NotificationChannel),
    recipient: z.string(),
    sentAt: z.date(),
    status: z.enum(['sent', 'failed', 'pending']),
    error: z.string().optional(),
  })),
});

export type AlertEvent = z.infer<typeof AlertEventSchema>;

/**
 * 通知テンプレート
 */
interface NotificationTemplate {
  subject: string;
  body: string;
  variables: Record<string, any>;
}

/**
 * 通知プロバイダーインターフェース
 */
interface NotificationProvider {
  send(
    recipient: string,
    template: NotificationTemplate,
    metadata: Record<string, any>
  ): Promise<{ success: boolean; error?: string }>;
}

/**
 * メール通知プロバイダー
 */
class EmailNotificationProvider implements NotificationProvider {
  constructor(private config: {
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    from: string;
  }) {}

  async send(
    recipient: string,
    template: NotificationTemplate,
    metadata: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 実際の実装では、nodemailer や類似ライブラリを使用
      console.log(`[Email] Sending to ${recipient}:`);
      console.log(`Subject: ${this.renderTemplate(template.subject, template.variables, metadata)}`);
      console.log(`Body: ${this.renderTemplate(template.body, template.variables, metadata)}`);
      
      // 模擬送信
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private renderTemplate(template: string, variables: Record<string, any>, metadata: Record<string, any>): string {
    let rendered = template;
    const allVars = { ...variables, ...metadata };
    
    for (const [key, value] of Object.entries(allVars)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return rendered;
  }
}

/**
 * Slack 通知プロバイダー
 */
class SlackNotificationProvider implements NotificationProvider {
  constructor(private config: {
    webhookUrl: string;
    botToken?: string;
  }) {}

  async send(
    recipient: string,
    template: NotificationTemplate,
    metadata: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const message = {
        channel: recipient,
        text: this.renderTemplate(template.body, template.variables, metadata),
        attachments: [{
          color: this.getSeverityColor(metadata.severity),
          title: this.renderTemplate(template.subject, template.variables, metadata),
          fields: [
            {
              title: 'Severity',
              value: metadata.severity,
              short: true,
            },
            {
              title: 'Component',
              value: metadata.component,
              short: true,
            },
            {
              title: 'Timestamp',
              value: new Date(metadata.timestamp).toISOString(),
              short: false,
            },
          ],
        }],
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.LOW: return '#36a64f';
      case AlertSeverity.MEDIUM: return '#ffaa00';
      case AlertSeverity.HIGH: return '#ff6600';
      case AlertSeverity.CRITICAL: return '#ff0000';
      default: return '#cccccc';
    }
  }

  private renderTemplate(template: string, variables: Record<string, any>, metadata: Record<string, any>): string {
    let rendered = template;
    const allVars = { ...variables, ...metadata };
    
    for (const [key, value] of Object.entries(allVars)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return rendered;
  }
}

/**
 * Webhook 通知プロバイダー
 */
class WebhookNotificationProvider implements NotificationProvider {
  async send(
    recipient: string,
    template: NotificationTemplate,
    metadata: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = {
        alert: {
          title: this.renderTemplate(template.subject, template.variables, metadata),
          message: this.renderTemplate(template.body, template.variables, metadata),
          severity: metadata.severity,
          timestamp: metadata.timestamp,
          metadata,
        },
      };

      const response = await fetch(recipient, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private renderTemplate(template: string, variables: Record<string, any>, metadata: Record<string, any>): string {
    let rendered = template;
    const allVars = { ...variables, ...metadata };
    
    for (const [key, value] of Object.entries(allVars)) {
      const placeholder = `{{${key}}}`;
      rendered = rendered.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return rendered;
  }
}

/**
 * アラート通知システム
 */
export class AlertNotificationSystem {
  private rules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, AlertEvent>();
  private providers = new Map<NotificationChannel, NotificationProvider>();
  private lastTriggerTimes = new Map<string, number>();
  private templates = new Map<string, NotificationTemplate>();

  constructor() {
    this.initializeProviders();
    this.initializeDefaultRules();
    this.initializeTemplates();
  }

  /**
   * 通知プロバイダー初期化
   */
  private initializeProviders(): void {
    // メール通知設定
    if (process.env.SMTP_HOST) {
      this.providers.set(NotificationChannel.EMAIL, new EmailNotificationProvider({
        smtpHost: process.env.SMTP_HOST,
        smtpPort: parseInt(process.env.SMTP_PORT || '587'),
        username: process.env.SMTP_USERNAME || '',
        password: process.env.SMTP_PASSWORD || '',
        from: process.env.SMTP_FROM || 'noreply@docker-mcp-manager.local',
      }));
    }

    // Slack 通知設定
    if (process.env.SLACK_WEBHOOK_URL) {
      this.providers.set(NotificationChannel.SLACK, new SlackNotificationProvider({
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        botToken: process.env.SLACK_BOT_TOKEN,
      }));
    }

    // Webhook 通知設定
    this.providers.set(NotificationChannel.WEBHOOK, new WebhookNotificationProvider());
  }

  /**
   * デフォルトアラートルール初期化
   */
  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        description: 'Triggers when error rate exceeds 10%',
        enabled: true,
        conditions: {
          errorRate: 0.1,
          timeWindow: 5 * 60 * 1000, // 5分
        },
        severity: AlertSeverity.HIGH,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SLACK],
        cooldown: 15 * 60 * 1000, // 15分
        recipients: {
          email: [process.env.ADMIN_EMAIL || 'admin@example.com'],
          slack: ['#alerts'],
        },
        template: 'high-error-rate',
      },
      {
        id: 'critical-errors',
        name: 'Critical Errors',
        description: 'Triggers on FATAL or ERROR level logs',
        enabled: true,
        conditions: {
          logLevel: LogLevel.ERROR,
          timeWindow: 1 * 60 * 1000, // 1分
        },
        severity: AlertSeverity.CRITICAL,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SLACK],
        cooldown: 5 * 60 * 1000, // 5分
        recipients: {
          email: [process.env.ADMIN_EMAIL || 'admin@example.com'],
          slack: ['#critical-alerts'],
        },
        template: 'critical-error',
      },
      {
        id: 'slow-response-time',
        name: 'Slow Response Time',
        description: 'Triggers when average response time exceeds 5 seconds',
        enabled: true,
        conditions: {
          responseTime: 5000,
          timeWindow: 10 * 60 * 1000, // 10分
        },
        severity: AlertSeverity.MEDIUM,
        channels: [NotificationChannel.SLACK],
        cooldown: 30 * 60 * 1000, // 30分
        recipients: {
          slack: ['#performance'],
        },
        template: 'slow-response',
      },
      {
        id: 'authentication-failures',
        name: 'Authentication Failures',
        description: 'Multiple authentication failures detected',
        enabled: true,
        conditions: {
          message: 'authentication',
          frequency: 10,
          timeWindow: 5 * 60 * 1000, // 5分
        },
        severity: AlertSeverity.HIGH,
        channels: [NotificationChannel.EMAIL],
        cooldown: 10 * 60 * 1000, // 10分
        recipients: {
          email: [process.env.SECURITY_EMAIL || 'security@example.com'],
        },
        template: 'auth-failure',
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * 通知テンプレート初期化
   */
  private initializeTemplates(): void {
    this.templates.set('high-error-rate', {
      subject: '[ALERT] High Error Rate Detected - {{component}}',
      body: `
High error rate detected in component: {{component}}

Error Rate: {{errorRate}}%
Time Window: {{timeWindow}}ms
Timestamp: {{timestamp}}

Please investigate immediately.
      `,
      variables: {},
    });

    this.templates.set('critical-error', {
      subject: '[CRITICAL] Critical Error - {{component}}',
      body: `
Critical error detected:

Component: {{component}}
Message: {{message}}
Error: {{error}}
Timestamp: {{timestamp}}

Immediate attention required!
      `,
      variables: {},
    });

    this.templates.set('slow-response', {
      subject: '[WARNING] Slow Response Time - {{component}}',
      body: `
Slow response time detected:

Component: {{component}}
Average Response Time: {{responseTime}}ms
Threshold: {{threshold}}ms
Timestamp: {{timestamp}}

Performance degradation detected.
      `,
      variables: {},
    });

    this.templates.set('auth-failure', {
      subject: '[SECURITY] Multiple Authentication Failures',
      body: `
Multiple authentication failures detected:

Failures: {{count}} in {{timeWindow}}ms
IP Addresses: {{ipAddresses}}
Timestamp: {{timestamp}}

Potential security threat detected.
      `,
      variables: {},
    });
  }

  /**
   * アラートルール追加
   */
  addRule(rule: AlertRule): void {
    try {
      AlertRuleSchema.parse(rule);
      this.rules.set(rule.id, rule);
      console.log(`[Alert] Added rule: ${rule.name}`);
    } catch (error) {
      console.error('[Alert] Invalid rule:', error);
      throw error;
    }
  }

  /**
   * アラートルール更新
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    try {
      AlertRuleSchema.parse(updatedRule);
      this.rules.set(ruleId, updatedRule);
      console.log(`[Alert] Updated rule: ${rule.name}`);
      return true;
    } catch (error) {
      console.error('[Alert] Invalid rule update:', error);
      return false;
    }
  }

  /**
   * アラートルール削除
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * ログエントリからアラートチェック
   */
  async checkLogEntry(entry: LogEntry): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (await this.evaluateLogRule(rule, entry)) {
        await this.triggerAlert(rule, entry);
      }
    }
  }

  /**
   * メトリクスからアラートチェック
   */
  async checkMetrics(metrics: {
    errorRate?: number;
    responseTime?: number;
    component: string;
    [key: string]: any;
  }): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (this.evaluateMetricRule(rule, metrics)) {
        await this.triggerMetricAlert(rule, metrics);
      }
    }
  }

  /**
   * ログルール評価
   */
  private async evaluateLogRule(rule: AlertRule, entry: LogEntry): Promise<boolean> {
    const { conditions } = rule;

    // ログレベルチェック
    if (conditions.logLevel !== undefined && entry.level !== conditions.logLevel) {
      return false;
    }

    // コンポーネントチェック
    if (conditions.component && entry.component !== conditions.component) {
      return false;
    }

    // メッセージチェック
    if (conditions.message && !entry.message.toLowerCase().includes(conditions.message.toLowerCase())) {
      return false;
    }

    // 頻度チェック（時間窓内の同様イベント数）
    if (conditions.frequency !== undefined) {
      const recentCount = await this.countRecentSimilarEntries(rule, entry);
      if (recentCount < conditions.frequency) {
        return false;
      }
    }

    return true;
  }

  /**
   * メトリクスルール評価
   */
  private evaluateMetricRule(rule: AlertRule, metrics: Record<string, any>): boolean {
    const { conditions } = rule;

    // エラー率チェック
    if (conditions.errorRate !== undefined && 
        (metrics.errorRate === undefined || metrics.errorRate < conditions.errorRate)) {
      return false;
    }

    // レスポンス時間チェック
    if (conditions.responseTime !== undefined && 
        (metrics.responseTime === undefined || metrics.responseTime < conditions.responseTime)) {
      return false;
    }

    // コンポーネントチェック
    if (conditions.component && metrics.component !== conditions.component) {
      return false;
    }

    return true;
  }

  /**
   * 類似エントリの最近のカウント
   */
  private async countRecentSimilarEntries(rule: AlertRule, entry: LogEntry): Promise<number> {
    // 実際の実装では、ログストレージにクエリを実行
    // ここでは簡略化してカウント1を返す
    return 1;
  }

  /**
   * ログアラート発火
   */
  private async triggerAlert(rule: AlertRule, entry: LogEntry): Promise<void> {
    // クールダウンチェック
    const lastTrigger = this.lastTriggerTimes.get(rule.id) || 0;
    const now = Date.now();
    
    if (now - lastTrigger < rule.cooldown) {
      return;
    }

    const alertEvent: AlertEvent = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      severity: rule.severity,
      title: rule.name,
      message: entry.message,
      timestamp: new Date(),
      metadata: {
        component: entry.component,
        logLevel: LogLevel[entry.level],
        userId: entry.userId,
        error: entry.error,
        httpContext: entry.httpContext,
      },
      resolved: false,
      notifications: [],
    };

    // アラートを保存
    this.activeAlerts.set(alertEvent.id, alertEvent);
    this.lastTriggerTimes.set(rule.id, now);

    // 通知送信
    await this.sendNotifications(rule, alertEvent);

    console.log(`[Alert] Triggered: ${rule.name} (${rule.severity})`);
  }

  /**
   * メトリクスアラート発火
   */
  private async triggerMetricAlert(rule: AlertRule, metrics: Record<string, any>): Promise<void> {
    // クールダウンチェック
    const lastTrigger = this.lastTriggerTimes.get(rule.id) || 0;
    const now = Date.now();
    
    if (now - lastTrigger < rule.cooldown) {
      return;
    }

    const alertEvent: AlertEvent = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      severity: rule.severity,
      title: rule.name,
      message: `Metric threshold exceeded: ${JSON.stringify(metrics)}`,
      timestamp: new Date(),
      metadata: metrics,
      resolved: false,
      notifications: [],
    };

    // アラートを保存
    this.activeAlerts.set(alertEvent.id, alertEvent);
    this.lastTriggerTimes.set(rule.id, now);

    // 通知送信
    await this.sendNotifications(rule, alertEvent);

    console.log(`[Alert] Triggered: ${rule.name} (${rule.severity})`);
  }

  /**
   * 通知送信
   */
  private async sendNotifications(rule: AlertRule, alertEvent: AlertEvent): Promise<void> {
    const template = this.templates.get(rule.template || 'default');
    if (!template) {
      console.error(`[Alert] Template not found: ${rule.template}`);
      return;
    }

    for (const channel of rule.channels) {
      const provider = this.providers.get(channel);
      if (!provider) {
        console.warn(`[Alert] Provider not configured for channel: ${channel}`);
        continue;
      }

      const recipients = this.getRecipients(rule, channel);
      
      for (const recipient of recipients) {
        try {
          const result = await provider.send(recipient, template, {
            ...alertEvent.metadata,
            severity: alertEvent.severity,
            timestamp: alertEvent.timestamp.toISOString(),
            alertId: alertEvent.id,
            ruleName: rule.name,
          });

          alertEvent.notifications.push({
            channel,
            recipient,
            sentAt: new Date(),
            status: result.success ? 'sent' : 'failed',
            error: result.error,
          });

          if (!result.success) {
            console.error(`[Alert] Failed to send ${channel} notification to ${recipient}:`, result.error);
          }
        } catch (error) {
          console.error(`[Alert] Error sending ${channel} notification:`, error);
          
          alertEvent.notifications.push({
            channel,
            recipient,
            sentAt: new Date(),
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }

  /**
   * チャネル別受信者取得
   */
  private getRecipients(rule: AlertRule, channel: NotificationChannel): string[] {
    switch (channel) {
      case NotificationChannel.EMAIL:
        return rule.recipients.email || [];
      case NotificationChannel.SLACK:
        return rule.recipients.slack || [];
      case NotificationChannel.WEBHOOK:
        return rule.recipients.webhook || [];
      case NotificationChannel.SMS:
        return rule.recipients.sms || [];
      default:
        return [];
    }
  }

  /**
   * アラートID生成
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * アラート解決
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();
    
    console.log(`[Alert] Resolved: ${alert.title} (${alert.id})`);
    return true;
  }

  /**
   * アクティブアラート取得
   */
  getActiveAlerts(): AlertEvent[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * アラート履歴取得
   */
  getAlertHistory(limit: number = 100): AlertEvent[] {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * アラートルール一覧取得
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 統計情報取得
   */
  getStatistics(): {
    totalRules: number;
    activeRules: number;
    activeAlerts: number;
    alertsBySevertiy: Record<AlertSeverity, number>;
  } {
    const activeAlerts = this.getActiveAlerts();
    const alertsBySevertiy = {
      [AlertSeverity.LOW]: 0,
      [AlertSeverity.MEDIUM]: 0,
      [AlertSeverity.HIGH]: 0,
      [AlertSeverity.CRITICAL]: 0,
    };

    for (const alert of activeAlerts) {
      alertsBySevertiy[alert.severity]++;
    }

    return {
      totalRules: this.rules.size,
      activeRules: Array.from(this.rules.values()).filter(rule => rule.enabled).length,
      activeAlerts: activeAlerts.length,
      alertsBySevertiy,
    };
  }
}

/**
 * グローバルアラート通知システム
 */
export const alertNotificationSystem = new AlertNotificationSystem();