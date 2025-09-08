# Docker MCP Web Manager - トラブルシューティングガイド

このガイドでは、Docker MCP Web Manager v2でよく発生する問題の診断と解決方法を説明します。

## 📋 目次

1. [システム要件](#システム要件)
2. [Docker関連の問題](#docker関連の問題)
3. [データベース関連の問題](#データベース関連の問題)
4. [認証・セッション問題](#認証セッション問題)
5. [パフォーマンス問題](#パフォーマンス問題)
6. [セキュリティ関連の問題](#セキュリティ関連の問題)
7. [API関連の問題](#api関連の問題)
8. [ログ・監視の問題](#ログ監視の問題)
9. [一般的なエラーコード](#一般的なエラーコード)
10. [サポート・デバッグ情報](#サポートデバッグ情報)

---

## 🔧 システム要件

### 最小要件
- **Docker**: 20.10.0+
- **Docker Compose**: v2.0+
- **Node.js**: 24.7.0+ (コンテナ内で使用)
- **メモリ**: 2GB以上推奨
- **ディスク**: 10GB以上の空き容量

### バージョン確認
```bash
# Docker バージョン確認
docker --version
docker compose version

# システムリソース確認
docker system df
docker system info
```

---

## 🐳 Docker関連の問題

### 1. コンテナが起動しない

#### 症状
- `docker compose up` でコンテナが開始後すぐ終了する
- ヘルスチェックが失敗する

#### 診断コマンド
```bash
# コンテナ状態確認
docker compose ps

# ログの確認
docker compose logs web
docker compose logs redis

# 詳細な起動ログ
docker compose up --no-detach
```

#### よくある原因と解決法

**原因1: ポートがすでに使用されている**
```bash
# ポート使用状況確認
netstat -tulpn | grep :3000
lsof -i :3000

# 解決方法：ポート変更
export WEB_PORT=3001
docker compose up -d
```

**原因2: ボリュームの権限問題**
```bash
# データディレクトリの権限確認
ls -la ./data

# 権限修正
sudo chown -R 1000:1000 ./data
chmod 755 ./data
```

**原因3: メモリ不足**
```bash
# メモリ使用量確認
docker stats
free -h

# 解決方法：コンテナのメモリ制限調整
# docker-compose.ymlに追加
deploy:
  resources:
    limits:
      memory: 1G
    reservations:
      memory: 512M
```

### 2. ビルドエラー

#### 症状
- `docker compose build` でエラーが発生

#### 診断と解決
```bash
# キャッシュをクリアしてビルド
docker compose build --no-cache

# Docker BuildKitを無効にして詳細ログ確認
DOCKER_BUILDKIT=0 docker compose build

# ディスク容量不足の場合
docker system prune -a
docker volume prune
```

### 3. ネットワーク問題

#### 症状
- コンテナ間通信ができない
- 外部APIにアクセスできない

#### 診断
```bash
# ネットワーク確認
docker network ls
docker network inspect docker-mcp-web-manager_app-network

# コンテナ間接続テスト
docker compose exec web ping redis
docker compose exec web nslookup redis
```

#### 解決法
```bash
# ネットワーク再作成
docker compose down
docker network prune
docker compose up -d
```

---

## 🗄️ データベース関連の問題

### 1. SQLiteデータベース問題

#### 症状
- `database is locked` エラー
- データベースファイルが見つからない

#### 診断
```bash
# データベースファイル確認
ls -la ./data/
file ./data/app.db

# データベース接続テスト
docker compose exec web sqlite3 /app/data/app.db ".tables"
```

#### 解決法

**データベースロックの解決**
```bash
# プロセス確認
docker compose exec web ps aux | grep sqlite
docker compose exec web lsof /app/data/app.db

# 強制的にロック解除（注意：データ損失の可能性）
docker compose exec web sqlite3 /app/data/app.db ".timeout 30000"
```

**データベース再作成**
```bash
# バックアップ作成
docker compose exec web cp /app/data/app.db /app/data/app.db.backup

# データベース初期化
docker compose exec web rm /app/data/app.db
docker compose exec web npm run db:push
```

### 2. マイグレーションエラー

#### 症状
- `npm run db:push` でエラー
- テーブルが存在しない

#### 解決法
```bash
# Drizzleキット設定確認
docker compose exec web cat drizzle.config.ts

# マイグレーション強制実行
docker compose exec web npm run db:generate
docker compose exec web npm run db:push

# テーブル構造確認
docker compose exec web sqlite3 /app/data/app.db ".schema"
```

---

## 🔐 認証・セッション問題

### 1. ログインできない

#### 症状
- 正しい認証情報でもログインできない
- セッションがすぐに切れる

#### 診断
```bash
# NextAuth設定確認
docker compose exec web env | grep NEXTAUTH

# セッション確認
# ブラウザ開発者ツール → Application → Cookies
```

#### 解決法

**NextAuth設定の確認**
```bash
# 環境変数設定確認
echo $NEXTAUTH_SECRET
echo $NEXTAUTH_URL

# 新しいシークレット生成
openssl rand -base64 32
```

**セッション問題の解決**
```bash
# Redisセッションストア確認
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli keys "*session*"

# セッションクリア
docker compose exec redis redis-cli flushdb
```

### 2. Bitwardenクライアント問題

#### 症状
- Bitwarden認証が失敗する
- Vault接続エラー

#### 診断と解決
```bash
# Bitwarden CLI確認
docker compose exec web which bw
docker compose exec web bw --version

# サーバー接続テスト
docker compose exec web bw config server $BITWARDEN_SERVER_URL
docker compose exec web bw status
```

---

## ⚡ パフォーマンス問題

### 1. アプリケーションが遅い

#### 症状
- ページ読み込みが遅い
- API応答が遅い

#### 診断
```bash
# リソース使用量確認
docker stats

# アプリケーションメトリクス確認
curl http://localhost:3000/api/v1/metrics

# ネットワークレイテンシ確認
docker compose exec web ping google.com
```

#### 最適化手順

**1. コンテナリソース調整**
```yaml
# docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 1G
```

**2. データベースパフォーマンス改善**
```bash
# WALモード確認
docker compose exec web sqlite3 /app/data/app.db "PRAGMA journal_mode;"

# インデックス確認
docker compose exec web sqlite3 /app/data/app.db ".indices"

# VACUUM実行
docker compose exec web sqlite3 /app/data/app.db "VACUUM;"
```

**3. Redisキャッシュ確認**
```bash
# Redis統計確認
docker compose exec redis redis-cli info stats
docker compose exec redis redis-cli info memory
```

### 2. メモリリーク

#### 症状
- 時間経過でメモリ使用量が増加し続ける
- OOM Killerでプロセス終了

#### 診断
```bash
# プロセスメモリ使用量監視
docker compose exec web ps aux
docker compose exec web top

# Node.jsメモリ使用量確認
docker compose exec web node -e "console.log(process.memoryUsage())"
```

#### 解決法
```bash
# Node.js最大ヒープサイズ制限
NODE_OPTIONS="--max-old-space-size=1024" docker compose up

# ガベージコレクション強制実行
docker compose exec web node -e "global.gc && global.gc()"
```

---

## 🔒 セキュリティ関連の問題

### 1. CORS エラー

#### 症状
- ブラウザでAPI呼び出し時にCORSエラー
- `Access-Control-Allow-Origin` エラー

#### 解決法
```bash
# 環境変数設定確認
echo $CORS_ORIGIN

# 開発環境での設定
export CORS_ORIGIN="http://localhost:3000,http://localhost:3001"
docker compose up -d

# next.config.jsの確認
docker compose exec web cat next.config.js
```

### 2. CSP違反

#### 症状
- ブラウザコンソールでCSP違反エラー
- スタイル・スクリプトが読み込まれない

#### 診断と解決
```bash
# CSPヘッダー確認
curl -I http://localhost:3000

# 開発環境でのCSP無効化（一時的）
# next.config.jsのCSP設定を確認
NODE_ENV=development docker compose up
```

### 3. セキュリティヘッダー問題

#### 症状
- セキュリティスキャナーでの警告
- HTTPS強制の問題

#### 解決法
```yaml
# nginx.conf または next.config.js で設定
headers:
  - key: 'Strict-Transport-Security'
    value: 'max-age=31536000; includeSubDomains; preload'
  - key: 'X-Content-Type-Options'
    value: 'nosniff'
```

---

## 🔌 API関連の問題

### 1. レート制限

#### 症状
- `429 Too Many Requests` エラー
- API呼び出し制限

#### 診断
```bash
# 現在のレート制限設定確認
echo $SERVER_RATE_USER_RPM

# Redisでレート制限情報確認
docker compose exec redis redis-cli keys "*rate*"
```

#### 解決法
```bash
# レート制限調整
export SERVER_RATE_USER_RPM=2000
docker compose up -d

# レート制限リセット
docker compose exec redis redis-cli del rate_limit:*
```

### 2. サーバーサイドイベント(SSE)問題

#### 症状
- ログストリームが切断される
- `503 Service Unavailable` でSSE接続拒否

#### 診断
```bash
# SSE接続数確認
docker compose logs web | grep -i sse

# 環境変数確認
echo $SERVER_SSE_MAX_CONNECTIONS
echo $SERVER_SSE_HEARTBEAT_INTERVAL
```

#### 解決法
```bash
# SSE設定調整
export SERVER_SSE_MAX_CONNECTIONS=200
export SERVER_SSE_HEARTBEAT_INTERVAL=60000
docker compose up -d

# 接続数監視
watch "docker compose logs web --tail 20 | grep SSE"
```

---

## 📝 ログ・監視の問題

### 1. ログが表示されない

#### 症状
- アプリケーションログが空
- サーバーログが取得できない

#### 診断
```bash
# ログレベル確認
echo $LOG_LEVEL

# ログファイル確認
docker compose exec web ls -la /app/data/logs/
docker compose exec web tail -f /app/data/logs/app.log
```

#### 解決法
```bash
# ログレベル調整
export LOG_LEVEL=debug
docker compose up -d

# ログローテーション設定確認
echo $SERVER_LOG_RETENTION_DAYS
echo $SERVER_LOG_ROTATION_SIZE
```

### 2. ログストリーミング問題

#### 症状
- リアルタイムログが更新されない
- SSE接続でログが流れない

#### 解決法
```bash
# ログファイル権限確認
docker compose exec web ls -la /app/data/logs/

# ログウォッチャー再起動
docker compose restart web

# 手動でSSE接続テスト
curl -H "Accept: text/event-stream" \
     "http://localhost:3000/api/v1/servers/{server-id}/logs/stream"
```

---

## ⚠️ 一般的なエラーコード

### システムエラー
- **SYS_001**: システム初期化エラー
- **SYS_002**: 設定ファイルエラー
- **SYS_003**: データベース接続エラー
- **SYS_004**: Redis接続エラー

### サーバー管理エラー
- **SERVER_001**: サーバー作成エラー
- **SERVER_002**: サーバー開始エラー
- **SERVER_003**: サーバー停止エラー
- **SERVER_004**: サーバー設定エラー
- **SERVER_005**: Docker操作エラー

### 認証・認可エラー
- **AUTH_001**: 認証失敗
- **AUTH_002**: セッション期限切れ
- **AUTH_003**: 権限不足
- **AUTH_004**: Bitwarden接続エラー

### API エラー
- **API_001**: 不正なリクエスト
- **API_002**: レート制限超過
- **API_003**: データ検証エラー
- **API_004**: リソース不足

---

## 🆘 サポート・デバッグ情報

### デバッグ情報の収集

#### システム情報収集スクリプト
```bash
#!/bin/bash
# debug-info.sh

echo "=== System Information ===" > debug-info.txt
date >> debug-info.txt
uname -a >> debug-info.txt
docker --version >> debug-info.txt
docker compose version >> debug-info.txt

echo -e "\n=== Container Status ===" >> debug-info.txt
docker compose ps >> debug-info.txt

echo -e "\n=== Resource Usage ===" >> debug-info.txt
docker stats --no-stream >> debug-info.txt

echo -e "\n=== Logs (last 100 lines) ===" >> debug-info.txt
docker compose logs --tail 100 >> debug-info.txt

echo -e "\n=== Environment Variables ===" >> debug-info.txt
docker compose exec web env | grep -E "(NODE_ENV|DATABASE_URL|NEXTAUTH|CORS|SERVER_)" >> debug-info.txt

echo -e "\n=== Disk Usage ===" >> debug-info.txt
df -h >> debug-info.txt
docker system df >> debug-info.txt

echo "Debug information saved to debug-info.txt"
```

### ヘルスチェック

#### 手動ヘルスチェック
```bash
# API ヘルスチェック
curl -f http://localhost:3000/api/v1/health || echo "Health check failed"

# データベース接続確認
docker compose exec web sqlite3 /app/data/app.db "SELECT 1;" || echo "Database check failed"

# Redis接続確認
docker compose exec redis redis-cli ping || echo "Redis check failed"
```

#### 包括的テストスクリプト
```bash
#!/bin/bash
# health-check.sh

HEALTH_URL="http://localhost:3000/api/v1/health"
EXIT_CODE=0

echo "Running comprehensive health check..."

# 1. コンテナ状態確認
echo "1. Checking container status..."
if ! docker compose ps | grep -q "Up"; then
    echo "❌ Some containers are not running"
    EXIT_CODE=1
else
    echo "✅ All containers are running"
fi

# 2. API 疎通確認
echo "2. Checking API health..."
if curl -f -s "$HEALTH_URL" > /dev/null; then
    echo "✅ API is responding"
else
    echo "❌ API is not responding"
    EXIT_CODE=1
fi

# 3. データベース確認
echo "3. Checking database..."
if docker compose exec -T web sqlite3 /app/data/app.db "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ Database is accessible"
else
    echo "❌ Database is not accessible"
    EXIT_CODE=1
fi

# 4. Redis 確認
echo "4. Checking Redis..."
if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is responding"
else
    echo "❌ Redis is not responding"
    EXIT_CODE=1
fi

# 5. ディスク容量確認
echo "5. Checking disk space..."
DISK_USAGE=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 90 ]; then
    echo "✅ Sufficient disk space (${DISK_USAGE}% used)"
else
    echo "⚠️ Low disk space (${DISK_USAGE}% used)"
    EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "🎉 All health checks passed!"
else
    echo "❌ Some health checks failed. Check the logs above."
fi

exit $EXIT_CODE
```

### ログレベル設定

#### 開発時デバッグ
```bash
# 詳細ログ有効化
export LOG_LEVEL=debug
export NODE_ENV=development
docker compose up -d

# 特定コンポーネントのデバッグ
export DEBUG=drizzle:*,next-auth:*
docker compose up -d
```

### 問題報告時の情報

問題を報告する際は以下の情報を含めてください：

1. **環境情報**
   - OS とバージョン
   - Docker & Docker Compose バージョン
   - 利用可能なシステムリソース

2. **エラーログ**
   ```bash
   docker compose logs web --tail 50
   docker compose logs redis --tail 20
   ```

3. **設定情報**
   ```bash
   docker compose config
   cat .env
   ```

4. **再現手順**
   - 問題が発生した具体的な操作手順
   - 期待される結果と実際の結果

5. **システム状態**
   ```bash
   docker compose ps
   docker stats --no-stream
   ```

### よくある質問とベストプラクティス

#### Q: 本番環境での推奨設定は？
```yaml
# docker-compose.prod.yml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - SERVER_RATE_USER_RPM=1000
```

#### Q: バックアップの推奨頻度は？
```bash
# 毎日のバックアップスクリプト
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker compose exec -T web sqlite3 /app/data/app.db ".backup /app/data/backup_${DATE}.db"
```

#### Q: セキュリティ監査で確認すべき項目は？
1. 環境変数にシークレットが含まれていないか
2. HTTPS強制設定
3. セキュリティヘッダーの適切な設定
4. レート制限の適切な設定
5. ログのマスキング設定

---

このトラブルシューティングガイドは継続的に更新されます。新しい問題や解決法があれば、チームで共有して文書を更新してください。