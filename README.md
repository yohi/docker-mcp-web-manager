# Docker MCP Web Manager v2

🐳 **Model Context Protocol (MCP) サーバーのための包括的なDocker管理プラットフォーム**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://www.docker.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5.2-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.7.0+-green.svg)](https://nodejs.org/)

## 📖 目次

1. [概要](#概要)
2. [主要機能](#主要機能)
3. [技術スタック](#技術スタック)
4. [クイックスタート](#クイックスタート)
5. [詳細セットアップ](#詳細セットアップ)
6. [使用方法](#使用方法)
7. [API ドキュメント](#apiドキュメント)
8. [開発・テスト](#開発テスト)
9. [デプロイメント](#デプロイメント)
10. [トラブルシューティング](#トラブルシューティング)
11. [貢献・サポート](#貢献サポート)

---

## 🎯 概要

Docker MCP Web Manager v2は、Model Context Protocol (MCP) サーバーをDockerコンテナとして統合管理するためのモダンなWebアプリケーションです。エンタープライズグレードのセキュリティと運用機能を備え、開発者から運用チームまで幅広く対応します。

### 🌟 特徴

- **🔒 エンタープライズセキュリティ**: AES-256-GCM暗号化、RBAC、監査ログ
- **⚡ 高性能**: リアルタイム監視、効率的なリソース管理
- **🛠️ 開発者フレンドリー**: 豊富なAPI、TypeScript完全対応
- **📊 運用重視**: 包括的な監視、ログ管理、アラート機能
- **🔧 拡張性**: プラグイン対応、カスタマイズ可能

---

## 🚀 主要機能

### 🐳 **MCPサーバー管理**
- **ライフサイクル管理**: 作成、起動、停止、削除の完全制御
- **設定管理**: 環境変数、ボリューム、ネットワーク設定
- **イメージ管理**: Dockerイメージの検索、プル、バージョン管理
- **ヘルスチェック**: 自動監視とフェイルオーバー

### 🔐 **セキュリティ・認証**
- **強力な暗号化**: AES-256-GCM によるシークレット保護
- **認証システム**: NextAuth.js ベースの多要素認証
- **アクセス制御**: 役割ベースアクセス制御 (RBAC)
- **監査ログ**: 全操作の完全な追跡記録

### 📊 **監視・ログ管理**
- **リアルタイム監視**: CPU、メモリ、ネットワーク、ディスク使用率
- **集約ログ**: 構造化ログ、フィルタリング、検索機能
- **アラート**: 閾値ベースのアラートとWebhook通知
- **メトリクス**: Prometheus互換メトリクス出力

### 🛠️ **開発・運用支援**
- **API ファースト**: RESTful API + WebSocket でフル機能アクセス
- **自動化支援**: バッチ操作、スケジューリング、CI/CD統合
- **バックアップ・復元**: 設定とデータの自動バックアップ
- **テスト環境**: 開発・ステージング環境の簡単構築

---

## 🛠️ 技術スタック

### フロントエンド
| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Next.js** | 15.5.2 | React フレームワーク・SSR |
| **React** | 18 | UI ライブラリ |
| **TypeScript** | 5.9 | 静的型付け |
| **Tailwind CSS** | 3.4 | ユーティリティファーストCSS |
| **Radix UI** | - | アクセシブルなUIコンポーネント |
| **React Hook Form** | 7.51 | フォーム管理 |
| **TanStack Query** | 5.24 | サーバー状態管理 |
| **Zod** | 3.22 | スキーマバリデーション |

### バックエンド
| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Next.js API Routes** | 15.5.2 | API サーバー |
| **NextAuth.js** | 4.24.11 | 認証・セッション管理 |
| **Drizzle ORM** | 0.44.5 | データベースORM |
| **SQLite** | 3.45+ | データベース |
| **Redis** | 7.0+ | セッションストア・キャッシュ |
| **Node.js Crypto** | - | 暗号化・復号化 |

### インフラ・開発
| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Docker** | 20.10+ | コンテナランタイム |
| **Docker Compose** | v2.0+ | オーケストレーション |
| **Jest** | 29.7+ | ユニット・統合テスト |
| **Playwright** | 1.40+ | E2Eテスト |
| **ESLint** | 8.57+ | 静的解析 |
| **Prettier** | 3.2+ | コードフォーマット |

---

## ⚡ クイックスタート

### 📋 前提条件

| 項目 | 要件 | 確認コマンド |
|------|------|-------------|
| **Docker** | 20.10.0+ | `docker --version` |
| **Docker Compose** | v2.0+ | `docker compose version` |
| **Git** | 2.30+ | `git --version` |
| **メモリ** | 2GB以上 | `free -h` |
| **ディスク** | 10GB以上 | `df -h` |

### 🚀 30秒セットアップ

```bash
# 1. リポジトリクローン
git clone https://github.com/your-org/docker-mcp-web-manager-v2.git
cd docker-mcp-web-manager-v2

# 2. 環境設定
cp .env.example .env.local

# 3. アプリケーション起動
docker compose up -d

# 4. ヘルスチェック
curl http://localhost:3000/api/health
```

**🎉 完了！** ブラウザで http://localhost:3000 にアクセスしてください。

### 🔧 初期設定

```bash
# データベース初期化
docker compose exec web npm run db:push

# テストデータ作成（オプション）
docker compose exec web npm run db:seed

# 管理者ユーザー作成
docker compose exec web npm run user:create-admin
```

---

## 📚 詳細セットアップ

### 環境変数設定

`.env.local` ファイルで以下の設定を行います：

```bash
# === アプリケーション基本設定 ===
NODE_ENV=production
WEB_PORT=3000
LOG_LEVEL=info

# === NextAuth.js 認証設定 ===
NEXTAUTH_SECRET=your-secret-here  # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# === データベース設定 ===
DATABASE_URL=file:./data/app.db

# === Redis設定 ===
REDIS_URL=redis://redis:6379

# === 暗号化設定 ===
ENCRYPTION_MASTER_KEY=your-encryption-key  # base64エンコード

# === Docker設定 ===
DOCKER_SOCKET_PATH=/var/run/docker.sock

# === 監視・ログ設定 ===
MONITORING_ENABLED=true
LOG_RETENTION_DAYS=30

# === Bitwarden統合（オプション） ===
BITWARDEN_SERVER_URL=https://vault.bitwarden.com
BITWARDEN_CLIENT_ID=your-client-id
BITWARDEN_CLIENT_SECRET=your-client-secret
```

### カスタム設定（docker-compose.override.yml）

```yaml
# プロダクション環境用カスタマイズ例
services:
  web:
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=warn
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2'
        reservations:
          memory: 1G
          cpus: '1'
    
  redis:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### ストレージ設定

```bash
# データディレクトリ作成
mkdir -p data/logs data/backups data/uploads

# 権限設定
chmod 755 data
chmod 644 data/*

# バックアップディレクトリ設定
sudo crontab -e
# 追加: 0 2 * * * /path/to/backup-script.sh
```

---

## 💻 使用方法

### 🌐 Web インターフェース

#### ダッシュボード
- **URL**: http://localhost:3000
- **機能**: リアルタイム監視、システム概要、アラート表示

#### サーバー管理
- **URL**: http://localhost:3000/servers
- **機能**: MCPサーバーの作成、設定、ライフサイクル管理

#### 監視画面
- **URL**: http://localhost:3000/monitoring
- **機能**: 詳細メトリクス、ログ確認、パフォーマンス分析

#### 設定画面
- **URL**: http://localhost:3000/settings
- **機能**: システム設定、ユーザー管理、セキュリティ設定

### 🔧 コマンドライン操作

```bash
# サーバー管理
docker compose exec web npm run server:create -- --name myserver --image node:latest
docker compose exec web npm run server:list
docker compose exec web npm run server:start -- myserver
docker compose exec web npm run server:stop -- myserver

# データベース操作
docker compose exec web npm run db:migrate
docker compose exec web npm run db:backup
docker compose exec web npm run db:restore -- backup-file.sql

# ログ管理
docker compose exec web npm run logs:export -- --since 1h
docker compose exec web npm run logs:cleanup
```

### 📡 API 使用例

```bash
# ヘルスチェック
curl http://localhost:3000/api/health

# サーバー一覧取得
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/v1/servers

# 新しいサーバー作成
curl -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"name":"my-server","image":"node:latest","port":3000}' \
     http://localhost:3000/api/v1/servers

# リアルタイム監視（WebSocket）
wscat -c "ws://localhost:3000/api/ws" -x '{"type":"subscribe","channel":"monitoring"}'
```

---

## 📖 API ドキュメント

### 📚 完全なAPI仕様

- **[API仕様書概要](./docs/api/README.md)**: 基本情報・認証・エラーコード
- **[OpenAPI仕様](./docs/api/openapi.yaml)**: Swagger UI対応の詳細仕様
- **[使用例集](./docs/api/examples.md)**: 実用的なcURL・SDK例
- **[エンドポイント詳細](./docs/api/endpoints/)**: 各APIの詳細仕様

### 🔗 主要エンドポイント

| カテゴリ | エンドポイント | 説明 |
|----------|---------------|------|
| **ヘルス** | `GET /api/health` | システム状態確認 |
| **サーバー** | `GET /api/v1/servers` | サーバー一覧取得 |
| **サーバー** | `POST /api/v1/servers` | サーバー作成 |
| **監視** | `GET /api/v1/monitoring` | 監視データ取得 |
| **ログ** | `GET /api/v1/servers/{id}/logs` | ログ取得 |
| **設定** | `GET /api/v1/config` | システム設定取得 |

### 🔌 WebSocket API

```javascript
// リアルタイム監視
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'server_status',
    serverId: '*'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('リアルタイム更新:', data);
};
```

---

## 🧪 開発・テスト

### 開発環境セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# 型チェック
npm run typecheck

# リンター実行
npm run lint

# フォーマット
npm run format
```

### テスト実行

```bash
# 全テスト実行
npm test

# ユニットテスト
npm run test:unit

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e

# テストカバレッジ
npm run test:coverage
```

### 🔍 デバッグ

```bash
# デバッグモード起動
DEBUG=* npm run dev

# データベース確認
npm run db:studio

# ログ確認
docker compose logs -f web

# パフォーマンス分析
npm run analyze
```

### 🏗️ ビルドとデプロイメント

```bash
# プロダクションビルド
npm run build

# Dockerイメージビルド
docker compose build

# プロダクション起動
docker compose -f docker-compose.prod.yml up -d

# ヘルスチェック
curl -f http://localhost:3000/api/health
```

---

## 🚀 デプロイメント

### Docker Compose（推奨）

```bash
# プロダクション環境
docker compose -f docker-compose.prod.yml up -d

# スケーリング
docker compose up -d --scale web=3

# アップデート
docker compose pull
docker compose up -d
```

### Kubernetes

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: docker-mcp-web-manager
spec:
  replicas: 3
  selector:
    matchLabels:
      app: docker-mcp-web-manager
  template:
    metadata:
      labels:
        app: docker-mcp-web-manager
    spec:
      containers:
      - name: web
        image: docker-mcp-web-manager:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

### 🏢 本番環境設定

#### リバースプロキシ（Nginx）

```nginx
# /etc/nginx/sites-available/docker-mcp
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### システム設定

```bash
# セキュリティ設定
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 自動起動設定
sudo systemctl enable docker
sudo systemctl enable docker-compose

# ログローテーション
sudo logrotate -d /etc/logrotate.d/docker-mcp

# 監視設定
sudo systemctl enable prometheus
sudo systemctl enable grafana-server
```

---

## 🔧 トラブルシューティング

### よくある問題と解決方法

| 問題 | 原因 | 解決方法 |
|------|------|----------|
| コンテナが起動しない | ポート競合・権限問題 | [詳細手順](./docs/troubleshooting.md#docker関連の問題) |
| ログインできない | NextAuth設定・Redis接続 | [認証問題の解決](./docs/troubleshooting.md#認証セッション問題) |
| パフォーマンスが悪い | リソース不足・設定問題 | [パフォーマンス最適化](./docs/troubleshooting.md#パフォーマンス問題) |
| データベースエラー | SQLite権限・ロック問題 | [DB問題の解決](./docs/troubleshooting.md#データベース関連の問題) |

### 🆘 緊急時対応

```bash
# クイック診断
curl -f http://localhost:3000/api/health || echo "System down"

# 自動復旧
docker compose down && docker compose up -d

# ログ確認
docker compose logs --tail=100 web

# リソース確認
docker stats --no-stream
```

### 📞 サポート

- **[トラブルシューティングガイド](./docs/troubleshooting.md)**: 包括的な問題解決ガイド
- **[GitHub Issues](https://github.com/your-org/docker-mcp-web-manager/issues)**: バグ報告・機能要求
- **[Discord コミュニティ](https://discord.gg/docker-mcp)**: リアルタイムサポート
- **[ドキュメント](./docs/)**: 詳細な技術文書

---

## 📁 プロジェクト構造

```
docker-mcp-web-manager-v2/
├── 📁 src/                      # アプリケーションソースコード
│   ├── 📁 app/                  # Next.js App Router
│   │   ├── 📁 api/              # API Routes
│   │   ├── 📁 components/       # Reactコンポーネント
│   │   └── 📁 lib/              # ユーティリティ・設定
│   ├── 📁 types/                # TypeScript型定義
│   └── 📁 db/                   # データベーススキーマ
├── 📁 docs/                     # ドキュメント
│   ├── 📁 api/                  # API仕様書
│   ├── 📁 setup/                # セットアップガイド
│   └── 📁 development/          # 開発者ガイド
├── 📁 tests/                    # テストコード
│   ├── 📁 unit/                 # ユニットテスト
│   ├── 📁 integration/          # 統合テスト
│   └── 📁 e2e/                  # E2Eテスト
├── 📁 data/                     # 永続化データ
│   ├── 📁 logs/                 # ログファイル
│   └── 📁 uploads/              # アップロードファイル
├── 🐳 docker-compose.yml       # Docker Compose設定
├── 🐳 Dockerfile               # Dockerイメージ設定
├── ⚙️ package.json             # Node.js依存関係
├── 🔧 tsconfig.json            # TypeScript設定
└── 📝 README.md                # このファイル
```

---

## 🎯 ロードマップ

### 🚀 v2.1.0 （2024年Q2）
- [ ] **Kubernetes対応強化**: Helm Chart、Operator
- [ ] **マルチテナント**: 組織・チーム管理機能
- [ ] **高度な監視**: Prometheus/Grafana統合
- [ ] **CI/CD統合**: GitLab/GitHub Actions テンプレート

### 🔥 v2.2.0 （2024年Q3）
- [ ] **プラグインシステム**: カスタム機能拡張
- [ ] **分散ストレージ**: MinIO/S3対応
- [ ] **マイクロサービス**: サービス分離・スケーリング
- [ ] **Enterprise SSO**: SAML/OIDC対応

### 🌟 v3.0.0 （2024年Q4）
- [ ] **AI統合**: 自動運用・異常検知
- [ ] **エッジ対応**: 分散エッジ環境管理
- [ ] **クラウドネイティブ**: Serverless/FaaS対応
- [ ] **GraphQL API**: 次世代API提供

---

## 🤝 貢献・サポート

### 💻 開発に参加

```bash
# 1. フォーク & クローン
git clone https://github.com/your-username/docker-mcp-web-manager-v2.git

# 2. 開発ブランチ作成
git checkout -b feature/your-feature-name

# 3. 開発・テスト
npm run dev
npm test

# 4. プルリクエスト作成
git push origin feature/your-feature-name
```

### 📋 貢献ガイドライン

- **コードスタイル**: ESLint + Prettier設定に従う
- **テスト**: 新機能には必ずテストを追加
- **ドキュメント**: 公開APIには必ずドキュメント更新
- **コミット**: [Conventional Commits](https://conventionalcommits.org/) 形式

### 🐛 バグ報告

バグを発見した場合は、以下の情報と共に [GitHub Issues](https://github.com/your-org/docker-mcp-web-manager/issues) に報告してください：

1. **環境情報**: OS、Docker バージョン、Node.js バージョン
2. **再現手順**: 問題を再現する具体的な手順
3. **期待される動作**: 本来の期待される動作
4. **実際の動作**: 実際に起こった動作
5. **ログ**: エラーログやスクリーンショット

### 💡 機能要求

新機能の提案は [GitHub Discussions](https://github.com/your-org/docker-mcp-web-manager/discussions) で議論してください。

### 🌍 コミュニティ

- **[Discord サーバー](https://discord.gg/docker-mcp)**: リアルタイム議論・サポート
- **[GitHub Discussions](https://github.com/your-org/docker-mcp-web-manager/discussions)**: 機能提案・一般議論
- **[Twitter](https://twitter.com/docker_mcp)**: 最新情報・アップデート

---

## 📄 ライセンス

このプロジェクトは [MIT License](./LICENSE) の下で公開されています。

```
MIT License

Copyright (c) 2024 Docker MCP Web Manager Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 謝辞

このプロジェクトは以下のオープンソースプロジェクトに支えられています：

- **[Next.js](https://nextjs.org/)**: モダンなReactフレームワーク
- **[Docker](https://www.docker.com/)**: コンテナ技術のパイオニア
- **[Drizzle ORM](https://orm.drizzle.team/)**: 軽量で型安全なORM
- **[Tailwind CSS](https://tailwindcss.com/)**: ユーティリティファーストCSS
- **[Radix UI](https://www.radix-ui.com/)**: アクセシブルなUIプリミティブ

そして、このプロジェクトに貢献してくださった全ての [Contributors](https://github.com/your-org/docker-mcp-web-manager/graphs/contributors) に感謝します。

---

## 📞 サポート・連絡先

| 項目 | 連絡先 |
|------|--------|
| **🐛 バグ報告** | [GitHub Issues](https://github.com/your-org/docker-mcp-web-manager/issues) |
| **💬 コミュニティ** | [Discord](https://discord.gg/docker-mcp) |
| **📧 ビジネス** | business@docker-mcp.example.com |
| **🔒 セキュリティ** | security@docker-mcp.example.com |
| **📚 ドキュメント** | [https://docs.docker-mcp.example.com](https://docs.docker-mcp.example.com) |

---

<div align="center">

**⭐ このプロジェクトが役に立ったら、GitHubでスターをお願いします！**

Made with ❤️ by the Docker MCP Web Manager team

</div>