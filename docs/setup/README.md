# Docker MCP Web Manager v2 - セットアップガイド

## 概要

Docker MCP Web Manager v2は、MCPサーバーの包括的な管理を提供するWebアプリケーションです。このガイドでは、システムの初期インストールから本番環境での運用開始まで、段階的にセットアップ手順を説明します。

## システム要件

### 最小システム要件

#### ハードウェア
- **CPU**: 2コア以上
- **メモリ**: 4GB以上
- **ストレージ**: 10GB以上の空き容量
- **ネットワーク**: インターネット接続（Docker イメージ取得用）

#### ソフトウェア
- **OS**: Linux（Ubuntu 20.04+推奨）、macOS、Windows（WSL2）
- **Docker**: 20.10+
- **Docker Compose**: V2
- **Node.js**: 24.7.0+（開発環境の場合）
- **Git**: 2.30+

### 推奨システム要件

#### ハードウェア
- **CPU**: 4コア以上
- **メモリ**: 8GB以上
- **ストレージ**: 50GB以上の空き容量（SSD推奨）
- **ネットワーク**: 高速インターネット接続

#### ソフトウェア
- **OS**: Ubuntu 22.04 LTS
- **Docker**: 最新安定版
- **Docker Compose**: 最新V2

## インストール手順

### 1. 前提条件の確認

#### Docker のインストール確認
```bash
# Docker バージョン確認
docker --version
# 期待値: Docker version 20.10+

# Docker Compose バージョン確認
docker compose version
# 期待値: Docker Compose version v2.0+

# Docker デーモン状態確認
sudo systemctl status docker
```

#### Docker がインストールされていない場合
```bash
# Ubuntu の場合
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Docker Compose インストール
sudo apt update
sudo apt install docker-compose-plugin
```

### 2. リポジトリのクローン

```bash
# リポジトリをクローン
git clone https://github.com/your-org/docker-mcp-web-manager-v2.git
cd docker-mcp-web-manager-v2

# ブランチの確認
git branch -a
git checkout main
```

### 3. 環境設定

#### 3.1 環境変数ファイルの作成

```bash
# 環境変数ファイルを作成
cp .env.example .env.local
```

#### 3.2 必須環境変数の設定

`.env.local` ファイルを編集し、以下の項目を設定してください：

```bash
# NextAuth.js 設定（必須）
NEXTAUTH_SECRET=your-secret-key-here-32-characters-long
NEXTAUTH_URL=http://localhost:3000

# データベース設定（必須）
DATABASE_URL=file:./data/app.db

# 暗号化設定（必須）
ENCRYPTION_MASTER_KEY=base64-encoded-32-byte-key

# Docker 設定
DOCKER_HOST=unix:///var/run/docker.sock

# ログレベル
LOG_LEVEL=info
```

#### 3.3 暗号化キーの生成

```bash
# 安全な暗号化キーを生成
node -e "console.log('ENCRYPTION_MASTER_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

# または OpenSSL を使用
openssl rand -base64 32
```

生成されたキーを `.env.local` の `ENCRYPTION_MASTER_KEY` に設定してください。

#### 3.4 NextAuth シークレットの生成

```bash
# NextAuth シークレットを生成
node -e "console.log('NEXTAUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# または OpenSSL を使用
openssl rand -hex 32
```

### 4. Docker Compose でのデプロイ

#### 4.1 本番環境設定

```bash
# 本番用環境変数を設定
cp .env.example .env.production
```

`.env.production` を編集：
```bash
NODE_ENV=production
LOG_LEVEL=error
NEXTAUTH_URL=https://your-domain.com

# 本番用データベース（PostgreSQL推奨）
DATABASE_URL=postgresql://user:password@db:5432/docker_mcp_web_manager

# セキュリティ設定
SECURE_COOKIES=true
CSRF_SECRET=your-csrf-secret-here
```

#### 4.2 Docker Compose 起動

```bash
# 本番環境で起動
docker compose -f docker-compose.prod.yml up -d

# ログの確認
docker compose -f docker-compose.prod.yml logs -f
```

#### 4.3 データベースの初期化

```bash
# データベースマイグレーション実行
docker compose -f docker-compose.prod.yml exec web npm run db:push

# 初期データの投入（管理者アカウント作成）
docker compose -f docker-compose.prod.yml exec web npm run db:seed
```

### 5. 開発環境でのセットアップ

開発環境で作業する場合の手順：

```bash
# 依存関係のインストール
npm install

# データベースのセットアップ
npm run db:push
npm run db:seed

# 開発サーバーの起動
npm run dev
```

## 初期設定

### 1. 管理者アカウントの設定

#### 1.1 初回ログイン

1. ブラウザで `http://localhost:3000`（または設定したURL）にアクセス
2. 「初回セットアップ」をクリック
3. 管理者アカウント情報を入力：
   - メールアドレス
   - パスワード（最低8文字、英数字・記号を含む）
   - 表示名

#### 1.2 セットアップ完了の確認

```bash
# アプリケーションの健全性チェック
curl http://localhost:3000/api/health

# 期待されるレスポンス
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. システム設定

#### 2.1 基本設定

ダッシュボードにログイン後、「設定」→「システム設定」で以下を設定：

1. **システム名**: 組織に応じた名前を設定
2. **タイムゾーン**: 適切なタイムゾーンを選択
3. **言語設定**: 日本語または英語を選択
4. **セッションタイムアウト**: セキュリティ要件に応じて設定（デフォルト: 24時間）

#### 2.2 セキュリティ設定

1. **パスワードポリシー**: 組織の要件に応じて設定
2. **多要素認証**: 利用可能であれば有効化
3. **APIレート制限**: 必要に応じて調整
4. **監査ログ**: 有効化（推奨）

### 3. Bitwarden 連携設定（オプション）

シークレット管理にBitwardenを使用する場合：

#### 3.1 Bitwarden CLI のインストール

```bash
# Bitwarden CLI インストール
npm install -g @bitwarden/cli

# バージョン確認
bw --version
```

#### 3.2 環境変数の追加

`.env.local` または `.env.production` に追加：

```bash
# Bitwarden 設定
BITWARDEN_SERVER_URL=https://vault.bitwarden.com
BITWARDEN_SESSION_TOKEN=your-session-token-here
```

#### 3.3 Bitwarden 認証

```bash
# Bitwarden ログイン
bw login your-email@example.com

# セッション取得
bw unlock
# 出力されたセッショントークンを BITWARDEN_SESSION_TOKEN に設定
```

## ネットワーク設定

### 1. ファイアウォール設定

#### Ubuntu/Debian の場合
```bash
# UFW設定例
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw --force enable
```

#### Docker用設定
```bash
# Docker ネットワークの設定
sudo ufw allow in on docker0
```

### 2. リバースプロキシ設定（Nginx）

#### 2.1 Nginx インストール

```bash
sudo apt update
sudo apt install nginx
```

#### 2.2 設定ファイル作成

`/etc/nginx/sites-available/docker-mcp-web-manager` を作成：

```nginx
upstream docker_mcp_web_manager {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # HTTPS リダイレクト
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL証明書設定
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    
    # セキュリティヘッダー
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    
    location / {
        proxy_pass http://docker_mcp_web_manager;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 2.3 設定の有効化

```bash
sudo ln -s /etc/nginx/sites-available/docker-mcp-web-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL証明書の設定（Let's Encrypt）

```bash
# Certbot インストール
sudo apt install certbot python3-certbot-nginx

# 証明書取得
sudo certbot --nginx -d your-domain.com

# 自動更新設定
sudo crontab -e
# 以下を追加
0 12 * * * /usr/bin/certbot renew --quiet
```

## バックアップ設定

### 1. データベースバックアップ

#### 1.1 バックアップスクリプト作成

`/opt/backup-mcp-db.sh` を作成：

```bash
#!/bin/bash

# 設定
BACKUP_DIR="/opt/backups/docker-mcp-web-manager"
DB_CONTAINER="docker-mcp-web-manager-db-1"
DATE=$(date +"%Y%m%d_%H%M%S")

# バックアップディレクトリ作成
mkdir -p $BACKUP_DIR

# SQLite データベースバックアップ
docker exec $DB_CONTAINER sqlite3 /app/data/app.db ".backup /tmp/backup_$DATE.db"
docker cp $DB_CONTAINER:/tmp/backup_$DATE.db $BACKUP_DIR/

# 古いバックアップの削除（30日以上）
find $BACKUP_DIR -name "backup_*.db" -mtime +30 -delete

echo "バックアップ完了: $BACKUP_DIR/backup_$DATE.db"
```

#### 1.2 権限設定と自動化

```bash
sudo chmod +x /opt/backup-mcp-db.sh

# cron設定（毎日午前2時にバックアップ）
sudo crontab -e
# 以下を追加
0 2 * * * /opt/backup-mcp-db.sh
```

### 2. 設定ファイルバックアップ

```bash
# 設定ファイルのバックアップ
tar -czf /opt/backups/config_$(date +"%Y%m%d").tar.gz \
  /path/to/docker-mcp-web-manager/.env.production \
  /path/to/docker-mcp-web-manager/docker-compose.prod.yml \
  /etc/nginx/sites-available/docker-mcp-web-manager
```

## 監視とログ

### 1. ログ設定

#### 1.1 Docker ログ確認

```bash
# アプリケーションログ
docker compose -f docker-compose.prod.yml logs -f web

# 特定の期間のログ
docker compose -f docker-compose.prod.yml logs --since="2024-01-01T00:00:00Z" --until="2024-01-02T00:00:00Z"

# エラーログのみ
docker compose -f docker-compose.prod.yml logs web | grep ERROR
```

#### 1.2 システムログ設定

`/etc/logrotate.d/docker-mcp-web-manager` を作成：

```
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=1M
    missingok
    delaycompress
    copytruncate
}
```

### 2. ヘルスチェック

#### 2.1 基本ヘルスチェック

```bash
#!/bin/bash
# /opt/health-check.sh

HEALTH_ENDPOINT="http://localhost:3000/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_ENDPOINT)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): システムは正常に動作しています"
    exit 0
else
    echo "$(date): システムエラーを検出しました (HTTP $RESPONSE)"
    exit 1
fi
```

#### 2.2 監視スクリプトの設定

```bash
sudo chmod +x /opt/health-check.sh

# cron設定（5分おきにチェック）
sudo crontab -e
# 以下を追加
*/5 * * * * /opt/health-check.sh >> /var/log/docker-mcp-web-manager-health.log 2>&1
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. Docker 起動エラー

**症状**: `docker compose up` が失敗する

**解決方法**:
```bash
# Docker サービス状態確認
sudo systemctl status docker

# Docker サービス再起動
sudo systemctl restart docker

# ディスク容量確認
df -h

# 不要なコンテナ・イメージの削除
docker system prune -a
```

#### 2. データベース接続エラー

**症状**: "Database connection failed" エラー

**解決方法**:
```bash
# データベースファイルの権限確認
ls -la ./data/

# データベースディレクトリの作成
mkdir -p ./data

# 権限設定
chmod 755 ./data
```

#### 3. 認証エラー

**症状**: "Authentication failed" または "Invalid session"

**解決方法**:
```bash
# 環境変数の確認
docker compose -f docker-compose.prod.yml exec web printenv | grep NEXTAUTH

# セッションの クリア
docker compose -f docker-compose.prod.yml restart web

# 新しいシークレットキーの生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 4. パフォーマンス問題

**症状**: アプリケーションの応答が遅い

**解決方法**:
```bash
# リソース使用量確認
docker stats

# メモリ不足の場合、スワップ有効化
sudo swapon --show
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# データベースの最適化
docker compose -f docker-compose.prod.yml exec web npm run db:optimize
```

### ログ分析

#### エラーログの確認

```bash
# アプリケーションエラーログ
docker compose -f docker-compose.prod.yml logs web | grep -i error

# システムエラーログ
sudo journalctl -u docker.service -f

# Nginx エラーログ
sudo tail -f /var/log/nginx/error.log
```

#### パフォーマンス分析

```bash
# Docker リソース使用量
docker compose -f docker-compose.prod.yml top

# システムリソース
htop
iotop
```

## セキュリティ強化

### 1. 基本セキュリティ設定

#### 1.1 ファイアウォール強化

```bash
# Docker ネットワークの分離
sudo ufw deny in on docker0 from any to any

# 特定のIPアドレスからのみアクセス許可
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000
```

#### 1.2 Docker セキュリティ

```bash
# Docker rootless モードの設定（推奨）
dockerd-rootless-setuptool.sh install

# セキュリティスキャン
docker scout cves docker-mcp-web-manager:latest
```

### 2. 定期的なセキュリティ更新

```bash
#!/bin/bash
# /opt/security-update.sh

# システムパッケージ更新
sudo apt update && sudo apt upgrade -y

# Docker イメージ更新
cd /path/to/docker-mcp-web-manager
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 不要なイメージ削除
docker image prune -a -f

echo "セキュリティ更新完了: $(date)"
```

## 運用開始チェックリスト

セットアップ完了後、以下の項目を確認してから運用を開始してください：

### 基本機能確認
- [ ] アプリケーションが正常に起動する
- [ ] 管理者アカウントでログインできる
- [ ] ダッシュボードが表示される
- [ ] サーバー一覧が表示される

### セキュリティ確認
- [ ] HTTPS接続が機能する
- [ ] 不正なアクセスが拒否される
- [ ] セッションタイムアウトが動作する
- [ ] ログが適切に記録される

### パフォーマンス確認
- [ ] ページの読み込み時間が許容範囲内
- [ ] データベースクエリが最適化されている
- [ ] メモリ使用量が適切な範囲内
- [ ] CPU使用率が許容範囲内

### バックアップ・監視確認
- [ ] 自動バックアップが動作する
- [ ] ヘルスチェックが機能する
- [ ] ログローテーションが設定されている
- [ ] アラート設定が適切

### 運用確認
- [ ] 運用マニュアルを作成・共有
- [ ] 管理者権限を適切に設定
- [ ] 緊急時対応手順を整備
- [ ] 定期メンテナンス計画を策定

## サポートとリソース

### ドキュメント
- [API仕様書](../api/README.md)
- [開発者ガイド](../development/README.md)
- [アーキテクチャ概要](../architecture/README.md)

### コミュニティとサポート
- **Issues**: [GitHub Issues](https://github.com/your-org/docker-mcp-web-manager-v2/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/docker-mcp-web-manager-v2/discussions)
- **Documentation**: [公式ドキュメント](https://docs.your-domain.com)
- **Email**: support@your-domain.com

### 緊急時連絡先
- **システム障害**: emergency@your-domain.com
- **セキュリティ問題**: security@your-domain.com
- **技術サポート**: tech-support@your-domain.com

---

このセットアップガイドに従って正しく設定することで、Docker MCP Web Manager v2を安全かつ効率的に運用することができます。

ご不明な点やサポートが必要な場合は、上記のサポートリソースをご利用ください。