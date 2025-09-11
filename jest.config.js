/** @type {import('jest').Config} */
const nextJest = require('next/jest');

// Next.js設定を読み込んでJest設定を作成
const createJestConfig = nextJest({
  // Next.jsアプリケーションのディレクトリパス
  dir: './',
});

// カスタムJest設定
const customJestConfig = {
  // テスト環境を設定（プロジェクトごとに異なる環境）
  projects: [
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/components/**/*.(test|spec).(ts|tsx)'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@/components/(.*)$': '<rootDir>/src/components/$1',
        '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
        '^@/app/(.*)$': '<rootDir>/src/app/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/db/(.*)$': '<rootDir>/src/db/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js',
      },
    },
    {
      displayName: 'api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/app/api/**/*.(test|spec).(ts|tsx)'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@/components/(.*)$': '<rootDir>/src/components/$1',
        '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
        '^@/app/(.*)$': '<rootDir>/src/app/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/db/(.*)$': '<rootDir>/src/db/$1',
      },
    },
    {
      displayName: 'pages',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/app/**/*.(test|spec).(ts|tsx)'],
      testPathIgnorePatterns: ['<rootDir>/src/app/api/**/*'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@/components/(.*)$': '<rootDir>/src/components/$1',
        '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
        '^@/app/(.*)$': '<rootDir>/src/app/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/db/(.*)$': '<rootDir>/src/db/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/__mocks__/fileMock.js',
      },
    },
    {
      displayName: 'lib',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/lib/**/*.(test|spec).(ts|tsx)'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@/components/(.*)$': '<rootDir>/src/components/$1',
        '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
        '^@/app/(.*)$': '<rootDir>/src/app/$1',
        '^@/types/(.*)$': '<rootDir>/src/types/$1',
        '^@/db/(.*)$': '<rootDir>/src/db/$1',
      },
    },
  ],

  // 除外するディレクトリ
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/',
    '<rootDir>/e2e/',  // Playwrightテストを除外
  ],

  // 収集対象ファイル（カバレッジ）
  collectCoverageFrom: [
    'src/**/*.(js|jsx|ts|tsx)',
    '!src/**/*.d.ts',
    '!src/**/*.stories.*',
    '!src/app/**/layout.tsx',
    '!src/app/**/loading.tsx',
    '!src/app/**/not-found.tsx',
    '!src/app/**/error.tsx',
    '!src/app/globals.css',
  ],

  // カバレッジの閾値設定
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // カバレッジレポーターの設定
  coverageReporters: [
    'text',
    'html',
    'lcov',
    'json-summary',
  ],

  // トランスフォーム設定
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },

  // モジュールファイル拡張子
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // テスト実行タイムアウト
  testTimeout: 10000,

  // 各テスト実行前のセットアップ
  clearMocks: true,
  restoreMocks: true,

  // グローバル変数
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },

  // モックファイルのディレクトリ
  moduleDirectories: ['node_modules', '<rootDir>/'],

  // 追加の環境変数
  testEnvironmentOptions: {
    url: 'http://localhost:3000',
  },
};

// Next.js設定と組み合わせてエクスポート
module.exports = createJestConfig(customJestConfig);
