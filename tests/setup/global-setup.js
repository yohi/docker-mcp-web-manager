/**
 * Jest グローバルセットアップファイル
 * 
 * 機能要件：
 * - テストデータベース初期化
 * - テスト用Docker環境セットアップ
 * - 外部サービスのモック設定
 * - グローバルテスト環境構築
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs/promises')

module.exports = async () => {
  console.log('🚀 グローバルテストセットアップを開始...')

  // テスト用環境変数設定
  process.env.NODE_ENV = 'test'
  process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only'
  process.env.NEXTAUTH_URL = 'http://localhost:3000'
  process.env.DATABASE_URL = 'sqlite::memory:'
  process.env.DOCKER_API_VERSION = '1.41'
  process.env.DOCKER_HOST = 'unix:///var/run/docker.sock'

  try {
    // テストディレクトリの作成
    const testDirs = [
      'test-results',
      'coverage',
      'tests/fixtures',
      'tests/mocks',
      'tests/utils',
    ]

    for (const dir of testDirs) {
      try {
        await fs.mkdir(path.join(process.cwd(), dir), { recursive: true })
      } catch (error) {
        // ディレクトリが既に存在する場合は無視
        if (error.code !== 'EEXIST') {
          throw error
        }
      }
    }

    // テスト用フィクスチャファイルの作成
    await createTestFixtures()

    // Docker接続テスト（利用可能な場合のみ）
    await testDockerConnection()

    console.log('✅ グローバルテストセットアップが完了しました')
  } catch (error) {
    console.error('❌ グローバルテストセットアップでエラーが発生:', error)
    throw error
  }
}

/**
 * テスト用フィクスチャファイルを作成
 */
async function createTestFixtures() {
  const fixtures = {
    'tests/fixtures/servers.json': {
      validServer: {
        id: 'test-server-1',
        name: 'Test Server 1',
        image: 'nginx:latest',
        status: 'running',
        ports: [
          { containerPort: 80, hostPort: 8080, protocol: 'tcp' }
        ],
        environment: {
          NODE_ENV: 'production'
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      stoppedServer: {
        id: 'test-server-2',
        name: 'Test Server 2',
        image: 'alpine:latest',
        status: 'stopped',
        ports: [],
        environment: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    },
    'tests/fixtures/users.json': {
      adminUser: {
        id: 'admin-user-1',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        permissions: [
          'servers:view',
          'servers:create',
          'servers:update',
          'servers:delete',
          'servers:manage',
          'users:view',
          'users:manage'
        ],
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      regularUser: {
        id: 'regular-user-1',
        email: 'user@test.com',
        name: 'Test User',
        role: 'user',
        permissions: [
          'servers:view'
        ],
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    },
    'tests/fixtures/auth.json': {
      validCredentials: {
        email: 'admin@test.com',
        password: 'test-password-123'
      },
      invalidCredentials: {
        email: 'invalid@test.com',
        password: 'wrong-password'
      },
      validSession: {
        user: {
          id: 'admin-user-1',
          email: 'admin@test.com',
          name: 'Test Admin',
          role: 'admin',
          permissions: ['servers:view', 'servers:manage']
        },
        expires: '2030-01-01T00:00:00.000Z'
      }
    }
  }

  for (const [filePath, data] of Object.entries(fixtures)) {
    const fullPath = path.join(process.cwd(), filePath)
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf8')
  }

  console.log('📁 テスト用フィクスチャファイルを作成しました')
}

/**
 * Docker接続をテスト
 */
async function testDockerConnection() {
  try {
    // Docker CLIが利用可能かテスト
    await new Promise((resolve, reject) => {
      const docker = spawn('docker', ['version'], { stdio: 'ignore' })
      
      docker.on('close', (code) => {
        if (code === 0) {
          console.log('🐳 Dockerが利用可能です')
          resolve()
        } else {
          console.log('⚠️ Docker接続テストをスキップします（Docker利用不可）')
          resolve() // テストを続行するためresolve
        }
      })
      
      docker.on('error', () => {
        console.log('⚠️ Docker接続テストをスキップします（Docker未インストール）')
        resolve() // テストを続行するためresolve
      })
      
      // 5秒でタイムアウト
      setTimeout(() => {
        docker.kill()
        console.log('⚠️ Docker接続テストをスキップします（タイムアウト）')
        resolve()
      }, 5000)
    })
  } catch (error) {
    console.log('⚠️ Docker接続テストをスキップします:', error.message)
    // エラーでもテストを続行
  }
}