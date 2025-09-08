#!/bin/bash

# テストカバレッジ計測・確保スクリプト
# Usage: ./scripts/test-coverage.sh [--threshold=80] [--report] [--ci]

set -e

# デフォルト設定
COVERAGE_THRESHOLD=80
GENERATE_REPORT=false
CI_MODE=false
FAILED_TESTS=0

# コマンドライン引数の解析
while [[ $# -gt 0 ]]; do
  case $1 in
    --threshold=*)
      COVERAGE_THRESHOLD="${1#*=}"
      shift
      ;;
    --report)
      GENERATE_REPORT=true
      shift
      ;;
    --ci)
      CI_MODE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "🧪 テストカバレッジ計測を開始します..."
echo "📊 カバレッジ閾値: ${COVERAGE_THRESHOLD}%"

# カバレッジディレクトリの作成
mkdir -p coverage

# 環境変数の設定
export NODE_ENV=test
export DATABASE_URL=file:./test.db
export NEXTAUTH_SECRET=test-secret
export ENCRYPTION_MASTER_KEY=dGVzdC1rZXktYmFzZTY0LWVuY29kZWQ=

# テストデータベースのクリーンアップ
echo "🗑️  テストデータベースをクリーンアップ中..."
rm -f test.db test.db-journal test.db-shm test.db-wal

echo "🧪 ユニットテスト・統合テスト実行中..."

# Jest によるユニット・統合テストの実行
npm run test:coverage -- --passWithNoTests || FAILED_TESTS=$((FAILED_TESTS + 1))

# カバレッジ結果の解析
if [ -f "coverage/coverage-summary.json" ]; then
  echo "📊 カバレッジ結果を解析中..."
  
  # Node.js でカバレッジを解析
  node -e "
    const fs = require('fs');
    const coverage = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
    const total = coverage.total;
    
    console.log('');
    console.log('📊 カバレッジ結果:');
    console.log('=================================');
    console.log(\`行カバレッジ:     \${total.lines.pct}%\`);
    console.log(\`関数カバレッジ:   \${total.functions.pct}%\`);
    console.log(\`ブランチカバレッジ: \${total.branches.pct}%\`);
    console.log(\`ステートメントカバレッジ: \${total.statements.pct}%\`);
    console.log('=================================');
    
    const overallCoverage = Math.min(
      total.lines.pct,
      total.functions.pct,
      total.branches.pct,
      total.statements.pct
    );
    
    console.log(\`総合カバレッジ: \${overallCoverage}%\`);
    
    if (overallCoverage < ${COVERAGE_THRESHOLD}) {
      console.log('');
      console.log('❌ カバレッジが閾値を下回りました');
      console.log(\`必要: ${COVERAGE_THRESHOLD}%, 実際: \${overallCoverage}%\`);
      process.exit(1);
    } else {
      console.log('');
      console.log('✅ カバレッジ閾値をクリアしました');
    }
  "
  
  COVERAGE_CHECK_RESULT=$?
  if [ $COVERAGE_CHECK_RESULT -ne 0 ]; then
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
else
  echo "❌ カバレッジレポートが見つかりません"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# E2Eテストの実行（CI モードでない場合）
if [ "$CI_MODE" = false ]; then
  echo ""
  echo "🌐 E2Eテスト実行中..."
  
  # 開発サーバーが起動していない場合は起動
  if ! curl -s http://localhost:3000 > /dev/null; then
    echo "🚀 開発サーバーを起動中..."
    npm run dev &
    DEV_SERVER_PID=$!
    
    # サーバーの起動を待機
    echo "⏳ サーバーの起動を待機中..."
    timeout=60
    while [ $timeout -gt 0 ]; do
      if curl -s http://localhost:3000 > /dev/null; then
        echo "✅ サーバーが起動しました"
        break
      fi
      sleep 1
      timeout=$((timeout - 1))
    done
    
    if [ $timeout -eq 0 ]; then
      echo "❌ サーバーの起動に失敗しました"
      kill $DEV_SERVER_PID 2>/dev/null || true
      exit 1
    fi
  fi
  
  # E2Eテスト実行
  npm run test:e2e || FAILED_TESTS=$((FAILED_TESTS + 1))
  
  # 起動したサーバーを停止
  if [ -n "${DEV_SERVER_PID:-}" ]; then
    kill $DEV_SERVER_PID 2>/dev/null || true
  fi
fi

# カバレッジレポートの生成
if [ "$GENERATE_REPORT" = true ]; then
  echo ""
  echo "📄 カバレッジレポートを生成中..."
  
  if [ -d "coverage" ]; then
    echo "📁 HTMLレポート: coverage/lcov-report/index.html"
    
    # CI環境でない場合はブラウザで開く
    if [ "$CI_MODE" = false ] && command -v open > /dev/null; then
      open coverage/lcov-report/index.html
    fi
  fi
fi

# 結果の報告
echo ""
echo "📊 テスト結果サマリー:"
echo "======================"

if [ $FAILED_TESTS -eq 0 ]; then
  echo "✅ すべてのテストが成功しました"
  echo "✅ カバレッジ要件を満たしています"
else
  echo "❌ $FAILED_TESTS 個のテストまたはチェックが失敗しました"
fi

# バッジ情報の表示（CI環境用）
if [ "$CI_MODE" = true ] && [ -f "coverage/coverage-summary.json" ]; then
  echo ""
  echo "🏷️  CI用バッジ情報:"
  node -e "
    const coverage = JSON.parse(require('fs').readFileSync('coverage/coverage-summary.json', 'utf8'));
    const overallCoverage = Math.min(
      coverage.total.lines.pct,
      coverage.total.functions.pct,
      coverage.total.branches.pct,
      coverage.total.statements.pct
    );
    console.log(\`COVERAGE_BADGE_COLOR=\${overallCoverage >= 90 ? 'brightgreen' : overallCoverage >= 80 ? 'yellow' : 'red'}\`);
    console.log(\`COVERAGE_BADGE_PERCENTAGE=\${Math.round(overallCoverage)}\`);
  "
fi

# テストファイルの統計
echo ""
echo "📈 テストファイル統計:"
echo "===================="
echo "ユニットテスト: $(find src -name '*.test.ts' -o -name '*.test.tsx' | wc -l) ファイル"
echo "統合テスト: $(find src -name '*.integration.test.ts' -o -name '*.integration.test.tsx' | wc -l) ファイル"  
echo "E2Eテスト: $(find tests/e2e -name '*.e2e.ts' | wc -l) ファイル"

# クリーンアップ
echo ""
echo "🧹 テスト環境をクリーンアップ中..."
rm -f test.db test.db-journal test.db-shm test.db-wal

if [ $FAILED_TESTS -eq 0 ]; then
  echo "✅ テストカバレッジ計測が完了しました"
  exit 0
else
  echo "❌ テストカバレッジ計測が失敗しました"
  exit 1
fi