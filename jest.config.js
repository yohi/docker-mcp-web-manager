const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // テスト環境を設定（API routes はnode、コンポーネントはjsdom）
  testEnvironment: 'jest-environment-jsdom',

  // プロジェクトごとに異なるテスト環境を使用
  projects: [
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/components/**/*.(test|spec).(ts|tsx)'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
          presets: [
            ['@babel/preset-env', { targets: { node: 'current' } }],
            ['@babel/preset-react', { runtime: 'automatic' }],
            '@babel/preset-typescript'
          ]
        }]
      },
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
      setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
          presets: [
            ['@babel/preset-env', { targets: { node: 'current' } }],
            ['@babel/preset-react', { runtime: 'automatic' }],
            '@babel/preset-typescript'
          ]
        }]
      },
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
      displayName: 'lib',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/lib/**/*.(test|spec).(ts|tsx)'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
      transform: {
        '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
          presets: [
            ['@babel/preset-env', { targets: { node: 'current' } }],
            ['@babel/preset-react', { runtime: 'automatic' }],
            '@babel/preset-typescript'
          ]
        }]
      },
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

  // Coverage settings
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/index.{ts,tsx}',
    '!src/app/layout.tsx',
    '!src/app/globals.css',
  ],

  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',

  // Test timeout
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(config);
