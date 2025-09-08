'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play,
  Square,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Download,
  Filter,
  Search,
  Loader2,
  TestTube,
  Target,
  Zap
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// TestRunner - テスト実行・結果表示コンポーネント
// MCPサーバーのテスト実行、結果表示、レポート生成を提供
// =============================================================================

interface TestSuite {
  id: string;
  name: string;
  description?: string;
  serverId: string;
  serverName: string;
  testType: 'unit' | 'integration' | 'e2e' | 'security' | 'performance';
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration?: number; // milliseconds
  coverage?: number; // percentage
  createdAt: string;
  lastRunAt?: string;
  configuration?: {
    timeout: number;
    retries: number;
    parallel: boolean;
    environments: string[];
  };
}

interface TestResult {
  id: string;
  suiteId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  output?: string;
  assertions: {
    total: number;
    passed: number;
    failed: number;
  };
  tags?: string[];
}

interface TestRunnerProps {
  serverId?: string;
  testSuites?: TestSuite[];
  testResults?: TestResult[];
  isLoading?: boolean;
  error?: string | null;
  onRunTests?: (suiteIds: string[]) => Promise<void>;
  onStopTests?: (suiteIds: string[]) => Promise<void>;
  onRefresh?: () => void;
  className?: string;
}

type TestFilter = 'all' | 'passed' | 'failed' | 'skipped';
type SuiteFilter = 'all' | 'unit' | 'integration' | 'e2e' | 'security' | 'performance';

/**
 * テスト状態のスタイリング情報を取得
 */
function getTestStatusInfo(status: string) {
  switch (status) {
    case 'passed':
      return {
        badge: 'success',
        label: '成功',
        icon: CheckCircle,
        iconColor: 'text-green-500'
      };
    case 'failed':
      return {
        badge: 'destructive',
        label: '失敗',
        icon: XCircle,
        iconColor: 'text-red-500'
      };
    case 'skipped':
      return {
        badge: 'secondary',
        label: 'スキップ',
        icon: AlertTriangle,
        iconColor: 'text-yellow-500'
      };
    case 'running':
      return {
        badge: 'info',
        label: '実行中',
        icon: Loader2,
        iconColor: 'text-blue-500 animate-spin'
      };
    default:
      return {
        badge: 'outline',
        label: '未実行',
        icon: Clock,
        iconColor: 'text-gray-400'
      };
  }
}

/**
 * テスト実行時間をフォーマット
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * テストランナーコンポーネント
 */
export function TestRunner({
  serverId,
  testSuites = [],
  testResults = [],
  isLoading = false,
  error = null,
  onRunTests,
  onStopTests,
  onRefresh,
  className
}: TestRunnerProps) {
  const { hasPermission } = usePermissions();
  const [selectedSuites, setSelectedSuites] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'suites' | 'results'>('suites');
  const [suiteFilter, setSuiteFilter] = useState<SuiteFilter>('all');
  const [testFilter, setTestFilter] = useState<TestFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 権限チェック
  const canRunTests = hasPermission('TESTS_EXECUTE');
  const canViewResults = hasPermission('TESTS_READ');

  // フィルタリングされたテストスイート
  const filteredSuites = testSuites.filter(suite => {
    if (serverId && suite.serverId !== serverId) return false;
    if (suiteFilter !== 'all' && suite.testType !== suiteFilter) return false;
    if (searchQuery && !suite.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // フィルタリングされたテスト結果
  const filteredResults = testResults.filter(result => {
    if (testFilter !== 'all' && result.status !== testFilter) return false;
    if (searchQuery && !result.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // 統計情報の計算
  const statistics = {
    totalSuites: filteredSuites.length,
    runningSuites: filteredSuites.filter(s => s.status === 'running').length,
    completedSuites: filteredSuites.filter(s => s.status === 'completed').length,
    failedSuites: filteredSuites.filter(s => s.status === 'failed').length,
    totalTests: filteredResults.length,
    passedTests: filteredResults.filter(r => r.status === 'passed').length,
    failedTests: filteredResults.filter(r => r.status === 'failed').length,
    skippedTests: filteredResults.filter(r => r.status === 'skipped').length,
    averageDuration: filteredResults.length > 0 
      ? filteredResults.reduce((sum, r) => sum + r.duration, 0) / filteredResults.length 
      : 0
  };

  // テスト実行
  const handleRunTests = async () => {
    if (!onRunTests || selectedSuites.length === 0 || isRunning) return;
    
    setIsRunning(true);
    try {
      await onRunTests(selectedSuites);
    } catch (error) {
      console.error('[TEST_RUNNER] Run failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // テスト停止
  const handleStopTests = async () => {
    if (!onStopTests || selectedSuites.length === 0 || !isRunning) return;
    
    try {
      await onStopTests(selectedSuites);
    } catch (error) {
      console.error('[TEST_RUNNER] Stop failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // スイート選択の切り替え
  const toggleSuiteSelection = (suiteId: string) => {
    setSelectedSuites(prev =>
      prev.includes(suiteId)
        ? prev.filter(id => id !== suiteId)
        : [...prev, suiteId]
    );
  };

  // 全選択/全解除
  const toggleSelectAll = () => {
    if (selectedSuites.length === filteredSuites.length) {
      setSelectedSuites([]);
    } else {
      setSelectedSuites(filteredSuites.map(s => s.id));
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">テスト管理</h1>
          <p className="text-sm text-gray-600">
            MCPサーバーのテスト実行と結果確認を行います
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              更新
            </Button>
          )}
          
          {canRunTests && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopTests}
                disabled={!isRunning || selectedSuites.length === 0}
              >
                <Square className="h-4 w-4 mr-2" />
                停止
              </Button>
              <Button
                size="sm"
                onClick={handleRunTests}
                disabled={isRunning || selectedSuites.length === 0}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                テスト実行
              </Button>
            </>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TestTube className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-semibold">{statistics.totalSuites}</p>
                <p className="text-sm text-gray-600">テストスイート</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold">{statistics.totalTests}</p>
                <p className="text-sm text-gray-600">総テスト数</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold text-green-600">{statistics.passedTests}</p>
                <p className="text-sm text-gray-600">成功</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Zap className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-semibold">
                  {statistics.averageDuration ? formatDuration(statistics.averageDuration) : '-'}
                </p>
                <p className="text-sm text-gray-600">平均実行時間</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 検索・フィルター */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="テスト名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              
              <select
                value={suiteFilter}
                onChange={(e) => setSuiteFilter(e.target.value as SuiteFilter)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">全スイート</option>
                <option value="unit">単体テスト</option>
                <option value="integration">統合テスト</option>
                <option value="e2e">E2Eテスト</option>
                <option value="security">セキュリティ</option>
                <option value="performance">パフォーマンス</option>
              </select>

              <select
                value={testFilter}
                onChange={(e) => setTestFilter(e.target.value as TestFilter)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">全結果</option>
                <option value="passed">成功のみ</option>
                <option value="failed">失敗のみ</option>
                <option value="skipped">スキップのみ</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* タブナビゲーション */}
      <Card>
        <CardHeader>
          <div className="flex space-x-1">
            <Button
              variant={activeTab === 'suites' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('suites')}
            >
              <TestTube className="h-4 w-4 mr-2" />
              テストスイート
            </Button>
            <Button
              variant={activeTab === 'results' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('results')}
              disabled={!canViewResults}
            >
              <FileText className="h-4 w-4 mr-2" />
              テスト結果
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* テストスイートタブ */}
          {activeTab === 'suites' && (
            <div className="space-y-4">
              {canRunTests && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedSuites.length === filteredSuites.length && filteredSuites.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-600">
                      {selectedSuites.length > 0 ? `${selectedSuites.length}個選択中` : '全選択'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-500">
                    {statistics.runningSuites > 0 && (
                      <span className="text-blue-600">
                        {statistics.runningSuites}個実行中
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : filteredSuites.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    該当するテストスイートがありません
                  </div>
                ) : (
                  filteredSuites.map((suite) => {
                    const statusInfo = getTestStatusInfo(suite.status);
                    const StatusIcon = statusInfo.icon;
                    const successRate = suite.totalTests > 0 
                      ? Math.round((suite.passedTests / suite.totalTests) * 100) 
                      : 0;

                    return (
                      <Card key={suite.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start space-x-4">
                            {canRunTests && (
                              <input
                                type="checkbox"
                                checked={selectedSuites.includes(suite.id)}
                                onChange={() => toggleSuiteSelection(suite.id)}
                                className="mt-1 rounded border-gray-300"
                              />
                            )}
                            
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-3">
                                  <h3 className="font-medium">{suite.name}</h3>
                                  <StatusIcon className={`h-4 w-4 ${statusInfo.iconColor}`} />
                                  <Badge variant={statusInfo.badge as any}>
                                    {statusInfo.label}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {suite.testType}
                                  </Badge>
                                </div>
                                
                                <div className="text-sm text-gray-500">
                                  {suite.serverName}
                                </div>
                              </div>
                              
                              {suite.description && (
                                <p className="text-sm text-gray-600 mb-2">{suite.description}</p>
                              )}
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500">総テスト:</span>
                                  <span className="ml-1 font-medium">{suite.totalTests}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">成功率:</span>
                                  <span className={`ml-1 font-medium ${successRate >= 80 ? 'text-green-600' : successRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {successRate}%
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">実行時間:</span>
                                  <span className="ml-1 font-medium">
                                    {suite.duration ? formatDuration(suite.duration) : '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">カバレッジ:</span>
                                  <span className="ml-1 font-medium">
                                    {suite.coverage ? `${suite.coverage}%` : '-'}
                                  </span>
                                </div>
                              </div>
                              
                              {suite.lastRunAt && (
                                <div className="flex items-center space-x-2 mt-2 text-xs text-gray-500">
                                  <Clock className="h-3 w-3" />
                                  <span>最終実行: {formatTimeAgo(suite.lastRunAt)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* テスト結果タブ */}
          {activeTab === 'results' && canViewResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm">成功: {statistics.passedTests}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-sm">失敗: {statistics.failedTests}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <span className="text-sm">スキップ: {statistics.skippedTests}</span>
                  </div>
                </div>
                
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  レポートダウンロード
                </Button>
              </div>

              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    該当するテスト結果がありません
                  </div>
                ) : (
                  filteredResults.map((result) => {
                    const statusInfo = getTestStatusInfo(result.status);
                    const StatusIcon = statusInfo.icon;

                    return (
                      <Card key={result.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <StatusIcon className={`h-4 w-4 ${statusInfo.iconColor}`} />
                              <span className="font-medium">{result.name}</span>
                              <Badge variant={statusInfo.badge as any} className="text-xs">
                                {statusInfo.label}
                              </Badge>
                              {result.tags && result.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span>{formatDuration(result.duration)}</span>
                              <span>
                                {result.assertions.passed}/{result.assertions.total} assertions
                              </span>
                            </div>
                          </div>
                          
                          {result.error && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
                              <pre className="text-red-700 whitespace-pre-wrap">{result.error}</pre>
                            </div>
                          )}
                          
                          {result.output && result.status !== 'failed' && (
                            <details className="mt-2">
                              <summary className="text-sm text-gray-600 cursor-pointer">
                                出力を表示
                              </summary>
                              <pre className="mt-1 p-2 bg-gray-50 border rounded text-xs whitespace-pre-wrap">
                                {result.output}
                              </pre>
                            </details>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}