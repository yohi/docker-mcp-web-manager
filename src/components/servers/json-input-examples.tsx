'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, FileText } from 'lucide-react';

interface JsonExamplesProps {
  onSelectExample: (json: string) => void;
}

export function JsonInputExamples({ onSelectExample }: JsonExamplesProps) {
  const examples = [
    {
      title: 'Docker サーバー',
      description: '基本的なDockerイメージからのサーバー作成',
      json: {
        name: 'nginx-server',
        description: 'NGINXウェブサーバー',
        installationType: 'docker',
        dockerImage: 'nginx',
        dockerTag: 'latest',
        exposedPort: 8080,
        environmentVars: {
          NGINX_HOST: 'localhost',
          NGINX_PORT: '80'
        },
        autoStart: true
      }
    },
    {
      title: 'NPM パッケージ',
      description: 'NPMパッケージからのサーバー作成',
      json: {
        name: 'express-app',
        description: 'Express.jsアプリケーション',
        installationType: 'npm',
        npmPackage: 'express-generator',
        npmVersion: 'latest',
        exposedPort: 3000,
        environmentVars: {
          NODE_ENV: 'production'
        },
        autoStart: false
      }
    },
    {
      title: 'UVX (Python)',
      description: 'UV (Python)パッケージマネージャーを使用',
      json: {
        name: 'fastapi-server',
        description: 'FastAPI サーバー',
        installationType: 'uvx',
        uvxPackage: 'fastapi-cli',
        uvxArgs: '--port 8000',
        exposedPort: 8000,
        environmentVars: {
          PYTHONPATH: '/app'
        },
        autoStart: true
      }
    },
    {
      title: 'GitHub リポジトリ',
      description: 'GitHubからソースコードをクローンしてビルド',
      json: {
        name: 'mcp-server-git',
        description: 'Git操作MCPサーバー',
        installationType: 'github',
        githubUrl: 'https://github.com/modelcontextprotocol/servers.git',
        githubBranch: 'main',
        buildCommand: 'cd src/git && npm install && npm run build',
        exposedPort: 3001,
        environmentVars: {},
        autoStart: false
      }
    },
    {
      title: '複数サーバー（配列）',
      description: '複数のサーバーを一度に作成',
      json: [
        {
          name: 'redis-server',
          description: 'Redis キャッシュサーバー',
          installationType: 'docker',
          dockerImage: 'redis',
          dockerTag: 'alpine',
          exposedPort: 6379,
          environmentVars: {},
          autoStart: true
        },
        {
          name: 'postgres-db',
          description: 'PostgreSQL データベース',
          installationType: 'docker',
          dockerImage: 'postgres',
          dockerTag: '15',
          exposedPort: 5432,
          environmentVars: {
            POSTGRES_DB: 'myapp',
            POSTGRES_USER: 'admin',
            POSTGRES_PASSWORD: 'secret123'
          },
          autoStart: true
        }
      ]
    }
  ];

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="h-5 w-5" />
        <h3 className="text-lg font-semibold">設定例</h3>
      </div>

      <div className="grid gap-4">
        {examples.map((example, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{example.title}</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">{example.description}</p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(example.json, null, 2))}
                    className="text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    コピー
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onSelectExample(JSON.stringify(example.json, null, 2))}
                    className="text-xs"
                  >
                    使用
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  {Array.isArray(example.json) ? `${example.json.length}個のサーバー` : example.json.installationType}
                </Badge>
                <Badge variant="secondary">
                  ポート: {Array.isArray(example.json) ? '複数' : example.json.exposedPort}
                </Badge>
              </div>
              <pre className="text-xs bg-gray-50 p-3 rounded-md overflow-x-auto">
                <code>{JSON.stringify(example.json, null, 2)}</code>
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}