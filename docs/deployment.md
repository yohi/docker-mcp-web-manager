# デプロイガイド

## 概要

Docker MCP Web Manager の本番環境へのデプロイ手順を詳細に説明します。

## 前提条件

### システム要件

- **OS**: Ubuntu 20.04 LTS 以上 / CentOS 8 以上 / Red Hat Enterprise Linux 8 以上
- **CPU**: 最低 2 コア (推奨: 4 コア以上)
- **メモリ**: 最低 4GB (推奨: 8GB以上)
- **ストレージ**: 最低 20GB の空き容量 (推奨: 50GB以上)
- **ネットワーク**: 安定したインターネット接続

### 必要なソフトウェア

- **Docker**: 20.10.0 以上
- **Docker Compose**: 2.0.0 以上
- **Git**: 2.0 以上
- **Node.js**: 18.0.0 以上 (開発時のみ)

## 本番環境デプロイ

### 1. システム準備

#### Docker のインストール

```bash
# Ubuntu/Debian の場合
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# ユーザーを docker グループに追加
sudo usermod -aG docker $USER
newgrp docker

# Docker Compose のインストール
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# インストール確認
docker --version
docker-compose --version
```

#### システム設定

```bash
# ファイアウォール設定 (必要に応じて)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp

# システム制限の調整
echo "fs.file-max = 65536" | sudo tee -a /etc/sysctl.conf
echo "vm.max_map_count = 262144" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# ログローテーション設定
sudo mkdir -p /etc/logrotate.d
cat << EOF | sudo tee /etc/logrotate.d/docker-mcp-web-manager
/var/log/docker-mcp-web-manager/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF
```

### 2. アプリケーションのセットアップ

#### リポジトリのクローン

```bash
# 作業ディレクトリの作成
sudo mkdir -p /opt/docker-mcp-web-manager
sudo chown $USER:$USER /opt/docker-mcp-web-manager
cd /opt/docker-mcp-web-manager

# リポジトリのクローン
git clone https://github.com/your-org/docker-mcp-web-manager.git .
git checkout main
```

#### 環境設定

```bash
# 環境変数ファイルの作成
cp .env.example .env.production

# セキュアな値の生成
NEXTAUTH_SECRET=$(openssl rand -base64 32)
CSRF_SECRET_KEY=$(openssl rand -base64 32)

# .env.production の編集
nano .env.production
```

`.env.production` の設定例:

```env
# 基本設定
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
PORT=3000

# NextAuth.js 設定
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-generated-nextauth-secret-here

# データベース設定 (本番用)
DATABASE_URL=postgresql://username:password@db:5432/mcp_manager
# SQLite の場合: DATABASE_URL=sqlite:/data/production.db

# Docker MCP CLI 設定
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_API_VERSION=1.41

# セキュリティ設定
CSRF_SECRET_KEY=your-generated-csrf-secret-here
ALLOWED_ORIGINS=https://your-domain.com

# Redis設定 (セッション管理)
REDIS_URL=redis://redis:6379

# ログ設定
LOG_LEVEL=info
LOG_ENDPOINT=https://your-log-service.com/api/logs
LOG_API_KEY=your-log-api-key

# SSL/TLS設定
SSL_CERT_PATH=/etc/ssl/certs/cert.pem
SSL_KEY_PATH=/etc/ssl/private/key.pem

# 監視設定
HEALTH_CHECK_INTERVAL=30
METRICS_ENABLED=true
PROMETHEUS_PORT=9090

# レート制限
RATE_LIMIT_REQUESTS=1000
RATE_LIMIT_WINDOW=3600

# バックアップ設定
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=30
```

### 3. SSL/TLS 証明書の設定

#### Let's Encrypt を使用する場合

```bash
# Certbot のインストール
sudo apt-get update
sudo apt-get install certbot

# 証明書の取得
sudo certbot certonly --standalone -d your-domain.com

# 証明書の自動更新設定
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -

# Docker Compose 用に証明書をコピー
sudo mkdir -p /opt/docker-mcp-web-manager/certs
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/docker-mcp-web-manager/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/docker-mcp-web-manager/certs/
sudo chown $USER:$USER /opt/docker-mcp-web-manager/certs/*
```

#### 自己署名証明書の作成（開発・テスト用）

```bash
# 証明書ディレクトリの作成
mkdir -p /opt/docker-mcp-web-manager/certs

# 自己署名証明書の生成
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /opt/docker-mcp-web-manager/certs/key.pem \
  -out /opt/docker-mcp-web-manager/certs/cert.pem \
  -subj "/C=JP/ST=Tokyo/L=Tokyo/O=YourOrg/CN=your-domain.com"
```

### 4. Docker Compose 設定

本番用の `docker-compose.prod.yml` を作成:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: mcp-web-manager
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - ./logs:/app/logs
      - ./certs:/app/certs:ro
    depends_on:
      - db
      - redis
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: postgres:15-alpine
    container_name: mcp-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: mcp_manager
      POSTGRES_USER: mcp_user
      POSTGRES_PASSWORD: secure_password_here
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mcp_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: mcp-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass redis_password_here
    volumes:
      - redis_data:/data
    networks:
      - mcp-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  nginx:
    image: nginx:alpine
    container_name: mcp-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/ssl/certs:ro
      - ./logs/nginx:/var/log/nginx
    depends_on:
      - app
    networks:
      - mcp-network

  prometheus:
    image: prom/prometheus:latest
    container_name: mcp-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    networks:
      - mcp-network

  grafana:
    image: grafana/grafana:latest
    container_name: mcp-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin_password_here
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - mcp-network

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  mcp-network:
    driver: bridge
```

### 5. Nginx 設定

`nginx.conf` を作成:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    # セキュリティヘッダー
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # HTTP から HTTPS へのリダイレクト
    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    # HTTPS サーバー設定
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL 証明書
        ssl_certificate /etc/ssl/certs/cert.pem;
        ssl_certificate_key /etc/ssl/certs/key.pem;

        # SSL 設定
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # ファイルアップロード制限
        client_max_body_size 10M;

        # プロキシ設定
        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # WebSocket サポート
        location /api/v1/ws {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # ログ設定
        access_log /var/log/nginx/access.log;
        error_log /var/log/nginx/error.log;
    }
}
```

### 6. デプロイの実行

```bash
# Docker イメージのビルド
docker-compose -f docker-compose.prod.yml build

# データベースのマイグレーション
docker-compose -f docker-compose.prod.yml run --rm app npm run db:migrate

# サービスの開始
docker-compose -f docker-compose.prod.yml up -d

# ログの確認
docker-compose -f docker-compose.prod.yml logs -f

# サービスの状態確認
docker-compose -f docker-compose.prod.yml ps

# ヘルスチェック
curl -k https://your-domain.com/api/v1/health
```

## 監視とログ

### Prometheus 設定

`monitoring/prometheus.yml` を作成:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'mcp-web-manager'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/api/v1/metrics'
    scrape_interval: 10s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['host.docker.internal:9100']

  - job_name: 'postgres'
    static_configs:
      - targets: ['db:5432']
```

### ログ監視

```bash
# アプリケーションログの監視
tail -f /opt/docker-mcp-web-manager/logs/app.log

# Nginx ログの監視
tail -f /opt/docker-mcp-web-manager/logs/nginx/access.log

# Docker ログの監視
docker-compose -f docker-compose.prod.yml logs -f app
```

## バックアップ

### 定期バックアップスクリプト

`scripts/backup.sh` を作成:

```bash
#!/bin/bash

BACKUP_DIR="/opt/docker-mcp-web-manager/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# データベースバックアップ
docker-compose -f docker-compose.prod.yml exec -T db pg_dump -U mcp_user mcp_manager | gzip > $BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz

# アプリケーションデータのバックアップ
tar -czf $BACKUP_DIR/data_backup_$TIMESTAMP.tar.gz /opt/docker-mcp-web-manager/data

# 古いバックアップの削除
find $BACKUP_DIR -name "*backup*" -type f -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $TIMESTAMP"
```

crontab への追加:

```bash
# バックアップスクリプトの実行権限設定
chmod +x scripts/backup.sh

# 毎日午前2時にバックアップを実行
echo "0 2 * * * /opt/docker-mcp-web-manager/scripts/backup.sh" | crontab -
```

## セキュリティ強化

### ファイアウォール設定

```bash
# UFW の設定
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 9090/tcp  # Prometheus (必要に応じて)
sudo ufw allow 3001/tcp  # Grafana (必要に応じて)
sudo ufw --force enable
```

### Docker セキュリティ

```bash
# Docker デーモンの設定
sudo mkdir -p /etc/docker
cat << EOF | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF

sudo systemctl restart docker
```

## アップデート手順

### アプリケーションのアップデート

```bash
cd /opt/docker-mcp-web-manager

# バックアップの実行
./scripts/backup.sh

# 最新版の取得
git fetch origin
git checkout main
git pull origin main

# 設定ファイルの比較
diff .env.production .env.example

# Docker イメージの再ビルド
docker-compose -f docker-compose.prod.yml build

# データベースマイグレーション
docker-compose -f docker-compose.prod.yml run --rm app npm run db:migrate

# ローリングアップデート
docker-compose -f docker-compose.prod.yml up -d --no-deps app

# ヘルスチェック
curl -k https://your-domain.com/api/v1/health

# ログの確認
docker-compose -f docker-compose.prod.yml logs -f app
```

## トラブルシューティング

### よくある問題

#### サービス起動エラー

```bash
# Docker サービスの状態確認
docker-compose -f docker-compose.prod.yml ps

# 詳細ログの確認
docker-compose -f docker-compose.prod.yml logs app

# コンテナの再起動
docker-compose -f docker-compose.prod.yml restart app
```

#### データベース接続エラー

```bash
# データベースの状態確認
docker-compose -f docker-compose.prod.yml exec db psql -U mcp_user -d mcp_manager -c "SELECT 1;"

# 接続設定の確認
docker-compose -f docker-compose.prod.yml exec app cat /app/.env.production | grep DATABASE_URL
```

#### SSL 証明書の問題

```bash
# 証明書の確認
openssl x509 -in /opt/docker-mcp-web-manager/certs/cert.pem -text -noout

# 証明書の有効期限確認
openssl x509 -in /opt/docker-mcp-web-manager/certs/cert.pem -noout -dates

# Let's Encrypt 証明書の更新
sudo certbot renew --dry-run
```

### パフォーマンス監視

```bash
# システムリソースの監視
docker stats

# ディスク使用量の確認
df -h
docker system df

# ログファイルのサイズ確認
du -sh /opt/docker-mcp-web-manager/logs/*
```

## スケーリング

### 水平スケーリング

```yaml
# docker-compose.prod.yml に追加
version: '3.8'

services:
  app:
    deploy:
      replicas: 3
    # 他の設定...

  nginx:
    # ロードバランサー設定を追加
    # 他の設定...
```

### リソース制限

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 512M
          cpus: '0.25'
    # 他の設定...
```

## ディザスターリカバリー

### 復旧手順

1. **バックアップからの復元**:
   ```bash
   # データベースの復元
   gunzip -c /backups/db_backup_YYYYMMDD_HHMMSS.sql.gz | docker-compose -f docker-compose.prod.yml exec -T db psql -U mcp_user mcp_manager
   
   # アプリケーションデータの復元
   tar -xzf /backups/data_backup_YYYYMMDD_HHMMSS.tar.gz -C /
   ```

2. **サービスの再起動**:
   ```bash
   docker-compose -f docker-compose.prod.yml down
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **整合性チェック**:
   ```bash
   curl -k https://your-domain.com/api/v1/health
   ```

このデプロイガイドに従って、安全で信頼性の高い本番環境を構築してください。