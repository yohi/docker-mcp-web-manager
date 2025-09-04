import { getDatabase } from './connection';
import { servers, configurations, tools, resources, prompts } from './schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * テスト用のサンプルデータを作成
 */
export async function seedDatabase(): Promise<void> {
  try {
    const db = getDatabase();

    console.log('テストデータの作成を開始...');

    // サンプルサーバーデータ
    const sampleServers = [
      {
        id: uuidv4(),
        name: 'github-mcp-server',
        image: 'github/mcp-server:latest',
        status: 'running' as const,
        version: '1.0.0',
        description: 'GitHub integration MCP server for repository management',
      },
      {
        id: uuidv4(),
        name: 'filesystem-mcp-server',
        image: 'filesystem/mcp-server:latest',
        status: 'stopped' as const,
        version: '1.2.0',
        description: 'File system operations MCP server',
      },
      {
        id: uuidv4(),
        name: 'aws-mcp-server',
        image: 'aws/mcp-server:latest',
        status: 'error' as const,
        version: '2.0.1',
        description: 'AWS services integration MCP server',
      },
    ];

    // サーバーを挿入
    const insertedServers = await db
      .insert(servers)
      .values(sampleServers)
      .returning();

    console.log(`${insertedServers.length}個のサーバーを作成しました`);

    // サーバー設定データ
    const sampleConfigurations = insertedServers.map((server, index) => ({
      id: uuidv4(),
      serverId: server.id,
      environment: JSON.stringify({
        NODE_ENV: 'production',
        API_TIMEOUT: '30000',
        LOG_LEVEL: index === 0 ? 'debug' : 'info',
      }),
      enabledTools: JSON.stringify([
        'create_repository',
        'list_files',
        'read_file',
        'write_file',
      ]),
      resourceLimits: JSON.stringify({
        memory: index === 0 ? '1g' : '512m',
        cpu: '0.5',
        disk: '2g',
      }),
      networkConfig: JSON.stringify({
        mode: 'bridge',
        ports: [
          {
            containerPort: 8080,
            hostPort: 8080 + index,
            protocol: 'tcp',
          },
        ],
      }),
    }));

    // 設定を挿入
    await db.insert(configurations).values(sampleConfigurations);

    console.log(`${sampleConfigurations.length}個の設定を作成しました`);

    // サンプルツールデータ
    const sampleTools = insertedServers.flatMap((server, serverIndex) => [
      {
        id: uuidv4(),
        serverId: server.id,
        name: 'create_repository',
        description: 'Create a new repository',
        inputSchema: JSON.stringify({
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Repository name',
            },
            description: {
              type: 'string',
              description: 'Repository description',
            },
            private: {
              type: 'boolean',
              description: 'Make repository private',
              default: false,
            },
          },
          required: ['name'],
        }),
        enabled: serverIndex !== 2, // エラー状態のサーバーはツール無効化
      },
      {
        id: uuidv4(),
        serverId: server.id,
        name: 'list_files',
        description: 'List files in a directory',
        inputSchema: JSON.stringify({
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path',
              default: '.',
            },
            recursive: {
              type: 'boolean',
              description: 'Include subdirectories',
              default: false,
            },
          },
        }),
        enabled: serverIndex !== 2,
      },
    ]);

    // ツールを挿入
    await db.insert(tools).values(sampleTools);

    console.log(`${sampleTools.length}個のツールを作成しました`);

    // サンプルリソースデータ
    const sampleResources = insertedServers.flatMap((server, serverIndex) => [
      {
        id: uuidv4(),
        serverId: server.id,
        uri: `file://${server.name}/config.json`,
        name: 'Configuration File',
        description: 'Server configuration file',
        mimeType: 'application/json',
        metadata: JSON.stringify({
          size: 1024,
          lastModified: new Date().toISOString(),
        }),
      },
      {
        id: uuidv4(),
        serverId: server.id,
        uri: `http://${server.name}/docs`,
        name: 'API Documentation',
        description: 'Server API documentation',
        mimeType: 'text/html',
        metadata: JSON.stringify({
          version: server.version,
          language: 'en',
        }),
      },
    ]);

    // リソースを挿入
    await db.insert(resources).values(sampleResources);

    console.log(`${sampleResources.length}個のリソースを作成しました`);

    // サンプルプロンプトデータ
    const samplePrompts = insertedServers.map((server, _serverIndex) => ({
      id: uuidv4(),
      serverId: server.id,
      name: 'generate_code',
      description: 'Generate code based on requirements',
      arguments: JSON.stringify({
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['javascript', 'python', 'typescript', 'go'],
            description: 'Programming language',
          },
          requirements: {
            type: 'string',
            description: 'Code requirements description',
          },
          style: {
            type: 'string',
            description: 'Coding style preference',
            default: 'standard',
          },
        },
        required: ['language', 'requirements'],
      }),
      metadata: JSON.stringify({
        category: 'development',
        complexity: 'medium',
      }),
    }));

    // プロンプトを挿入
    await db.insert(prompts).values(samplePrompts);

    console.log(`${samplePrompts.length}個のプロンプトを作成しました`);

    console.log('テストデータの作成が完了しました');
  } catch (error) {
    console.error('テストデータの作成中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * データベースをクリア（テスト用）
 */
export async function clearDatabase(): Promise<void> {
  try {
    const db = getDatabase();

    console.log('データベースのクリアを開始...');

    // 外部キー制約により、子テーブルから削除する必要はない
    // サーバーを削除すると CASCADE で関連データも削除される
    await db.delete(servers);

    console.log('データベースのクリアが完了しました');
  } catch (error) {
    console.error('データベースのクリア中にエラーが発生しました:', error);
    throw error;
  }
}

// CLI実行時の処理
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    try {
      if (command === 'seed') {
        await seedDatabase();
      } else if (command === 'clear') {
        await clearDatabase();
      } else if (command === 'reset') {
        await clearDatabase();
        await seedDatabase();
      } else {
        console.log('使用方法:');
        console.log('  npm run seed       - テストデータを作成');
        console.log('  npm run seed:clear - データベースをクリア');
        console.log('  npm run seed:reset - データベースをリセット');
        process.exit(1);
      }
    } catch (error) {
      console.error('エラーが発生しました:', error);
      process.exit(1);
    }
  })();
}