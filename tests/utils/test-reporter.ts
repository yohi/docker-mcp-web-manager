import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

// =============================================================================
// テストレポート生成システム
// 包括的なテスト結果の収集、分析、レポート生成
// =============================================================================

/**
 * テスト結果の型定義
 */
interface TestResult {
  suiteName: string;
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  retry?: number;
}

interface TestSuiteResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  tests: TestResult[];
}

interface CoverageReport {
  statements: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  lines: { total: number; covered: number; percentage: number };
  uncoveredFiles: string[];
}

interface PerformanceMetrics {
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  memoryUsage: { min: number; max: number; average: number };
  errorRate: number;
}

interface SecurityTestResults {
  vulnerabilitiesFound: number;
  criticalIssues: string[];
  securityScore: number;
  checkedCategories: {
    authentication: boolean;
    authorization: boolean;
    dataValidation: boolean;
    encryption: boolean;
    sessionManagement: boolean;
  };
}

/**
 * 統合テストレポート
 */
interface ComprehensiveTestReport {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    successRate: number;
    totalDuration: number;
    executionDate: string;
    environment: string;
  };
  suites: TestSuiteResult[];
  coverage: CoverageReport;
  performance: PerformanceMetrics;
  security: SecurityTestResults;
  recommendations: string[];
  artifacts: {
    screenshots: string[];
    videos: string[];
    logs: string[];
  };
}

/**
 * テストレポート生成器
 */
export class TestReportGenerator {
  private reportDir: string;
  private artifactsDir: string;

  constructor(reportDir: string = './test-results') {
    this.reportDir = reportDir;
    this.artifactsDir = path.join(reportDir, 'artifacts');
  }

  /**
   * Playwright結果の解析
   */
  async parsePlaywrightResults(resultsFile: string): Promise<TestSuiteResult[]> {
    try {
      const resultsContent = await fs.readFile(resultsFile, 'utf-8');
      const results = JSON.parse(resultsContent);
      
      const suites: TestSuiteResult[] = [];
      const suiteMap = new Map<string, TestSuiteResult>();

      for (const test of results.tests || []) {
        const suiteName = this.extractSuiteName(test.title);
        
        if (!suiteMap.has(suiteName)) {
          suiteMap.set(suiteName, {
            name: suiteName,
            passed: 0,
            failed: 0,
            skipped: 0,
            total: 0,
            duration: 0,
            tests: [],
          });
        }

        const suite = suiteMap.get(suiteName)!;
        const testResult: TestResult = {
          suiteName,
          testName: test.title,
          status: this.mapTestStatus(test.outcome),
          duration: test.results?.[0]?.duration || 0,
          error: test.results?.[0]?.error?.message,
          retry: test.results?.[0]?.retry || 0,
        };

        suite.tests.push(testResult);
        suite.total++;
        suite.duration += testResult.duration;

        switch (testResult.status) {
          case 'passed':
            suite.passed++;
            break;
          case 'failed':
            suite.failed++;
            break;
          case 'skipped':
            suite.skipped++;
            break;
        }
      }

      return Array.from(suiteMap.values());
    } catch (error) {
      console.error('Failed to parse Playwright results:', error);
      return [];
    }
  }

  /**
   * カバレッジレポートの解析
   */
  async parseCoverageReport(coverageFile: string): Promise<CoverageReport> {
    try {
      const coverageContent = await fs.readFile(coverageFile, 'utf-8');
      const coverage = JSON.parse(coverageContent);

      let totalStatements = 0, coveredStatements = 0;
      let totalBranches = 0, coveredBranches = 0;
      let totalFunctions = 0, coveredFunctions = 0;
      let totalLines = 0, coveredLines = 0;
      const uncoveredFiles: string[] = [];

      for (const [filePath, fileData] of Object.entries(coverage)) {
        const data = fileData as any;
        
        totalStatements += data.s ? Object.keys(data.s).length : 0;
        coveredStatements += data.s ? Object.values(data.s).filter((v: any) => v > 0).length : 0;
        
        totalBranches += data.b ? Object.keys(data.b).length : 0;
        coveredBranches += data.b ? Object.values(data.b).flat().filter((v: any) => v > 0).length : 0;
        
        totalFunctions += data.f ? Object.keys(data.f).length : 0;
        coveredFunctions += data.f ? Object.values(data.f).filter((v: any) => v > 0).length : 0;
        
        const linesCovered = data.s ? Object.values(data.s).filter((v: any) => v > 0).length : 0;
        const totalFileLines = data.s ? Object.keys(data.s).length : 0;
        
        totalLines += totalFileLines;
        coveredLines += linesCovered;

        if (totalFileLines > 0 && linesCovered / totalFileLines < 0.8) {
          uncoveredFiles.push(filePath);
        }
      }

      return {
        statements: {
          total: totalStatements,
          covered: coveredStatements,
          percentage: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 0,
        },
        branches: {
          total: totalBranches,
          covered: coveredBranches,
          percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
        },
        functions: {
          total: totalFunctions,
          covered: coveredFunctions,
          percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
        },
        lines: {
          total: totalLines,
          covered: coveredLines,
          percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
        },
        uncoveredFiles: uncoveredFiles.slice(0, 10), // トップ10のみ表示
      };
    } catch (error) {
      console.error('Failed to parse coverage report:', error);
      return {
        statements: { total: 0, covered: 0, percentage: 0 },
        branches: { total: 0, covered: 0, percentage: 0 },
        functions: { total: 0, covered: 0, percentage: 0 },
        lines: { total: 0, covered: 0, percentage: 0 },
        uncoveredFiles: [],
      };
    }
  }

  /**
   * パフォーマンステスト結果の分析
   */
  async analyzePerformanceResults(performanceFiles: string[]): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      memoryUsage: { min: 0, max: 0, average: 0 },
      errorRate: 0,
    };

    const responseTimes: number[] = [];
    const memoryReadings: number[] = [];
    let totalRequests = 0;
    let failedRequests = 0;

    for (const file of performanceFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);

        if (data.metrics) {
          data.metrics.forEach((metric: any) => {
            if (metric.responseTime) responseTimes.push(metric.responseTime);
            if (metric.memoryUsage) memoryReadings.push(metric.memoryUsage);
            if (metric.status === 'success') totalRequests++;
            if (metric.status === 'failed') failedRequests++;
          });
        }
      } catch (error) {
        console.error(`Failed to parse performance file ${file}:`, error);
      }
    }

    if (responseTimes.length > 0) {
      responseTimes.sort((a, b) => a - b);
      metrics.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      metrics.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
      metrics.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
    }

    if (memoryReadings.length > 0) {
      metrics.memoryUsage = {
        min: Math.min(...memoryReadings),
        max: Math.max(...memoryReadings),
        average: memoryReadings.reduce((sum, mem) => sum + mem, 0) / memoryReadings.length,
      };
    }

    if (totalRequests > 0) {
      metrics.errorRate = (failedRequests / (totalRequests + failedRequests)) * 100;
    }

    return metrics;
  }

  /**
   * セキュリティテスト結果の分析
   */
  async analyzeSecurityResults(securityFiles: string[]): Promise<SecurityTestResults> {
    const results: SecurityTestResults = {
      vulnerabilitiesFound: 0,
      criticalIssues: [],
      securityScore: 100,
      checkedCategories: {
        authentication: false,
        authorization: false,
        dataValidation: false,
        encryption: false,
        sessionManagement: false,
      },
    };

    for (const file of securityFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const data = JSON.parse(content);

        if (data.vulnerabilities) {
          results.vulnerabilitiesFound += data.vulnerabilities.length;
          
          data.vulnerabilities.forEach((vuln: any) => {
            if (vuln.severity === 'critical') {
              results.criticalIssues.push(vuln.description);
              results.securityScore -= 20;
            } else if (vuln.severity === 'high') {
              results.securityScore -= 10;
            } else if (vuln.severity === 'medium') {
              results.securityScore -= 5;
            }
          });
        }

        // テストカテゴリーの更新
        if (data.testCategories) {
          Object.keys(results.checkedCategories).forEach(category => {
            if (data.testCategories[category]) {
              (results.checkedCategories as any)[category] = true;
            }
          });
        }
      } catch (error) {
        console.error(`Failed to parse security file ${file}:`, error);
      }
    }

    results.securityScore = Math.max(0, results.securityScore);
    return results;
  }

  /**
   * アーティファクトの収集
   */
  async collectArtifacts(): Promise<{ screenshots: string[]; videos: string[]; logs: string[] }> {
    const artifacts = {
      screenshots: [] as string[],
      videos: [] as string[],
      logs: [] as string[],
    };

    try {
      await fs.mkdir(this.artifactsDir, { recursive: true });

      // スクリーンショットの収集
      const screenshotsDir = path.join(this.reportDir, 'test-results');
      try {
        const files = await fs.readdir(screenshotsDir);
        artifacts.screenshots = files.filter(file => 
          file.endsWith('.png') || file.endsWith('.jpg')
        ).map(file => path.join(screenshotsDir, file));
      } catch (error) {
        // スクリーンショットディレクトリが存在しない場合は無視
      }

      // ビデオの収集
      const videosDir = path.join(this.reportDir, 'videos');
      try {
        const files = await fs.readdir(videosDir);
        artifacts.videos = files.filter(file => 
          file.endsWith('.webm') || file.endsWith('.mp4')
        ).map(file => path.join(videosDir, file));
      } catch (error) {
        // ビデオディレクトリが存在しない場合は無視
      }

      // ログファイルの収集
      const logsDir = path.join(this.reportDir, 'logs');
      try {
        const files = await fs.readdir(logsDir);
        artifacts.logs = files.filter(file => 
          file.endsWith('.log') || file.endsWith('.txt')
        ).map(file => path.join(logsDir, file));
      } catch (error) {
        // ログディレクトリが存在しない場合は無視
      }
    } catch (error) {
      console.error('Failed to collect artifacts:', error);
    }

    return artifacts;
  }

  /**
   * 推奨事項の生成
   */
  generateRecommendations(
    suites: TestSuiteResult[],
    coverage: CoverageReport,
    performance: PerformanceMetrics,
    security: SecurityTestResults
  ): string[] {
    const recommendations: string[] = [];

    // テスト成功率に基づく推奨事項
    const totalTests = suites.reduce((sum, suite) => sum + suite.total, 0);
    const passedTests = suites.reduce((sum, suite) => sum + suite.passed, 0);
    const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    if (successRate < 95) {
      recommendations.push(`テスト成功率が${successRate.toFixed(1)}%です。失敗しているテストケースの修正を優先してください。`);
    }

    // カバレッジに基づく推奨事項
    if (coverage.lines.percentage < 80) {
      recommendations.push(`コードカバレッジが${coverage.lines.percentage.toFixed(1)}%です。最低80%を目標にテストを追加してください。`);
    }

    if (coverage.uncoveredFiles.length > 0) {
      recommendations.push(`${coverage.uncoveredFiles.length}個のファイルのカバレッジが低いです。重要な機能から優先的にテストを追加してください。`);
    }

    // パフォーマンスに基づく推奨事項
    if (performance.averageResponseTime > 1000) {
      recommendations.push(`平均レスポンス時間が${performance.averageResponseTime.toFixed(0)}msです。1秒以内を目標に最適化してください。`);
    }

    if (performance.memoryUsage.max > 100 * 1024 * 1024) {
      recommendations.push(`最大メモリ使用量が${Math.round(performance.memoryUsage.max / 1024 / 1024)}MBです。メモリリークの確認をお勧めします。`);
    }

    if (performance.errorRate > 1) {
      recommendations.push(`エラー率が${performance.errorRate.toFixed(1)}%です。エラーハンドリングの改善が必要です。`);
    }

    // セキュリティに基づく推奨事項
    if (security.criticalIssues.length > 0) {
      recommendations.push(`${security.criticalIssues.length}個の重大なセキュリティ問題が発見されました。即座に修正してください。`);
    }

    if (security.securityScore < 80) {
      recommendations.push(`セキュリティスコアが${security.securityScore}点です。セキュリティ要件の見直しが必要です。`);
    }

    // 一般的な推奨事項
    if (recommendations.length === 0) {
      recommendations.push('すべてのテストが正常に完了しています。品質基準を満たしています。');
    }

    return recommendations;
  }

  /**
   * 統合テストレポートの生成
   */
  async generateComprehensiveReport(): Promise<ComprehensiveTestReport> {
    console.log('Generating comprehensive test report...');

    await fs.mkdir(this.reportDir, { recursive: true });

    // 各種テスト結果ファイルの検索
    const playwrightResults = path.join(this.reportDir, 'results.json');
    const coverageResults = path.join(this.reportDir, 'coverage.json');
    const performanceFiles = [
      path.join(this.reportDir, 'performance.json'),
      path.join(this.reportDir, 'load-test.json'),
    ];
    const securityFiles = [
      path.join(this.reportDir, 'security.json'),
      path.join(this.reportDir, 'security-audit.json'),
    ];

    // 結果の解析
    const [suites, coverage, performance, security, artifacts] = await Promise.all([
      this.parsePlaywrightResults(playwrightResults),
      this.parseCoverageReport(coverageResults),
      this.analyzePerformanceResults(performanceFiles.filter(f => this.fileExists(f))),
      this.analyzeSecurityResults(securityFiles.filter(f => this.fileExists(f))),
      this.collectArtifacts(),
    ]);

    // サマリーの計算
    const totalTests = suites.reduce((sum, suite) => sum + suite.total, 0);
    const passedTests = suites.reduce((sum, suite) => sum + suite.passed, 0);
    const failedTests = suites.reduce((sum, suite) => sum + suite.failed, 0);
    const skippedTests = suites.reduce((sum, suite) => sum + suite.skipped, 0);
    const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
    const totalDuration = suites.reduce((sum, suite) => sum + suite.duration, 0);

    // 推奨事項の生成
    const recommendations = this.generateRecommendations(suites, coverage, performance, security);

    const report: ComprehensiveTestReport = {
      summary: {
        totalTests,
        passed: passedTests,
        failed: failedTests,
        skipped: skippedTests,
        successRate,
        totalDuration,
        executionDate: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'test',
      },
      suites,
      coverage,
      performance,
      security,
      recommendations,
      artifacts,
    };

    return report;
  }

  /**
   * HTMLレポートの生成
   */
  async generateHtmlReport(report: ComprehensiveTestReport): Promise<string> {
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Docker MCP Web Manager - テストレポート</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #2563eb; color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { padding: 30px; }
        .section { margin-bottom: 40px; }
        .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; text-align: center; }
        .stat-card.success { border-color: #10b981; background-color: #f0fdf4; }
        .stat-card.warning { border-color: #f59e0b; background-color: #fffbeb; }
        .stat-card.error { border-color: #ef4444; background-color: #fef2f2; }
        .stat-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .success-rate { color: ${report.summary.successRate >= 95 ? '#10b981' : report.summary.successRate >= 80 ? '#f59e0b' : '#ef4444'}; }
        .test-suite { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin: 10px 0; }
        .progress-bar { width: 100%; height: 20px; background: #e5e7eb; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981, #059669); }
        .recommendations { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 20px; }
        .recommendations ul { margin: 0; padding-left: 20px; }
        .coverage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .coverage-item { text-align: center; padding: 15px; background: #f1f5f9; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5e7eb; }
        th { background: #f8fafc; font-weight: 600; }
        .status-passed { color: #10b981; font-weight: bold; }
        .status-failed { color: #ef4444; font-weight: bold; }
        .status-skipped { color: #6b7280; font-weight: bold; }
        .artifact-link { display: inline-block; margin: 5px; padding: 8px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; }
        .security-score { font-size: 1.5em; font-weight: bold; color: ${report.security.securityScore >= 90 ? '#10b981' : report.security.securityScore >= 70 ? '#f59e0b' : '#ef4444'}; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Docker MCP Web Manager v2</h1>
            <h2>統合テストレポート</h2>
            <p>実行日時: ${new Date(report.summary.executionDate).toLocaleString('ja-JP')}</p>
            <p>環境: ${report.summary.environment}</p>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>📊 テスト実行サマリー</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${report.summary.totalTests}</div>
                        <div>総テスト数</div>
                    </div>
                    <div class="stat-card success">
                        <div class="stat-value">${report.summary.passed}</div>
                        <div>成功</div>
                    </div>
                    <div class="stat-card error">
                        <div class="stat-value">${report.summary.failed}</div>
                        <div>失敗</div>
                    </div>
                    <div class="stat-card warning">
                        <div class="stat-value">${report.summary.skipped}</div>
                        <div>スキップ</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value success-rate">${report.summary.successRate.toFixed(1)}%</div>
                        <div>成功率</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${Math.round(report.summary.totalDuration / 1000)}s</div>
                        <div>実行時間</div>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>🧪 テストスイート詳細</h2>
                ${report.suites.map(suite => `
                    <div class="test-suite">
                        <h3>${suite.name}</h3>
                        <p>成功: ${suite.passed} / 失敗: ${suite.failed} / スキップ: ${suite.skipped} / 合計: ${suite.total}</p>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${suite.total > 0 ? (suite.passed / suite.total) * 100 : 0}%"></div>
                        </div>
                        <details>
                            <summary>詳細を表示</summary>
                            <table>
                                <thead>
                                    <tr><th>テスト名</th><th>ステータス</th><th>実行時間</th></tr>
                                </thead>
                                <tbody>
                                    ${suite.tests.map(test => `
                                        <tr>
                                            <td>${test.testName}</td>
                                            <td class="status-${test.status}">${test.status.toUpperCase()}</td>
                                            <td>${test.duration}ms</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </details>
                    </div>
                `).join('')}
            </div>

            <div class="section">
                <h2>📈 コードカバレッジ</h2>
                <div class="coverage-grid">
                    <div class="coverage-item">
                        <h3>${report.coverage.lines.percentage.toFixed(1)}%</h3>
                        <p>行カバレッジ</p>
                    </div>
                    <div class="coverage-item">
                        <h3>${report.coverage.statements.percentage.toFixed(1)}%</h3>
                        <p>ステートメント</p>
                    </div>
                    <div class="coverage-item">
                        <h3>${report.coverage.branches.percentage.toFixed(1)}%</h3>
                        <p>ブランチ</p>
                    </div>
                    <div class="coverage-item">
                        <h3>${report.coverage.functions.percentage.toFixed(1)}%</h3>
                        <p>関数</p>
                    </div>
                </div>
                ${report.coverage.uncoveredFiles.length > 0 ? `
                    <h3>カバレッジが低いファイル</h3>
                    <ul>
                        ${report.coverage.uncoveredFiles.map(file => `<li>${file}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>

            <div class="section">
                <h2>⚡ パフォーマンス</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${report.performance.averageResponseTime.toFixed(0)}ms</div>
                        <div>平均レスポンス時間</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${report.performance.p95ResponseTime.toFixed(0)}ms</div>
                        <div>95パーセンタイル</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${Math.round(report.performance.memoryUsage.max / 1024 / 1024)}MB</div>
                        <div>最大メモリ使用量</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${report.performance.errorRate.toFixed(1)}%</div>
                        <div>エラー率</div>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>🔒 セキュリティ</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value security-score">${report.security.securityScore}</div>
                        <div>セキュリティスコア</div>
                    </div>
                    <div class="stat-card ${report.security.vulnerabilitiesFound > 0 ? 'error' : 'success'}">
                        <div class="stat-value">${report.security.vulnerabilitiesFound}</div>
                        <div>脆弱性</div>
                    </div>
                    <div class="stat-card ${report.security.criticalIssues.length > 0 ? 'error' : 'success'}">
                        <div class="stat-value">${report.security.criticalIssues.length}</div>
                        <div>重大な問題</div>
                    </div>
                </div>
                ${report.security.criticalIssues.length > 0 ? `
                    <h3>重大なセキュリティ問題</h3>
                    <ul>
                        ${report.security.criticalIssues.map(issue => `<li style="color: #ef4444;">${issue}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>

            <div class="section">
                <h2>💡 推奨事項</h2>
                <div class="recommendations">
                    <ul>
                        ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
            </div>

            ${(report.artifacts.screenshots.length > 0 || report.artifacts.videos.length > 0 || report.artifacts.logs.length > 0) ? `
                <div class="section">
                    <h2>📁 アーティファクト</h2>
                    ${report.artifacts.screenshots.length > 0 ? `
                        <h3>スクリーンショット (${report.artifacts.screenshots.length})</h3>
                        ${report.artifacts.screenshots.slice(0, 5).map(screenshot => `
                            <a href="${screenshot}" class="artifact-link" target="_blank">📷 ${path.basename(screenshot)}</a>
                        `).join('')}
                    ` : ''}
                    ${report.artifacts.videos.length > 0 ? `
                        <h3>テスト動画 (${report.artifacts.videos.length})</h3>
                        ${report.artifacts.videos.slice(0, 5).map(video => `
                            <a href="${video}" class="artifact-link" target="_blank">🎥 ${path.basename(video)}</a>
                        `).join('')}
                    ` : ''}
                    ${report.artifacts.logs.length > 0 ? `
                        <h3>ログファイル (${report.artifacts.logs.length})</h3>
                        ${report.artifacts.logs.slice(0, 5).map(log => `
                            <a href="${log}" class="artifact-link" target="_blank">📝 ${path.basename(log)}</a>
                        `).join('')}
                    ` : ''}
                </div>
            ` : ''}
        </div>
    </div>
</body>
</html>`;

    const reportPath = path.join(this.reportDir, 'test-report.html');
    await fs.writeFile(reportPath, htmlTemplate, 'utf-8');
    
    return reportPath;
  }

  /**
   * JSONレポートの保存
   */
  async saveJsonReport(report: ComprehensiveTestReport): Promise<string> {
    const reportPath = path.join(this.reportDir, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    return reportPath;
  }

  /**
   * CI/CD統合用サマリーの生成
   */
  generateCiSummary(report: ComprehensiveTestReport): string {
    const summary = [
      `## テストレポート - ${new Date(report.summary.executionDate).toLocaleDateString('ja-JP')}`,
      '',
      `### 📊 サマリー`,
      `- **総テスト数**: ${report.summary.totalTests}`,
      `- **成功**: ${report.summary.passed} (${report.summary.successRate.toFixed(1)}%)`,
      `- **失敗**: ${report.summary.failed}`,
      `- **スキップ**: ${report.summary.skipped}`,
      `- **実行時間**: ${Math.round(report.summary.totalDuration / 1000)}秒`,
      '',
      `### 📈 品質メトリクス`,
      `- **コードカバレッジ**: ${report.coverage.lines.percentage.toFixed(1)}%`,
      `- **平均レスポンス時間**: ${report.performance.averageResponseTime.toFixed(0)}ms`,
      `- **セキュリティスコア**: ${report.security.securityScore}/100`,
      '',
    ];

    if (report.summary.failed > 0) {
      summary.push(`### ❌ 失敗したテスト`);
      report.suites.forEach(suite => {
        suite.tests.filter(test => test.status === 'failed').forEach(test => {
          summary.push(`- **${suite.name}**: ${test.testName}`);
        });
      });
      summary.push('');
    }

    if (report.security.criticalIssues.length > 0) {
      summary.push(`### 🚨 重大なセキュリティ問題`);
      report.security.criticalIssues.forEach(issue => {
        summary.push(`- ${issue}`);
      });
      summary.push('');
    }

    summary.push(`### 💡 推奨事項`);
    report.recommendations.forEach(rec => {
      summary.push(`- ${rec}`);
    });

    return summary.join('\n');
  }

  /**
   * ヘルパーメソッド
   */
  private extractSuiteName(testTitle: string): string {
    const parts = testTitle.split(' › ');
    return parts.length > 1 ? parts[0] : 'General Tests';
  }

  private mapTestStatus(outcome: string): 'passed' | 'failed' | 'skipped' {
    switch (outcome?.toLowerCase()) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'skipped':
        return 'skipped';
      default:
        return 'failed';
    }
  }

  private fileExists(filePath: string): boolean {
    try {
      require('fs').statSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * メイン実行関数
 */
export async function generateTestReport(): Promise<void> {
  const generator = new TestReportGenerator();
  
  try {
    console.log('📋 統合テストレポートを生成中...');
    
    const report = await generator.generateComprehensiveReport();
    
    const [htmlPath, jsonPath] = await Promise.all([
      generator.generateHtmlReport(report),
      generator.saveJsonReport(report),
    ]);
    
    const ciSummary = generator.generateCiSummary(report);
    
    console.log('\n✅ テストレポートが正常に生成されました:');
    console.log(`📄 HTML レポート: ${htmlPath}`);
    console.log(`📊 JSON レポート: ${jsonPath}`);
    console.log('\n📋 CI/CD サマリー:');
    console.log(ciSummary);
    
    // 終了コードの設定（失敗テストがある場合は1）
    if (report.summary.failed > 0 || report.security.criticalIssues.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ テストレポート生成中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトとして直接実行された場合
if (require.main === module) {
  generateTestReport();
}