# コントリビューションガイド

Docker MCP Web Manager プロジェクトへのご参加をありがとうございます！このドキュメントでは、プロジェクトへの貢献方法について説明します。

## 📋 目次

- [行動規範](#行動規範)
- [貢献方法](#貢献方法)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [コーディング規約](#コーディング規約)
- [プルリクエストガイドライン](#プルリクエストガイドライン)
- [イシューの報告](#イシューの報告)
- [テスト](#テスト)
- [ドキュメント](#ドキュメント)

## 🤝 行動規範

このプロジェクトに参加するすべての人は、以下の行動規範を守ることが期待されます：

- **敬意を持つ**: 異なる意見や経験レベルを尊重する
- **建設的である**: 批判は建設的で具体的にする  
- **協力的である**: チームワークを重視し、互いに助け合う
- **包括的である**: あらゆる背景を持つ人々を歓迎する
- **プロフェッショナルである**: 専門的で礼儀正しいコミュニケーションを心がける

## 🚀 貢献方法

### 貢献の種類

以下のような方法でプロジェクトに貢献できます：

1. **バグレポート**: バグを発見した場合は Issue を作成
2. **機能提案**: 新機能のアイデアがある場合は Issue で提案
3. **コード修正**: バグ修正や機能実装のプルリクエスト
4. **ドキュメント改善**: README、ドキュメント、コメントの改善
5. **テスト追加**: テストカバレッジの向上
6. **レビュー**: 他の人のプルリクエストのレビュー

### 初回貢献者へのアドバイス

初めて貢献される方は以下から始めることをお勧めします：

- `good first issue` ラベルが付いた Issue から始める
- ドキュメントの誤字脱字修正
- 既存テストの改善
- コードコメントの追加・改善

## 🔧 開発環境のセットアップ

### 前提条件

- **Node.js** 18.0.0 以上
- **Docker** 20.10.0 以上
- **Git** 2.0 以上

### セットアップ手順

1. **リポジトリのフォーク**
   ```bash
   # GitHubでリポジトリをフォークしてからクローン
   git clone https://github.com/your-username/docker-mcp-web-manager.git
   cd docker-mcp-web-manager
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   ```bash
   cp .env.example .env.local
   # .env.local を必要に応じて編集
   ```

4. **データベースの初期化**
   ```bash
   npm run db:migrate
   ```

5. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

6. **テストの実行**
   ```bash
   npm run test
   npm run test:e2e
   ```

### ブランチ戦略

```bash
# upstream リポジトリを追加
git remote add upstream https://github.com/your-org/docker-mcp-web-manager.git

# 最新の main ブランチを取得
git checkout main
git pull upstream main

# 機能ブランチを作成
git checkout -b feature/your-feature-name

# 作業後、変更をコミット
git add .
git commit -m "feat: add new feature"

# フォークにプッシュ
git push origin feature/your-feature-name
```

## 📝 コーディング規約

### TypeScript

- **厳格な型安全性**を維持する
- `any` 型の使用は避け、適切な型定義を行う
- インターフェースは PascalCase で命名
- 関数とメソッドは camelCase で命名

```typescript
// 良い例
interface ServerConfiguration {
  name: string;
  port: number;
  environment: Record<string, string>;
}

const createServer = (config: ServerConfiguration): Promise<Server> => {
  // 実装
};

// 避けるべき例
const createServer = (config: any) => {
  // any型の使用は避ける
};
```

### React

- **関数コンポーネント**を使用する
- **カスタムフック**で状態ロジックを分離
- **TypeScript**で Props を型定義

```typescript
// 良い例
interface ServerCardProps {
  server: Server;
  onStart: (serverId: string) => void;
}

const ServerCard: React.FC<ServerCardProps> = ({ server, onStart }) => {
  return (
    <div className="p-4 border rounded">
      <h3>{server.name}</h3>
      <button onClick={() => onStart(server.id)}>Start</button>
    </div>
  );
};
```

### API設計

- **RESTful**な設計に従う
- **Zod**でリクエスト・レスポンスを検証
- **エラーハンドリング**を適切に実装

```typescript
// 良い例
const serverCreateSchema = z.object({
  name: z.string().min(1).max(100),
  image: z.string(),
  configuration: serverConfigSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = serverCreateSchema.parse(body);
    // 処理...
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation Error', details: error.errors },
        { status: 400 }
      );
    }
    throw error;
  }
}
```

### セキュリティ

- **入力検証**を必ず実行
- **SQL インジェクション**対策を実装
- **XSS 攻撃**対策を実装
- **認証・認可**を適切に実装

```typescript
// 良い例: Shell injection 対策
import { spawn } from 'child_process';

const runDockerCommand = (args: string[]): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 引数配列を使用し、shellを無効化
    const process = spawn('docker', args, { shell: false });
    // タイムアウト・エラーハンドリングを実装
  });
};

// 避けるべき例
const runDockerCommand = (command: string) => {
  exec(`docker ${command}`, callback); // Shell injection の脆弱性
};
```

### テスト

- **単体テスト**は Jest と React Testing Library
- **E2E テスト**は Playwright
- **テストカバレッジ**は 70% 以上を維持

```typescript
// 良い例
describe('ServerCard', () => {
  it('should call onStart when start button is clicked', async () => {
    const mockOnStart = jest.fn();
    const server = { id: '1', name: 'Test Server', status: 'stopped' };
    
    render(<ServerCard server={server} onStart={mockOnStart} />);
    
    const startButton = screen.getByText('Start');
    await user.click(startButton);
    
    expect(mockOnStart).toHaveBeenCalledWith('1');
  });
});
```

## 📤 プルリクエストガイドライン

### プルリクエストを作成する前に

- [ ] コードが正しく動作することを確認
- [ ] すべてのテストがパスすることを確認
- [ ] lint エラーがないことを確認
- [ ] 関連するドキュメントを更新

### プルリクエストのタイトル

以下の形式に従ってください：

```
<type>: <description>

例:
feat: add server status monitoring
fix: resolve authentication issue
docs: update API documentation
test: add integration tests for server creation
refactor: improve error handling logic
```

### プルリクエストの説明

以下のテンプレートを使用してください：

```markdown
## 概要
<!-- 変更の概要を簡潔に説明 -->

## 変更内容
<!-- 具体的な変更内容をリストアップ -->
- [ ] 機能A を追加
- [ ] バグB を修正
- [ ] テストC を追加

## テスト
<!-- どのようにテストしたかを説明 -->
- [ ] 単体テストを追加・更新
- [ ] 手動テストを実行
- [ ] E2E テストを実行

## スクリーンショット（UI変更の場合）
<!-- UI に変更がある場合はスクリーンショットを添付 -->

## チェックリスト
- [ ] コードレビューの準備ができている
- [ ] すべてのテストがパス
- [ ] lint エラーなし
- [ ] ドキュメント更新済み
- [ ] Breaking Change なし（ある場合は説明を追加）

## 関連Issue
<!-- 関連するIssueがある場合は参照 -->
Closes #123
```

### コミットメッセージ

Conventional Commits 形式に従ってください：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

例:
feat(auth): add Bitwarden integration
fix(server): resolve Docker connection timeout
docs: update installation guide
test(api): add server management tests
```

**Types:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント変更
- `style`: フォーマット変更（機能に影響しない）
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: ビルドプロセスやツール変更

## 🐛 イシューの報告

### バグレポート

バグを発見した場合は、以下の情報を含めてIssueを作成してください：

```markdown
## バグの概要
<!-- バグの簡潔な説明 -->

## 再現手順
1. '...' をクリック
2. '...' をスクロール
3. '...' を確認
4. エラーが発生

## 期待される動作
<!-- 本来期待される動作 -->

## 実際の動作
<!-- 実際に発生した動作 -->

## 環境
- OS: [例: Ubuntu 20.04]
- Node.js: [例: 18.17.0]
- ブラウザ: [例: Chrome 115]
- Docker: [例: 20.10.17]

## 追加情報
<!-- スクリーンショット、ログファイル等 -->
```

### 機能要求

新機能を提案する場合：

```markdown
## 機能の概要
<!-- 提案する機能の概要 -->

## 動機・背景
<!-- なぜこの機能が必要なのか -->

## 提案する解決策
<!-- どのように実装するか -->

## 代替案
<!-- 他に考えられる解決策 -->

## 追加情報
<!-- モックアップ、参考資料等 -->
```

## 🧪 テスト

### テスト実行

```bash
# すべてのテスト
npm run test:all

# 単体テスト
npm run test:unit

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e

# カバレッジ
npm run test:coverage
```

### テスト作成ガイドライン

- **単体テスト**: 個別の関数・コンポーネントをテスト
- **統合テスト**: API エンドポイントをテスト
- **E2Eテスト**: ユーザーシナリオをテスト

```typescript
// 単体テスト例
describe('formatServerStatus', () => {
  it('should return "実行中" for running status', () => {
    expect(formatServerStatus('running')).toBe('実行中');
  });
});

// 統合テスト例
describe('POST /api/v1/servers', () => {
  it('should create a new server', async () => {
    const response = await request(app)
      .post('/api/v1/servers')
      .send({ name: 'Test Server', image: 'nginx:latest' })
      .expect(201);
    
    expect(response.body.data.server.name).toBe('Test Server');
  });
});

// E2Eテスト例
test('user can create and start server', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('[data-testid="create-server-button"]');
  await page.fill('[data-testid="server-name"]', 'Test Server');
  await page.click('[data-testid="create-button"]');
  await expect(page.locator('[data-testid="server-card"]')).toBeVisible();
});
```

## 📖 ドキュメント

### ドキュメント更新

以下の場合はドキュメントの更新が必要です：

- 新しい API エンドポイントの追加
- 環境変数の変更
- 設定方法の変更
- 新機能の追加

### ドキュメント構成

- `README.md`: プロジェクト概要と基本的な使用方法
- `docs/api.md`: API 仕様書
- `docs/deployment.md`: デプロイガイド
- `CONTRIBUTING.md`: 貢献ガイド（このファイル）

### APIドキュメント

新しいエンドポイントを追加する場合：

```markdown
#### `POST /api/v1/servers/{id}/action`

サーバーに対して特定のアクションを実行

**リクエスト**:
\`\`\`json
{
  "action": "start|stop|restart",
  "parameters": {}
}
\`\`\`

**レスポンス**:
\`\`\`json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-123",
      "status": "starting"
    }
  }
}
\`\`\`
```

## 🎯 優先事項

現在、以下の分野での貢献を特に歓迎しています：

1. **セキュリティ強化**: 認証・認可システムの改善
2. **パフォーマンス最適化**: フロントエンド・バックエンドの最適化
3. **テストカバレッジ向上**: 単体・統合・E2Eテストの追加
4. **ドキュメント改善**: API仕様書、チュートリアルの充実
5. **Docker統合**: Docker MCP CLI との連携改善

## 🆘 ヘルプが必要な場合

質問やサポートが必要な場合は：

1. **既存の Issue** を検索して同じ質問がないか確認
2. **Discussion** で質問を投稿
3. **Discord チャンネル** で開発者とチャット（リンクがある場合）

## 📜 ライセンス

このプロジェクトに貢献することで、あなたの貢献が MIT ライセンスの下で公開されることに同意したことになります。

---

**ご協力ありがとうございます！** 🚀

あなたの貢献により、Docker MCP Web Manager がより良いプロダクトになります。質問があれば遠慮なくお聞かせください。