'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Activity, Clock, Users, Server, Shield, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

// =============================================================================
// リアルタイム監視ダッシュボード
// ライブメトリクス、アラート、ログビューアの統合UI
// =============================================================================

/**
 * システムメトリクス型定義
 */
interface SystemMetrics {
  timestamp: Date;
  cpu: number;
  memory: number;
  disk: number;
  network: {
    inbound: number;
    outbound: number;
  };
  activeConnections: number;
  requestsPerSecond: number;
  responseTime: number;
  errorRate: number;
}

/**
 * ライブアラート型定義
 */
interface LiveAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  component: string;
  timestamp: Date;
  resolved: boolean;
}

/**
 * ログエントリ型定義
 */
interface LogEntry {
  timestamp: Date;
  level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  component: string;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * メトリクスカード
 */
interface MetricsCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color?: 'green' | 'yellow' | 'red' | 'blue';
}

const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  unit = '',
  trend = 'neutral',
  icon,
  color = 'blue'
}) => {
  const colorClasses = {
    green: 'text-green-600 bg-green-50 border-green-200',
    yellow: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    red: 'text-red-600 bg-red-50 border-red-200',
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
  };

  const trendIcon = {
    up: <TrendingUp className="h-4 w-4 text-green-500" />,
    down: <TrendingDown className="h-4 w-4 text-red-500" />,
    neutral: null,
  };

  return (
    <Card className={`${colorClasses[color]} border-2`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {icon}
            <span className="text-sm font-medium">{title}</span>
          </div>
          {trendIcon[trend]}
        </div>
        <div className="mt-2">
          <span className="text-2xl font-bold">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * アラートリスト
 */
interface AlertListProps {
  alerts: LiveAlert[];
  onResolve: (alertId: string) => void;
}

const AlertList: React.FC<AlertListProps> = ({ alerts, onResolve }) => {
  const getSeverityColor = (severity: LiveAlert['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: LiveAlert['severity']) => {
    return <AlertTriangle className="h-4 w-4" />;
  };

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>アクティブなアラートはありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <Card key={alert.id} className={`border-l-4 ${getSeverityColor(alert.severity)}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                {getSeverityIcon(alert.severity)}
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-semibold">{alert.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {alert.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                    <span>コンポーネント: {alert.component}</span>
                    <span>時刻: {alert.timestamp.toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onResolve(alert.id)}
                className="text-xs"
              >
                解決
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/**
 * ログビューア
 */
interface LogViewerProps {
  logs: LogEntry[];
  onRefresh: () => void;
  onFilter: (level?: string, component?: string, search?: string) => void;
}

const LogViewer: React.FC<LogViewerProps> = ({ logs, onRefresh, onFilter }) => {
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [componentFilter, setComponentFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const handleFilterChange = useCallback(() => {
    onFilter(
      levelFilter || undefined,
      componentFilter || undefined,
      searchFilter || undefined
    );
  }, [levelFilter, componentFilter, searchFilter, onFilter]);

  useEffect(() => {
    handleFilterChange();
  }, [handleFilterChange]);

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'ERROR':
      case 'FATAL':
        return 'text-red-600 bg-red-50';
      case 'WARN':
        return 'text-yellow-600 bg-yellow-50';
      case 'INFO':
        return 'text-blue-600 bg-blue-50';
      case 'DEBUG':
        return 'text-gray-600 bg-gray-50';
      case 'TRACE':
        return 'text-gray-500 bg-gray-25';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const uniqueComponents = useMemo(() => {
    const components = new Set(logs.map(log => log.component));
    return Array.from(components).sort();
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* フィルターコントロール */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <select 
            value={levelFilter} 
            onChange={(e) => setLevelFilter(e.target.value)}
            className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全レベル</option>
            <option value="FATAL">FATAL</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
            <option value="TRACE">TRACE</option>
          </select>

          <select 
            value={componentFilter} 
            onChange={(e) => setComponentFilter(e.target.value)}
            className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全コンポーネント</option>
            {uniqueComponents.map(component => (
              <option key={component} value={component}>
                {component}
              </option>
            ))}
          </select>

          <Input
            placeholder="検索..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-64"
          />
        </div>

        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          更新
        </Button>
      </div>

      {/* ログエントリ */}
      <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto text-sm font-mono">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            ログがありません
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start space-x-2 text-white">
                <span className="text-gray-400 text-xs min-w-20">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <Badge
                  variant="secondary"
                  className={`text-xs min-w-12 ${getLevelColor(log.level)}`}
                >
                  {log.level}
                </Badge>
                <span className="text-yellow-300 text-xs min-w-24 truncate">
                  {log.component}
                </span>
                <span className="flex-1 text-green-300 break-all">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * リアルタイム監視ダッシュボード
 */
export const RealTimeMonitoringDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    timestamp: new Date(),
    cpu: 45.2,
    memory: 68.7,
    disk: 34.1,
    network: { inbound: 125.4, outbound: 89.2 },
    activeConnections: 142,
    requestsPerSecond: 23.5,
    responseTime: 234,
    errorRate: 2.1,
  });

  const [alerts, setAlerts] = useState<LiveAlert[]>([
    {
      id: 'alert-1',
      severity: 'high',
      title: 'High Memory Usage',
      message: 'Memory usage has exceeded 90% for the past 5 minutes',
      component: 'system',
      timestamp: new Date(Date.now() - 300000),
      resolved: false,
    },
    {
      id: 'alert-2',
      severity: 'medium',
      title: 'Slow API Response',
      message: 'API response time is above 2 seconds',
      component: 'api-server',
      timestamp: new Date(Date.now() - 600000),
      resolved: false,
    },
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      timestamp: new Date(),
      level: 'INFO',
      component: 'api-server',
      message: 'Server started successfully on port 3000',
    },
    {
      timestamp: new Date(Date.now() - 30000),
      level: 'WARN',
      component: 'database',
      message: 'Connection pool is running low: 5 connections remaining',
    },
    {
      timestamp: new Date(Date.now() - 60000),
      level: 'ERROR',
      component: 'auth-service',
      message: 'Failed to authenticate user: invalid token',
    },
  ]);

  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  // リアルタイムデータ更新
  useEffect(() => {
    if (!isAutoRefresh) return;

    const interval = setInterval(() => {
      // メトリクス更新（模擬データ）
      setMetrics(prev => ({
        ...prev,
        timestamp: new Date(),
        cpu: Math.max(0, Math.min(100, prev.cpu + (Math.random() - 0.5) * 10)),
        memory: Math.max(0, Math.min(100, prev.memory + (Math.random() - 0.5) * 5)),
        requestsPerSecond: Math.max(0, prev.requestsPerSecond + (Math.random() - 0.5) * 5),
        responseTime: Math.max(50, prev.responseTime + (Math.random() - 0.5) * 50),
        errorRate: Math.max(0, Math.min(100, prev.errorRate + (Math.random() - 0.5) * 2)),
      }));

      // ログ追加（模擬データ）
      if (Math.random() < 0.3) {
        const levels: LogEntry['level'][] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
        const components = ['api-server', 'database', 'auth-service', 'cache-service'];
        const messages = [
          'Request processed successfully',
          'Database query completed',
          'Cache miss for key: user:123',
          'Memory usage is high',
          'New user registered',
        ];

        const newLog: LogEntry = {
          timestamp: new Date(),
          level: levels[Math.floor(Math.random() * levels.length)],
          component: components[Math.floor(Math.random() * components.length)],
          message: messages[Math.floor(Math.random() * messages.length)],
        };

        setLogs(prev => [newLog, ...prev.slice(0, 99)]);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  const handleResolveAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  }, []);

  const handleRefreshLogs = useCallback(() => {
    // ログ再読み込み処理
    console.log('Refreshing logs...');
  }, []);

  const handleFilterLogs = useCallback((level?: string, component?: string, search?: string) => {
    // ログフィルタリング処理
    console.log('Filtering logs:', { level, component, search });
  }, []);

  const activeAlerts = alerts.filter(alert => !alert.resolved);

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">リアルタイム監視</h1>
        <div className="flex items-center space-x-4">
          <Button
            variant={isAutoRefresh ? 'default' : 'outline'}
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            size="sm"
          >
            <Activity className="h-4 w-4 mr-2" />
            {isAutoRefresh ? '自動更新中' : '自動更新停止'}
          </Button>
          <div className="text-sm text-gray-500">
            最終更新: {metrics.timestamp.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* メトリクスカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricsCard
          title="CPU 使用率"
          value={metrics.cpu.toFixed(1)}
          unit="%"
          trend={metrics.cpu > 80 ? 'up' : metrics.cpu < 30 ? 'down' : 'neutral'}
          icon={<Activity className="h-5 w-5" />}
          color={metrics.cpu > 80 ? 'red' : metrics.cpu > 60 ? 'yellow' : 'green'}
        />
        <MetricsCard
          title="メモリ使用率"
          value={metrics.memory.toFixed(1)}
          unit="%"
          trend={metrics.memory > 85 ? 'up' : metrics.memory < 40 ? 'down' : 'neutral'}
          icon={<Server className="h-5 w-5" />}
          color={metrics.memory > 85 ? 'red' : metrics.memory > 70 ? 'yellow' : 'green'}
        />
        <MetricsCard
          title="リクエスト/秒"
          value={metrics.requestsPerSecond.toFixed(1)}
          unit="req/s"
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
        />
        <MetricsCard
          title="レスポンス時間"
          value={metrics.responseTime.toFixed(0)}
          unit="ms"
          trend={metrics.responseTime > 1000 ? 'up' : 'neutral'}
          icon={<Clock className="h-5 w-5" />}
          color={metrics.responseTime > 1000 ? 'red' : metrics.responseTime > 500 ? 'yellow' : 'green'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* アラート */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5" />
                <span>アクティブアラート</span>
              </div>
              <Badge variant="secondary">
                {activeAlerts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AlertList alerts={activeAlerts} onResolve={handleResolveAlert} />
          </CardContent>
        </Card>

        {/* システム統計 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>システム統計</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>アクティブ接続</span>
                <Badge variant="outline">{metrics.activeConnections}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>エラー率</span>
                <Badge
                  variant="outline"
                  className={metrics.errorRate > 5 ? 'text-red-600' : 'text-green-600'}
                >
                  {metrics.errorRate.toFixed(1)}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>ネットワーク受信</span>
                <Badge variant="outline">{metrics.network.inbound.toFixed(1)} MB/s</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>ネットワーク送信</span>
                <Badge variant="outline">{metrics.network.outbound.toFixed(1)} MB/s</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ログビューア */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>リアルタイムログ</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LogViewer
            logs={logs}
            onRefresh={handleRefreshLogs}
            onFilter={handleFilterLogs}
          />
        </CardContent>
      </Card>
    </div>
  );
};