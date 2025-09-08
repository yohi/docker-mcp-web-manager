# テストガイド

Docker MCP Web Manager v2 のテスト戦略とガイドライン

## テスト構造

### テストの種類

1. **ユニットテスト** (`src/**/__tests__/*.test.ts(x)`)
   - 個別コンポーネント・関数のテスト
   - Jest + React Testing Library
   - 高速実行、単体機能の検証

2. **統合テスト** (`src/app/api/**/__tests__/*.test.ts`)
   - APIエンドポイントのテスト
   - データベース統合のテスト
   - モック使用によるサービス間連携テスト

3. **E2Eテスト** (`tests/e2e/*.e2e.ts`)
   - ブラウザベースの実際のユーザー操作テスト
   - Playwright使用
   - 全機能フローのテスト

## テスト実行

### 基本コマンド

```bash
# すべてのユニット・統合テスト
npm run test

# ウォッチモード（開発時）
npm run test:watch

# カバレッジ付きテスト
npm run test:coverage

# E2Eテスト
npm run test:e2e

# E2EテストUI モード
npm run test:e2e:ui

# 総合テストカバレッジ確保
./scripts/test-coverage.sh
```

### カスタマイズオプション

```bash
# 特定ファイルのテスト
npm run test -- button.test.tsx

# 特定パターンのテスト
npm run test -- --testNamePattern="login"

# カバレッジ閾値指定
./scripts/test-coverage.sh --threshold=90

# レポート生成
./scripts/test-coverage.sh --report

# CI モード
./scripts/test-coverage.sh --ci
```

## テスト設定

### Jest設定 (`jest.config.js`)

```javascript
{
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}
```

### Playwright設定 (`playwright.config.ts`)

```typescript
{
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  }
}
```

## テストパターン

### コンポーネントテスト例

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../button';

describe('Button Component', () => {
  it('renders correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### APIテスト例

```typescript
import { GET, POST } from '../route';
import { mockUserSession } from '../../__tests__/setup';

describe('/api/v1/servers', () => {
  it('returns servers for authenticated user', async () => {
    mockUserSession();
    
    const request = new NextRequest('http://localhost/api/v1/servers');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
```

### E2Eテスト例

```typescript
import { test, expect } from '@playwright/test';

test('login flow works', async ({ page }) => {
  await page.goto('/auth/signin');
  
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
});
```

## モックとスタブ

### 共通モック (`jest.setup.js`)

```javascript
// Next.js router のモック
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/',
  }),
}));

// NextAuth のモック
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
}));
```

### APIモック例

```typescript
// テストヘルパー関数
export const mockAdminSession = () => {
  (getServerSession as jest.Mock).mockResolvedValue({
    user: {
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'ADMIN',
    },
  });
};
```

## カバレッジ要件

### 最小カバレッジ閾値

- **行カバレッジ**: 80%
- **関数カバレッジ**: 80%
- **ブランチカバレッジ**: 80%
- **ステートメントカバレッジ**: 80%

### カバレッジ除外ファイル

- `*.d.ts` - TypeScript型定義ファイル
- `*.stories.ts(x)` - Storybookストーリー
- `src/app/globals.css` - CSSファイル
- `src/app/layout.tsx` - Next.jsレイアウト

## 認証テスト

### 認証状態管理 (`tests/e2e/.auth/`)

```bash
tests/e2e/.auth/
├── admin.json    # 管理者認証状態
├── user.json     # 一般ユーザー認証状態
└── viewer.json   # 閲覧者認証状態
```

### 権限テストパターン

```typescript
test.describe('Admin Features', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' });
  
  test('admin can access settings', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('設定');
  });
});
```

## データベーステスト

### テストデータベース設定

```bash
# テスト用SQLiteデータベース
export DATABASE_URL=file:./test.db

# テスト実行後のクリーンアップ
rm -f test.db*
```

### データベースモック

```typescript
// Drizzle ORM のモック
jest.mock('@/db/connection', () => ({
  db: {
    query: {
      servers: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    },
  },
}));
```

## CI/CD統合

### GitHub Actions設定例

```yaml
name: Test Coverage
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: ./scripts/test-coverage.sh --ci
      
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## デバッグとトラブルシューティング

### 一般的な問題

1. **テストが不安定**
   ```bash
   # ランダムな失敗を避けるため
   jest --runInBand
   ```

2. **E2Eテストのタイムアウト**
   ```typescript
   // より長いタイムアウトを設定
   test.setTimeout(60000);
   ```

3. **モックが機能しない**
   ```typescript
   // モックのリセット
   afterEach(() => {
     jest.clearAllMocks();
   });
   ```

### デバッグツール

```bash
# Jest デバッグモード
npm run test -- --verbose --no-cache

# Playwright デバッグモード
npm run test:e2e -- --debug

# カバレッジの詳細レポート
npm run test:coverage -- --verbose
```

## ベストプラクティス

### テストファイル命名規則

```
src/components/ui/button.tsx
src/components/ui/__tests__/button.test.tsx

src/app/api/v1/servers/route.ts
src/app/api/v1/servers/__tests__/route.test.ts

tests/e2e/dashboard.e2e.ts
```

### テスト記述のコツ

1. **AAA パターン**
   - **Arrange**: テストデータの準備
   - **Act**: 実行
   - **Assert**: 検証

2. **わかりやすいテスト名**
   ```typescript
   it('should display error message when login fails', () => {
     // テスト内容
   });
   ```

3. **適切なモック使用**
   - 外部依存関係のみモック
   - テスト対象の実装はそのまま使用

4. **テストの独立性**
   - テスト間でデータを共有しない
   - beforeEach/afterEach でクリーンアップ

### パフォーマンス最適化

```typescript
// 重いコンポーネントの遅延ローダー
const HeavyComponent = lazy(() => import('./HeavyComponent'));

// テストでは同期的にローディング
jest.mock('./HeavyComponent', () => ({
  default: () => <div>Mocked Heavy Component</div>,
}));
```

## 継続的改善

### テストメトリクス監視

- カバレッジ推移の追跡
- テスト実行時間の最適化
- 不安定なテストの特定と修正

### 定期的なメンテナンス

- モックの更新
- テストデータの整理
- 非推奨APIの置き換え
- 新機能のテストケース追加

このテストガイドに従うことで、高品質で保守性の高いテストコードを作成し、アプリケーションの安定性を確保できます。