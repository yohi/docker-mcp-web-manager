'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Server,
  Database,
  Shield,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Clock,
  Users,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// システムヘルスダッシュボード
// リアルタイムシステム監視とパフォーマンス分析を提供
// =============================================================================

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    temperature?: number;
    trend: 'up' | 'down' | 'stable';
  };
  memory: {
    usage: number;
    total: number;
    used: number;
    available: number;
    trend: 'up' | 'down' | 'stable';
  };
  disk: {
    usage: number;
    total: number;
    used: number;
    available: number;
    iops: number;
    trend: 'up' | 'down' | 'stable';
  };
  network: {
    inbound: number;
    outbound: number;
    connections: number;
    latency: number;
    trend: 'up' | 'down' | 'stable';
  };
}

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  uptime: number;
  responseTime: number;
  version: string;
  lastCheck: string;
  message?: string;
}

interface SystemHealthDashboardProps {
  className?: string;
  compact?: boolean;
}

const mockMetrics: SystemMetrics = {
  cpu: { usage: 45.2, cores: 8, temperature: 62, trend: 'stable' },
  memory: { usage: 68.5, total: 16, used: 11, available: 5, trend: 'up' },
  disk: { usage: 34.8, total: 500, used: 174, available: 326, iops: 1250, trend: 'down' },
  network: { inbound: 15.2, outbound: 8.7, connections: 145, latency: 12, trend: 'stable' }
};

const mockServices: ServiceHealth[] = [
  {
    name: 'Docker MCP Gateway',
    status: 'healthy',
    uptime: 2592000,
    responseTime: 15,
    version: '2.0.0',
    lastCheck: new Date().toISOString(),
    message: 'All systems operational'
  },
  {
    name: 'Database (SQLite)',
    status: 'healthy',
    uptime: 2590000,
    responseTime: 3,
    version: '3.45.0',
    lastCheck: new Date().toISOString()
  },
  {
    name: 'Web Server (Next.js)',
    status: 'healthy',
    uptime: 86400,
    responseTime: 45,
    version: '15.5.2',
    lastCheck: new Date().toISOString()
  },
  {
    name: 'Notification System',
    status: 'warning',
    uptime: 3600,
    responseTime: 120,
    version: '1.0.0',
    lastCheck: new Date().toISOString(),
    message: 'High response time detected'
  },
  {
    name: 'Bitwarden Sync',
    status: 'offline',
    uptime: 0,
    responseTime: 0,
    version: 'N/A',
    lastCheck: new Date(Date.now() - 3600000).toISOString(),
    message: 'Service unavailable'
  }
];

export function SystemHealthDashboard({ className, compact = false }: SystemHealthDashboardProps) {
  const [metrics, setMetrics] = useState<SystemMetrics>(mockMetrics);
  const [services, setServices] = useState<ServiceHealth[]>(mockServices);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 30000); // 30秒ごとに更新
    return () => clearInterval(interval);
  }, []);

  const fetchHealthData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 実際の実装では、API エンドポイントから取得
      // const response = await fetch('/api/v1/health/metrics');
      // const data = await response.json();
      
      // モックデータの更新（わずかな変動をシミュレート）
      setMetrics(prev => ({
        cpu: {
          ...prev.cpu,
          usage: Math.max(0, Math.min(100, prev.cpu.usage + (Math.random() - 0.5) * 10)),
          temperature: Math.max(40, Math.min(80, (prev.cpu.temperature || 60) + (Math.random() - 0.5) * 5))
        },
        memory: {
          ...prev.memory,
          usage: Math.max(0, Math.min(95, prev.memory.usage + (Math.random() - 0.5) * 5)),
        },
        disk: {
          ...prev.disk,
          iops: Math.max(0, prev.disk.iops + (Math.random() - 0.5) * 200),
        },
        network: {
          ...prev.network,
          inbound: Math.max(0, prev.network.inbound + (Math.random() - 0.5) * 3),
          outbound: Math.max(0, prev.network.outbound + (Math.random() - 0.5) * 2),
          latency: Math.max(1, prev.network.latency + (Math.random() - 0.5) * 5),
        }
      }));

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch health data:', error);
      setError('ヘルスデータの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      case 'offline': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBadge = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          正常
        </Badge>;
      case 'warning':
        return <Badge variant="secondary" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          警告
        </Badge>;
      case 'critical':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          重大
        </Badge>;
      case 'offline':
        return <Badge variant="outline" className="flex items-center gap-1">
          <Minus className="h-3 w-3" />
          オフライン
        </Badge>;
      default:
        return <Badge variant="secondary">不明</Badge>;
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3 w-3 text-red-500" />;
      case 'down':
        return <TrendingDown className="h-3 w-3 text-green-500" />;
      case 'stable':
        return <Minus className="h-3 w-3 text-gray-500" />;
    }
  };

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return 'text-red-500';
    if (usage >= 80) return 'text-yellow-500';
    if (usage >= 70) return 'text-orange-500';
    return 'text-green-500';
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}日${hours}時間`;
    if (hours > 0) return `${hours}時間${Math.floor((seconds % 3600) / 60)}分`;
    return `${Math.floor(seconds / 60)}分`;
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 ** 3);
    return `${gb.toFixed(1)}GB`;
  };

  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              システムステータス
            </div>
            <Button variant="ghost" size="sm" onClick={fetchHealthData} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>CPU</span>
                <span className={getUsageColor(metrics.cpu.usage)}>
                  {metrics.cpu.usage.toFixed(1)}%
                </span>
              </div>
              <Progress value={metrics.cpu.usage} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>メモリ</span>
                <span className={getUsageColor(metrics.memory.usage)}>
                  {metrics.memory.usage.toFixed(1)}%
                </span>
              </div>
              <Progress value={metrics.memory.usage} className="h-2" />
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-2">
            {services.slice(0, 3).map((service) => (
              <div key={service.name} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{service.name}</span>
                {getStatusBadge(service.status)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* エラー表示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            システムヘルス監視
          </h2>
          <p className="text-sm text-muted-foreground">
            最終更新: {lastUpdate.toLocaleTimeString('ja-JP')}
          </p>
        </div>
        <Button variant="outline" onClick={fetchHealthData} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          更新
        </Button>
      </div>

      {/* メトリクスカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-blue-500" />
                <span className="font-medium">CPU</span>
              </div>
              {getTrendIcon(metrics.cpu.trend)}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold">{metrics.cpu.usage.toFixed(1)}%</span>
                <Badge variant="outline">{metrics.cpu.cores}コア</Badge>
              </div>
              <Progress value={metrics.cpu.usage} className="h-2" />
              {metrics.cpu.temperature && (
                <div className="text-xs text-muted-foreground">
                  温度: {metrics.cpu.temperature}°C
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* メモリ */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MemoryStick className="h-5 w-5 text-green-500" />
                <span className="font-medium">メモリ</span>
              </div>
              {getTrendIcon(metrics.memory.trend)}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold">{metrics.memory.usage.toFixed(1)}%</span>
                <Badge variant="outline">{formatBytes(metrics.memory.total)}</Badge>
              </div>
              <Progress value={metrics.memory.usage} className="h-2" />
              <div className="text-xs text-muted-foreground">
                使用中: {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ディスク */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-purple-500" />
                <span className="font-medium">ディスク</span>
              </div>
              {getTrendIcon(metrics.disk.trend)}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold">{metrics.disk.usage.toFixed(1)}%</span>
                <Badge variant="outline">{formatBytes(metrics.disk.total)}</Badge>
              </div>
              <Progress value={metrics.disk.usage} className="h-2" />
              <div className="text-xs text-muted-foreground">
                IOPS: {metrics.disk.iops.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ネットワーク */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-orange-500" />
                <span className="font-medium">ネットワーク</span>
              </div>
              {getTrendIcon(metrics.network.trend)}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold">{metrics.network.latency}ms</span>
                <Badge variant="outline">{metrics.network.connections}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div>↓ {metrics.network.inbound.toFixed(1)}MB/s</div>
                <div>↑ {metrics.network.outbound.toFixed(1)}MB/s</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* サービスステータス */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            サービスステータス
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className={cn('h-3 w-3 rounded-full', {
                    'bg-green-500': service.status === 'healthy',
                    'bg-yellow-500': service.status === 'warning',
                    'bg-red-500': service.status === 'critical',
                    'bg-gray-500': service.status === 'offline',
                  })} />
                  
                  <div>
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4">
                      <span>v{service.version}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatUptime(service.uptime)}
                      </span>
                      <span>{service.responseTime}ms</span>
                    </div>
                    {service.message && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {service.message}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {getStatusBadge(service.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* システム概要 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Zap className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold text-green-600">
                  {services.filter(s => s.status === 'healthy').length}
                </p>
                <p className="text-sm text-muted-foreground">正常サービス</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-semibold text-yellow-600">
                  {services.filter(s => s.status === 'warning').length}
                </p>
                <p className="text-sm text-muted-foreground">警告</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-semibold text-red-600">
                  {services.filter(s => s.status === 'critical' || s.status === 'offline').length}
                </p>
                <p className="text-sm text-muted-foreground">障害</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}