# Docker MCP Web Manager - トラブルシューティングガイド

このガイドでは、Docker MCP Web Manager v2でよく発生する問題の診断と解決方法を説明します。

## 📋 目次

1. [クイック診断チェックリスト](#クイック診断チェックリスト)
2. [システム要件と前提条件](#システム要件と前提条件)
3. [Docker関連の問題](#docker関連の問題)
4. [データベース関連の問題](#データベース関連の問題)
5. [認証・セッション問題](#認証セッション問題)
6. [MCP サーバー管理の問題](#mcpサーバー管理の問題)
7. [パフォーマンス問題](#パフォーマンス問題)
8. [API関連の問題](#api関連の問題)
9. [UI・フロントエンド問題](#uiフロントエンド問題)
10. [ネットワーク・接続問題](#ネットワーク接続問題)
11. [セキュリティ関連の問題](#セキュリティ関連の問題)
12. [ログ・監視の問題](#ログ監視の問題)
13. [開発・テスト環境の問題](#開発テスト環境の問題)
14. [一般的なエラーコード](#一般的なエラーコード)
15. [デバッグとサポート情報](#デバッグとサポート情報)

---

## 🚨 クイック診断チェックリスト

問題が発生した場合、まず以下を確認してください：

### ✅ 基本チェック（5分）

```bash
# 1. システム状態確認
docker compose ps
docker stats --no-stream

# 2. ヘルスチェック
curl -f http://localhost:3000/api/health || echo "Health check failed"

# 3. 最新ログ確認
docker compose logs --tail=50 web
docker compose logs --tail=20 redis

# 4. ディスク容量確認
df -h
docker system df

# 5. プロセス確認
docker compose top
```

### 🔍 一般的な緊急対応

| 症状 | 即座の対応 | 確認コマンド |
|------|-----------|-------------|
| サイトにアクセスできない | `docker compose restart web` | `curl localhost:3000` |
| データベースエラー | `docker compose restart web` | `docker compose logs web \| grep -i error` |
| メモリ不足 | `docker compose restart` | `free -h && docker stats` |
| ディスク満杯 | `docker system prune -f` | `df -h` |
| コンテナが停止 | `docker compose up -d` | `docker compose ps` |

---

## 🔧 システム要件と前提条件

### 最小要件

| 項目 | 要件 | 確認方法 |
|------|------|----------|
| **Docker** | 20.10.0+ | `docker --version` |
| **Docker Compose** | v2.0+ | `docker compose version` |
| **Node.js** | 24.7.0+ | `node --version` (コンテナ内) |
| **メモリ** | 2GB以上 | `free -h` |
| **ディスク** | 10GB以上 | `df -h` |
| **ポート** | 3000, 6379 利用可能 | `netstat -tulpn \| grep -E ":(3000\|6379)"` |

### 推奨要件

| 項目 | 推奨 | 理由 |
|------|------|------|
| **メモリ** | 4GB以上 | 複数MCPサーバー同時実行 |
| **CPU** | 4コア以上 | 並列処理・ビルド高速化 |
| **ディスク** | SSD 20GB以上 | データベース・ログ・イメージ |
| **ネットワーク** | 安定した接続 | Docker Hub・外部API |

### 環境確認スクリプト

```bash
#!/bin/bash
# system-check.sh - システム要件確認

echo "=== Docker MCP Web Manager システム要件確認 ==="

# Docker バージョン確認
echo -n "Docker: "
docker --version 2>/dev/null || echo "❌ 未インストール"

echo -n "Docker Compose: "
docker compose version 2>/dev/null || echo "❌ 未インストール"

# システムリソース確認
echo -n "メモリ: "
free -h | awk 'NR==2{printf "%.1fGB 使用可能\n", $7/1024/1024}'

echo -n "ディスク: "
df -h . | awk 'NR==2{print $4" 利用可能"}'

# ポート確認
echo "ポート確認:"
for port in 3000 6379; do
  if netstat -tulpn 2>/dev/null | grep -q ":$port "; then
    echo "  ❌ ポート $port は使用中"
  else
    echo "  ✅ ポート $port は利用可能"
  fi
done

# Docker サービス確認
echo -n "Docker サービス: "
if systemctl is-active --quiet docker 2>/dev/null; then
  echo "✅ 実行中"
else
  echo "❌ 停止中"
fi

echo "==============================================="
```

---

## 🐳 Docker関連の問題

### 1. コンテナが起動しない

#### 症状
- `docker compose up` でコンテナが開始後すぐ終了
- `Exited (1)` または `Exited (125)` の状態
- ヘルスチェックが失敗し続ける

#### 詳細診断

```bash
# 1. コンテナ状態の詳細確認
docker compose ps -a
docker compose logs --tail=100 web

# 2. イメージの確認
docker images | grep docker-mcp
docker compose config

# 3. ボリューム・ネットワークの確認
docker volume ls | grep docker-mcp
docker network ls | grep docker-mcp

# 4. リソース使用量確認
docker stats --no-stream
docker system df
```

#### よくある原因と解決法

**🔴 原因1: ポート競合**
```bash
# ポート使用状況の詳細確認
sudo netstat -tulpn | grep -E ":(3000|6379)"
sudo lsof -i :3000
sudo lsof -i :6379

# プロセス終了（注意：他のアプリケーションも終了する可能性）
sudo kill -9 $(lsof -ti:3000)

# ポート変更での回避
cat >> .env.local << EOF
WEB_PORT=3001
REDIS_PORT=6380
EOF
docker compose up -d
```

**🔴 原因2: ボリューム権限問題**
```bash
# 権限問題の詳細診断
ls -la ./data
stat ./data
namei -l ./data

# 権限修正（開発環境）
sudo chown -R $(id -u):$(id -g) ./data ./coverage ./test-results
chmod -R 755 ./data

# SELinux環境での対応
sudo setsebool -P container_manage_cgroup on
sudo chcon -Rt svirt_sandbox_file_t ./data
```

**🔴 原因3: メモリ・リソース不足**
```bash
# 詳細リソース確認
free -h
cat /proc/meminfo | grep -E "(MemAvailable|MemFree|SwapFree)"
docker system events &  # リアルタイムイベント監視

# メモリクリーンアップ
sudo sync
sudo sysctl vm.drop_caches=3
docker system prune -a --volumes

# リソース制限調整
cat >> docker-compose.override.yml << EOF
services:
  web:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '2'
        reservations:
          memory: 512M
          cpus: '1'
  redis:
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
EOF
```

**🔴 原因4: Node.js/依存関係問題**
```bash
# Node.js 環境確認
docker compose exec web node --version
docker compose exec web npm --version

# 依存関係の問題診断
docker compose exec web npm ls --depth=0
docker compose exec web npm audit

# 依存関係の修復
docker compose exec web npm ci --only=production
docker compose exec web npm dedupe

# ビルドキャッシュクリア
docker compose build --no-cache web
```

### 2. ビルドエラー

#### 症状
- `docker compose build` でエラーが発生
- "no space left on device" エラー
- 依存関係のインストールエラー

#### 診断と解決

```bash
# ビルドコンテキストとDockerfile確認
docker compose config
cat Dockerfile

# 詳細ビルドログの確認
DOCKER_BUILDKIT=0 docker compose build --no-cache --progress=plain web

# ディスク容量とBuildKitキャッシュクリーンアップ
docker system df
docker builder prune -a
docker buildx prune

# イメージレイヤーの分析
docker history docker-mcp-web-manager-web:latest
```

**マルチステージビルドの最適化**
```dockerfile
# Dockerfile の最適化例
FROM node:24.7.0-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund

FROM node:24.7.0-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24.7.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
```

### 3. ネットワーク・通信問題

#### 症状
- コンテナ間通信ができない
- 外部API（Docker Hub等）にアクセスできない
- タイムアウトエラーが頻発

#### 診断

```bash
# ネットワーク設定の確認
docker network ls
docker network inspect docker-mcp-web-manager_app-network

# コンテナ間接続テスト
docker compose exec web ping -c 3 redis
docker compose exec web nslookup redis
docker compose exec web telnet redis 6379

# 外部接続テスト
docker compose exec web ping -c 3 8.8.8.8
docker compose exec web curl -I https://registry-1.docker.io
docker compose exec web nslookup docker.io

# DNS設定確認
docker compose exec web cat /etc/resolv.conf
```

#### 解決法

```bash
# ネットワーク再作成
docker compose down
docker network prune -f
docker compose up -d

# カスタムネットワーク設定
cat >> docker-compose.override.yml << EOF
networks:
  app-network:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.default_bridge: "false"
      com.docker.network.bridge.enable_icc: "true"
      com.docker.network.bridge.enable_ip_masquerade: "true"
    ipam:
      config:
        - subnet: 172.20.0.0/16
EOF

# DNS設定のカスタマイズ
cat >> docker-compose.override.yml << EOF
services:
  web:
    dns:
      - 8.8.8.8
      - 1.1.1.1
    extra_hosts:
      - "host.docker.internal:host-gateway"
EOF
```

---

## 🗄️ データベース関連の問題

### 1. SQLite データベース問題

#### 症状
- `database is locked` エラー
- `SQLITE_BUSY` エラー
- データベースファイルが見つからない
- マイグレーションエラー

#### 詳細診断

```bash
# データベースファイルとプロセス確認
ls -la ./data/app.db*
file ./data/app.db
sudo lsof ./data/app.db 2>/dev/null || echo "ファイルは使用されていません"

# SQLite バージョンと設定確認
docker compose exec web sqlite3 --version
docker compose exec web sqlite3 /app/data/app.db ".timeout"
docker compose exec web sqlite3 /app/data/app.db "PRAGMA busy_timeout;"

# データベース整合性チェック
docker compose exec web sqlite3 /app/data/app.db "PRAGMA integrity_check;"
docker compose exec web sqlite3 /app/data/app.db "PRAGMA foreign_key_check;"
```

#### 解決法

**🔒 データベースロックの解決**
```bash
# 1. 使用中プロセスの確認と終了
docker compose exec web ps aux | grep sqlite
docker compose stop web
sleep 5

# 2. ロックファイルの削除
rm -f ./data/app.db-wal ./data/app.db-shm

# 3. データベース修復
docker compose exec web sqlite3 /app/data/app.db << EOF
.timeout 30000
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=memory;
.exit
EOF

# 4. 強制ロック解除（最終手段）
docker compose exec web sqlite3 /app/data/app.db << EOF
BEGIN IMMEDIATE;
ROLLBACK;
.exit
EOF
```

**📁 データベース再作成**
```bash
# 1. バックアップ作成
timestamp=$(date +%Y%m%d_%H%M%S)
docker compose exec web cp /app/data/app.db /app/data/app.db.backup_$timestamp

# 2. データエクスポート（可能な場合）
docker compose exec web sqlite3 /app/data/app.db ".dump" > backup_$timestamp.sql

# 3. データベース初期化
docker compose exec web rm -f /app/data/app.db*
docker compose exec web npm run db:push

# 4. データの復元（必要に応じて）
if [ -f "backup_$timestamp.sql" ]; then
  docker compose exec web sqlite3 /app/data/app.db < backup_$timestamp.sql
fi
```

### 2. Drizzle ORM 関連問題

#### 症状
- `npm run db:push` でエラー
- スキーマの不整合
- マイグレーションの失敗

#### 診断と解決

```bash
# Drizzle 設定確認
docker compose exec web cat drizzle.config.ts
docker compose exec web npm run db:check

# スキーマ生成と適用
docker compose exec web npm run db:generate
docker compose exec web npm run db:push --force

# データベーススキーマ確認
docker compose exec web sqlite3 /app/data/app.db << EOF
.schema
.tables
.exit
EOF

# テーブル詳細確認
docker compose exec web sqlite3 /app/data/app.db << EOF
PRAGMA table_info(mcp_servers);
PRAGMA table_info(users);
.exit
EOF
```

**スキーマ問題の修復**
```bash
# 1. 現在のスキーマをバックアップ
docker compose exec web sqlite3 /app/data/app.db ".schema" > current_schema.sql

# 2. Drizzle 強制再同期
docker compose exec web npm run db:drop
docker compose exec web npm run db:generate
docker compose exec web npm run db:push

# 3. 開発データの再作成
docker compose exec web npm run db:seed
```

---

## 🔐 認証・セッション問題

### 1. NextAuth.js 認証問題

#### 症状
- ログインページに無限リダイレクト
- `[next-auth][error]` エラー
- セッションがすぐに切れる
- CSRFエラー

#### 詳細診断

```bash
# NextAuth 設定確認
docker compose exec web env | grep NEXTAUTH
docker compose exec web env | grep AUTH

# セッション状態確認
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli keys "*session*" | head -10
docker compose exec redis redis-cli ttl "session:your-session-id"

# ログ詳細確認
docker compose logs web | grep -i "next-auth\|auth\|session" | tail -20
```

#### 解決法

**🔑 NextAuth 設定の修正**
```bash
# 1. 環境変数の生成・設定
openssl rand -base64 32  # NEXTAUTH_SECRET用

# 2. .env.local での設定例
cat >> .env.local << EOF
NEXTAUTH_SECRET=your-generated-secret-here
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_DEBUG=true
EOF

# 3. プロバイダー設定確認
docker compose exec web cat src/lib/auth.ts
```

**🗄️ セッションストア問題の解決**
```bash
# Redis 接続確認
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli info replication

# セッションクリアと再起動
docker compose exec redis redis-cli flushdb
docker compose restart web

# Redis 設定最適化
docker compose exec redis redis-cli config set maxmemory 256mb
docker compose exec redis redis-cli config set maxmemory-policy allkeys-lru
```

### 2. 権限・認可エラー

#### 症状
- "権限が不足しています" エラー
- API アクセス拒否
- ロール設定が反映されない

#### 診断と解決

```bash
# ユーザー権限確認
docker compose exec web sqlite3 /app/data/app.db << EOF
SELECT id, email, role, permissions FROM users;
.exit
EOF

# セッション内容確認（デバッグモード）
# ブラウザ開発者ツール → Application → Storage → next-auth.session-token

# 権限チェック関数のテスト
docker compose exec web node -e "
const { requirePermissions } = require('./src/lib/auth');
console.log('Permission check function loaded');
"
```

---

## 🔧 MCP サーバー管理の問題

### 1. MCPサーバーが起動しない

#### 症状
- サーバー作成後に "error" 状態
- Docker コンテナが起動しない
- ポート競合エラー

#### 診断

```bash
# MCP サーバーコンテナ確認
docker ps -a | grep mcp
docker logs mcp-server-container-name

# ポート使用状況確認
netstat -tulpn | grep :3000-4000

# リソース使用量確認
docker stats --no-stream
```

#### 解決法

```bash
# 1. 個別MCPサーバーの再作成
# API経由での削除・再作成
curl -X DELETE "http://localhost:3000/api/v1/servers/server-id" \
  -H "Cookie: session-token"

# 2. Docker ネットワーク再作成
docker network ls | grep mcp
docker network prune

# 3. 利用可能ポートでの再作成
curl -X POST "http://localhost:3000/api/v1/servers" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-server","image":"node:latest","port":3001}'
```

### 2. MCP プロトコル通信エラー

#### 症状
- WebSocket 接続エラー
- MCP メッセージ送受信失敗
- プロトコルバージョン不整合

#### 診断と解決

```bash
# WebSocket 接続テスト
wscat -c ws://localhost:3000/api/ws

# MCP サーバーのログ確認
docker logs mcp-server-container --tail=50

# プロトコルバージョン確認
curl -s "http://localhost:3000/api/v1/servers/server-id" | jq '.data.mcpVersion'
```

---

## ⚡ パフォーマンス問題

### 1. アプリケーション応答が遅い

#### 症状
- ページ読み込みが5秒以上
- API レスポンスが遅い
- CPU 使用率が高い

#### 詳細診断

```bash
# 1. リソース使用量の継続監視
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 2. アプリケーション内部メトリクス
curl -s "http://localhost:3000/api/v1/monitoring" | jq '.data.api'

# 3. データベースパフォーマンス
docker compose exec web sqlite3 /app/data/app.db << EOF
.timer on
SELECT COUNT(*) FROM mcp_servers;
.exit
EOF

# 4. ネットワーク遅延確認
docker compose exec web time curl -s http://redis:6379/ping
```

#### 最適化手順

**🚀 Next.js アプリケーション最適化**
```bash
# 1. 本番ビルドでの動作確認
docker compose exec web npm run build
docker compose exec web npm run start

# 2. バンドルサイズ分析
docker compose exec web npm run analyze

# 3. メモリリーク確認
docker compose exec web node --inspect-brk=0.0.0.0:9229 server.js
```

**⚡ データベース最適化**
```bash
# SQLite 最適化設定
docker compose exec web sqlite3 /app/data/app.db << EOF
PRAGMA optimize;
PRAGMA wal_checkpoint;
PRAGMA vacuum;
ANALYZE;
.exit
EOF
```

**📦 Redis 最適化**
```bash
# Redis メモリ使用量確認
docker compose exec redis redis-cli info memory

# Redis 設定最適化
docker compose exec redis redis-cli config set save "900 1 300 10 60 10000"
docker compose exec redis redis-cli config set maxmemory-policy allkeys-lru
```

### 2. メモリリークの診断

#### 症状
- メモリ使用量が時間とともに増加
- OOM Killer によるコンテナ終了
- スワップの過度な使用

#### 診断ツール

```bash
# 1. メモリ使用量の継続監視
#!/bin/bash
# memory-monitor.sh
while true; do
  echo "$(date): $(docker stats --no-stream --format 'table {{.Container}}\t{{.MemUsage}}' | grep web)"
  sleep 60
done

# 2. Node.js メモリプロファイリング
docker compose exec web node --inspect=0.0.0.0:9229 --max-old-space-size=512 server.js

# 3. ヒープダンプ生成
docker compose exec web kill -USR2 $(docker compose exec web pidof node)
```

---

## 🌐 API関連の問題

### 1. API エラーと診断

#### よくあるAPIエラー

| エラーコード | HTTPステータス | 症状 | 解決法 |
|-------------|---------------|------|--------|
| `VALIDATION_ERROR` | 400 | リクエストデータが不正 | リクエスト形式確認 |
| `UNAUTHORIZED` | 401 | 認証失敗 | セッション確認 |
| `FORBIDDEN` | 403 | 権限不足 | ユーザーロール確認 |
| `NOT_FOUND` | 404 | リソースが見つからない | URL・IDの確認 |
| `RATE_LIMITED` | 429 | レート制限 | アクセス頻度調整 |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー | ログ確認 |

#### 診断手順

```bash
# 1. API ヘルスチェック
curl -f "http://localhost:3000/api/health"

# 2. 認証状態確認
curl -H "Cookie: your-session-cookie" "http://localhost:3000/api/v1/servers"

# 3. エラーレスポンス詳細確認
curl -v -X POST "http://localhost:3000/api/v1/servers" \
  -H "Content-Type: application/json" \
  -d '{"invalid":"data"}'

# 4. レート制限確認
for i in {1..10}; do
  curl -w "%{http_code}\n" -o /dev/null -s "http://localhost:3000/api/v1/servers"
done
```

### 2. WebSocket 接続問題

#### 症状
- WebSocket 接続が確立されない
- リアルタイム更新が動作しない
- 接続が頻繁に切断される

#### 診断と解決

```bash
# 1. WebSocket 接続テスト
wscat -c "ws://localhost:3000/api/ws"

# 2. ブラウザでの接続確認
# 開発者ツール → Network → WS でWebSocketトラフィック確認

# 3. プロキシ設定確認（本番環境）
curl -H "Upgrade: websocket" \
     -H "Connection: Upgrade" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     "http://localhost:3000/api/ws"
```

---

## 🎨 UI・フロントエンド問題

### 1. React/Next.js 関連エラー

#### 症状
- 白い画面（WSOD）
- Hydration エラー
- "Cannot read property" エラー

#### 診断

```bash
# 1. ブラウザコンソールエラー確認
# 開発者ツール → Console

# 2. Next.js エラーページ確認
curl -H "Accept: text/html" "http://localhost:3000/non-existent-page"

# 3. React DevTools でコンポーネント状態確認
# React Developer Tools ブラウザ拡張機能を使用
```

#### 解決法

```bash
# 1. フロントエンド依存関係の修復
docker compose exec web npm ci
docker compose exec web npm audit fix

# 2. Next.js キャッシュクリア
docker compose exec web rm -rf .next
docker compose exec web npm run build

# 3. ブラウザキャッシュクリア
# Ctrl+Shift+R でハードリフレッシュ
```

### 2. CSS・スタイリング問題

#### 症状
- スタイルが適用されない
- レイアウトが崩れる
- Tailwind CSS が動作しない

#### 解決法

```bash
# 1. Tailwind CSS 設定確認
docker compose exec web cat tailwind.config.js
docker compose exec web npm run build:css

# 2. PostCSS 設定確認
docker compose exec web cat postcss.config.mjs

# 3. スタイルの再生成
docker compose exec web npm run dev
```

---

## 🌐 ネットワーク・接続問題

### 1. 外部サービス接続エラー

#### 症状
- Docker Hub からイメージをプルできない
- 外部 API にアクセスできない
- DNS 解決エラー

#### 診断

```bash
# 1. インターネット接続確認
docker compose exec web ping -c 3 8.8.8.8
docker compose exec web curl -I https://www.google.com

# 2. Docker Hub 接続確認
docker compose exec web curl -I https://registry-1.docker.io

# 3. DNS 設定確認
docker compose exec web nslookup docker.io
docker compose exec web cat /etc/resolv.conf
```

#### 解決法

```bash
# 1. プロキシ設定（企業環境）
cat >> docker-compose.override.yml << EOF
services:
  web:
    environment:
      - HTTP_PROXY=http://proxy:8080
      - HTTPS_PROXY=http://proxy:8080
      - NO_PROXY=localhost,127.0.0.1,redis
EOF

# 2. DNS 設定変更
cat >> docker-compose.override.yml << EOF
services:
  web:
    dns:
      - 8.8.8.8
      - 1.1.1.1
EOF
```

---

## 🔒 セキュリティ関連の問題

### 1. セキュリティエラー

#### 症状
- CORS エラー
- CSP (Content Security Policy) 違反
- SSL/TLS 証明書エラー

#### 診断と解決

```bash
# 1. CORS 設定確認
curl -H "Origin: http://localhost:3001" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS "http://localhost:3000/api/v1/servers"

# 2. セキュリティヘッダー確認
curl -I "http://localhost:3000/"

# 3. CSP 設定確認
docker compose exec web grep -r "Content-Security-Policy" src/
```

### 2. 暗号化・シークレット管理

#### 症状
- シークレットの復号化エラー
- 暗号化キーが見つからない

#### 解決法

```bash
# 1. 暗号化キー確認
docker compose exec web env | grep ENCRYPTION

# 2. シークレット管理テスト
curl -X POST "http://localhost:3000/api/v1/secrets" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","value":"secret123"}'

# 3. Bitwarden 接続確認
docker compose exec web which bw
docker compose exec web bw status
```

---

## 📊 ログ・監視の問題

### 1. ログが出力されない

#### 症状
- アプリケーションログが空
- 特定のレベルのログが出力されない

#### 解決法

```bash
# 1. ログレベル設定確認
docker compose exec web env | grep LOG_LEVEL

# 2. ログファイル権限確認
docker compose exec web ls -la /app/data/logs/

# 3. ログ設定のテスト
docker compose exec web node -e "
const logger = require('./src/lib/logger');
logger.info('Test log message');
logger.error('Test error message');
"
```

### 2. 監視データが取得できない

#### 症状
- `/api/v1/monitoring` がエラーを返す
- リアルタイムメトリクスが更新されない

#### 診断と解決

```bash
# 1. 監視エンドポイント確認
curl "http://localhost:3000/api/v1/monitoring"

# 2. システムメトリクス確認
docker compose exec web node -e "
const os = require('os');
console.log('CPU:', os.loadavg());
console.log('Memory:', process.memoryUsage());
"

# 3. Docker stats 取得テスト
docker stats --no-stream --format json
```

---

## 🧪 開発・テスト環境の問題

### 1. テスト実行エラー

#### 症状
- Jest テストが失敗する
- Playwright E2E テストがタイムアウト

#### 解決法

```bash
# 1. テスト環境の確認
docker compose exec web npm test -- --detectOpenHandles

# 2. E2E テスト環境準備
docker compose exec web npm run test:e2e:setup

# 3. テストデータベース初期化
docker compose exec web npm run db:test:reset
```

### 2. 開発サーバー問題

#### 症状
- ホットリロードが動作しない
- 環境変数が反映されない

#### 解決法

```bash
# 1. 開発モード確認
docker compose exec web env | grep NODE_ENV

# 2. ファイル監視確認
docker compose exec web npm run dev

# 3. ボリュームマウント確認
docker compose config | grep volumes -A 5
```

---

## ⚠️ 一般的なエラーコード

### システムエラー

| コード | 説明 | 対処法 |
|--------|------|--------|
| `SYS_001` | システム初期化エラー | 環境変数・設定ファイル確認 |
| `SYS_002` | 設定ファイルエラー | `docker-compose.yml` 構文確認 |
| `SYS_003` | データベース接続エラー | SQLite ファイル権限確認 |
| `SYS_004` | Redis 接続エラー | Redis コンテナ状態確認 |
| `SYS_005` | ファイルシステムエラー | ディスク容量・権限確認 |

### Docker エラー

| コード | 説明 | 対処法 |
|--------|------|--------|
| `DOCKER_001` | イメージプルエラー | ネットワーク接続確認 |
| `DOCKER_002` | コンテナ作成エラー | リソース・権限確認 |
| `DOCKER_003` | ボリュームマウントエラー | パス・権限確認 |
| `DOCKER_004` | ネットワークエラー | Docker ネットワーク再作成 |
| `DOCKER_005` | ポート競合エラー | ポート使用状況確認 |

### アプリケーションエラー

| コード | 説明 | 対処法 |
|--------|------|--------|
| `APP_001` | Next.js ビルドエラー | 依存関係・コード構文確認 |
| `APP_002` | API ルーティングエラー | ルート定義確認 |
| `APP_003` | 認証プロバイダーエラー | NextAuth 設定確認 |
| `APP_004` | セッション管理エラー | Redis 接続確認 |
| `APP_005` | ファイルアップロードエラー | 権限・容量確認 |

---

## 🆘 デバッグとサポート情報

### 自動診断スクリプト

以下のスクリプトで包括的な診断情報を収集できます：

```bash
#!/bin/bash
# diagnostics.sh - 包括的診断情報収集

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="diagnostics_${TIMESTAMP}.txt"

echo "Docker MCP Web Manager 診断レポート" > $REPORT_FILE
echo "生成日時: $(date)" >> $REPORT_FILE
echo "========================================" >> $REPORT_FILE

# システム情報
echo -e "\n=== システム情報 ===" >> $REPORT_FILE
uname -a >> $REPORT_FILE
docker --version >> $REPORT_FILE
docker compose version >> $REPORT_FILE

# リソース使用量
echo -e "\n=== リソース使用量 ===" >> $REPORT_FILE
free -h >> $REPORT_FILE
df -h >> $REPORT_FILE
docker system df >> $REPORT_FILE

# コンテナ状態
echo -e "\n=== コンテナ状態 ===" >> $REPORT_FILE
docker compose ps >> $REPORT_FILE
docker stats --no-stream >> $REPORT_FILE

# 設定ファイル
echo -e "\n=== 設定確認 ===" >> $REPORT_FILE
docker compose config >> $REPORT_FILE

# ログ（最新50行）
echo -e "\n=== アプリケーションログ ===" >> $REPORT_FILE
docker compose logs --tail=50 web >> $REPORT_FILE

echo -e "\n=== Redis ログ ===" >> $REPORT_FILE
docker compose logs --tail=20 redis >> $REPORT_FILE

# API ヘルスチェック
echo -e "\n=== API ヘルスチェック ===" >> $REPORT_FILE
curl -s "http://localhost:3000/api/health" >> $REPORT_FILE 2>&1

# データベース状態
echo -e "\n=== データベース状態 ===" >> $REPORT_FILE
docker compose exec web sqlite3 /app/data/app.db ".tables" >> $REPORT_FILE 2>&1

echo "診断レポートが生成されました: $REPORT_FILE"
```

### ログ収集スクリプト

```bash
#!/bin/bash
# collect-logs.sh - ログ収集

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="logs_${TIMESTAMP}"
mkdir -p $LOG_DIR

# Docker ログ
docker compose logs --no-color > "$LOG_DIR/docker-compose.log"
docker compose logs --no-color web > "$LOG_DIR/web.log"
docker compose logs --no-color redis > "$LOG_DIR/redis.log"

# アプリケーションログ
docker compose exec web tar czf - /app/data/logs 2>/dev/null | tar xzf - -C $LOG_DIR

# システム情報
docker compose config > "$LOG_DIR/docker-config.yml"
docker compose ps > "$LOG_DIR/container-status.txt"
docker stats --no-stream > "$LOG_DIR/resource-usage.txt"

echo "ログが収集されました: $LOG_DIR/"
```

### 緊急時クイックフィックス

```bash
#!/bin/bash
# quick-fix.sh - 緊急時の自動修復

echo "🚨 緊急時クイックフィックス実行中..."

# 1. 基本的なクリーンアップ
echo "1. システムクリーンアップ..."
docker system prune -f
docker volume prune -f

# 2. コンテナ再作成
echo "2. コンテナ再作成..."
docker compose down
docker compose up -d

# 3. ヘルスチェック
echo "3. ヘルスチェック..."
sleep 30
if curl -f "http://localhost:3000/api/health" > /dev/null 2>&1; then
  echo "✅ システムが正常に動作しています"
else
  echo "❌ システムに問題があります"
  echo "詳細ログを確認してください:"
  docker compose logs --tail=20 web
fi

# 4. リソース状態レポート
echo "4. リソース状態:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

### サポート連絡先

問題が解決しない場合は、以下の情報と共にサポートに連絡してください：

1. **診断レポート**: `diagnostics.sh` の実行結果
2. **ログファイル**: `collect-logs.sh` で収集したログ
3. **エラーメッセージ**: 正確なエラーメッセージのコピー
4. **再現手順**: 問題を再現するための具体的な手順
5. **環境情報**: OS、Docker バージョン、システム仕様

**GitHub Issues**: https://github.com/yourusername/docker-mcp-web-manager/issues
**Discord サポート**: https://discord.gg/docker-mcp
**メール**: support@docker-mcp.example.com

---

## 📚 関連ドキュメント

- [API 仕様書](./docs/api/README.md)
- [開発者ガイド](./docs/development/README.md)
- [セットアップガイド](./docs/setup/README.md)
- [セキュリティガイド](./docs/security/README.md)
- [デプロイメントガイド](./docs/deployment/README.md)

---

*このトラブルシューティングガイドは定期的に更新されます。最新版は [GitHub リポジトリ](https://github.com/yourusername/docker-mcp-web-manager) で確認してください。*