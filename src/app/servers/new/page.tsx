'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Package,
  Upload,
  Globe,
  GitBranch,
  Download,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  FileText,
  Settings
} from 'lucide-react';
import { InstallType } from '@/types/models';
import { BitwardenEnvSelector } from '@/components/bitwarden/bitwarden-env-selector';
import { JsonServerInput } from '@/components/servers/json-server-input';

// =============================================================================
// サーバー追加ページ - 新しいインストール方法対応
// Docker、NPM、GitHub、既存コンテナからの複数インストール方式をサポート
// =============================================================================

interface ServerForm {
  name: string;
  description: string;
  installationType: InstallType;
  // Docker関連
  dockerImage?: string;
  dockerTag?: string;
  dockerPorts?: string;
  dockerEnvVars?: string;
  // NPM関連
  npmPackage?: string;
  npmVersion?: string;
  // NPX関連
  npxPackage?: string;
  npxArgs?: string;
  // UVX関連（Python用）
  uvxPackage?: string;
  uvxArgs?: string;
  // PIP関連
  pipPackage?: string;
  pipVersion?: string;
  pythonVersion?: string;
  // GitHub関連
  githubUrl?: string;
  githubBranch?: string;
  buildCommand?: string;
  // ローカルスクリプト関連
  scriptPath?: string;
  scriptArgs?: string;
  interpreter?: string; // python, node, bash等
  // 既存コンテナ関連
  existingContainerId?: string;
  // 共通設定
  exposedPort: number;
  environmentVars: Record<string, string>;
  autoStart: boolean;
}

const defaultForm: ServerForm = {
  name: '',
  description: '',
  installationType: 'docker',
  dockerTag: 'latest',
  exposedPort: 3000,
  environmentVars: {},
  autoStart: true,
  dockerPorts: '3000:3000',
  dockerEnvVars: '',
  npmVersion: 'latest',
  npxArgs: '',
  uvxArgs: '',
  pipVersion: 'latest',
  pythonVersion: '3.11',
  githubBranch: 'main',
  buildCommand: 'npm run build && npm start',
  scriptArgs: '',
  interpreter: 'python'
};

function NewServerPageComponent() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [form, setForm] = useState<ServerForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'form' | 'json'>('form');
  const [availableContainers, setAvailableContainers] = useState<{ id: string; name: string; image: string }[]>([]);

  // 利用可能なDockerイメージを取得
  useEffect(() => {
    const fetchAvailableImages = async () => {
      try {
        const response = await fetch('/api/v1/catalog');
        if (response.ok) {
          const data = await response.json();
          setAvailableImages(data.data?.map((item: any) => item.dockerImage) || []);
        }
      } catch (error) {
        console.error('Failed to fetch available images:', error);
      }
    };

    fetchAvailableImages();
  }, []);

  // 既存のコンテナを取得
  useEffect(() => {
    const fetchExistingContainers = async () => {
      try {
        const response = await fetch('/api/v1/docker/containers');
        if (response.ok) {
          const data = await response.json();
          setAvailableContainers(data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch existing containers:', error);
      }
    };

    if (form.installationType === 'existing') {
      fetchExistingContainers();
    }
  }, [form.installationType]);

  const handleInputChange = (field: keyof ServerForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    // エラーをクリア
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleEnvironmentVarsChange = (value: string) => {
    try {
      const envVars: Record<string, string> = {};
      value.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) {
          envVars[key.trim()] = val.trim();
        }
      });
      handleInputChange('environmentVars', envVars);
      handleInputChange('dockerEnvVars', value);
    } catch (error) {
      console.error('Invalid environment variables format:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = 'サーバー名は必須です';
    }

    if (!form.installationType) {
      newErrors.installationType = 'インストール方法を選択してください';
    }

    switch (form.installationType) {
      case 'docker':
        if (!form.dockerImage) {
          newErrors.dockerImage = 'Dockerイメージは必須です';
        }
        break;
      case 'npm':
        if (!form.npmPackage) {
          newErrors.npmPackage = 'NPMパッケージ名は必須です';
        }
        break;
      case 'npx':
        if (!form.npxPackage) {
          newErrors.npxPackage = 'NPXパッケージ名は必須です';
        }
        break;
      case 'uvx':
        if (!form.uvxPackage) {
          newErrors.uvxPackage = 'UVXパッケージ名は必須です';
        }
        break;
      case 'pip':
        if (!form.pipPackage) {
          newErrors.pipPackage = 'PIPパッケージ名は必須です';
        }
        break;
      case 'local_script':
        if (!form.scriptPath) {
          newErrors.scriptPath = 'スクリプトパスは必須です';
        }
        if (!form.interpreter) {
          newErrors.interpreter = 'インタープリターは必須です';
        }
        break;
      case 'github':
        if (!form.githubUrl) {
          newErrors.githubUrl = 'GitHubリポジトリURLは必須です';
        }
        if (!form.buildCommand) {
          newErrors.buildCommand = 'ビルドコマンドは必須です';
        }
        break;
      case 'existing':
        if (!form.existingContainerId) {
          newErrors.existingContainerId = '既存のコンテナを選択してください';
        }
        break;
    }

    if (form.exposedPort < 1 || form.exposedPort > 65535) {
      newErrors.exposedPort = 'ポート番号は1-65535の範囲で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'サーバーの追加に失敗しました');
      }

      const result = await response.json();

      // 成功時はダッシュボードにリダイレクト
      router.push('/dashboard?message=server-added');
    } catch (error) {
      console.error('Failed to add server:', error);
      setErrors({ general: error instanceof Error ? error.message : 'サーバーの追加に失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const renderInstallationTypeFields = () => {
    switch (form.installationType) {
      case 'docker':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="dockerImage">Dockerイメージ *</Label>
              <Select value={form.dockerImage || ''} onValueChange={(value) => handleInputChange('dockerImage', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Dockerイメージを選択または入力" />
                </SelectTrigger>
                <SelectContent>
                  {availableImages.map((image) => (
                    <SelectItem key={image} value={image}>{image}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!availableImages.includes(form.dockerImage || '') && (
                <Input
                  className="mt-2"
                  placeholder="カスタムDockerイメージ名を入力"
                  value={form.dockerImage || ''}
                  onChange={(e) => handleInputChange('dockerImage', e.target.value)}
                />
              )}
              {errors.dockerImage && <p className="text-red-500 text-sm mt-1">{errors.dockerImage}</p>}
            </div>

            <div>
              <Label htmlFor="dockerTag">タグ</Label>
              <Input
                id="dockerTag"
                value={form.dockerTag || ''}
                onChange={(e) => handleInputChange('dockerTag', e.target.value)}
                placeholder="latest"
              />
            </div>

            <div>
              <Label htmlFor="dockerPorts">ポートマッピング</Label>
              <Input
                id="dockerPorts"
                value={form.dockerPorts || ''}
                onChange={(e) => handleInputChange('dockerPorts', e.target.value)}
                placeholder="3000:3000"
              />
              <p className="text-gray-500 text-sm mt-1">形式: ホストポート:コンテナポート</p>
            </div>
          </div>
        );

      case 'npm':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="npmPackage">NPMパッケージ名 *</Label>
              <Input
                id="npmPackage"
                value={form.npmPackage || ''}
                onChange={(e) => handleInputChange('npmPackage', e.target.value)}
                placeholder="@example/mcp-server"
              />
              {errors.npmPackage && <p className="text-red-500 text-sm mt-1">{errors.npmPackage}</p>}
            </div>

            <div>
              <Label htmlFor="npmVersion">バージョン</Label>
              <Input
                id="npmVersion"
                value={form.npmVersion || ''}
                onChange={(e) => handleInputChange('npmVersion', e.target.value)}
                placeholder="latest"
              />
            </div>
          </div>
        );

      case 'github':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="githubUrl">GitHubリポジトリURL *</Label>
              <Input
                id="githubUrl"
                value={form.githubUrl || ''}
                onChange={(e) => handleInputChange('githubUrl', e.target.value)}
                placeholder="https://github.com/username/repository"
              />
              {errors.githubUrl && <p className="text-red-500 text-sm mt-1">{errors.githubUrl}</p>}
            </div>

            <div>
              <Label htmlFor="githubBranch">ブランチ</Label>
              <Input
                id="githubBranch"
                value={form.githubBranch || ''}
                onChange={(e) => handleInputChange('githubBranch', e.target.value)}
                placeholder="main"
              />
            </div>

            <div>
              <Label htmlFor="buildCommand">ビルドコマンド *</Label>
              <Input
                id="buildCommand"
                value={form.buildCommand || ''}
                onChange={(e) => handleInputChange('buildCommand', e.target.value)}
                placeholder="npm run build && npm start"
              />
              {errors.buildCommand && <p className="text-red-500 text-sm mt-1">{errors.buildCommand}</p>}
            </div>
          </div>
        );

      case 'npx':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="npxPackage">NPXパッケージ *</Label>
              <Input
                id="npxPackage"
                value={form.npxPackage || ''}
                onChange={(e) => handleInputChange('npxPackage', e.target.value)}
                placeholder="@modelcontextprotocol/server-example"
              />
              {errors.npxPackage && <p className="text-red-500 text-sm mt-1">{errors.npxPackage}</p>}
            </div>

            <div>
              <Label htmlFor="npxArgs">追加引数</Label>
              <Input
                id="npxArgs"
                value={form.npxArgs || ''}
                onChange={(e) => handleInputChange('npxArgs', e.target.value)}
                placeholder="--port 3000 --config config.json"
              />
              <p className="text-sm text-gray-500 mt-1">
                NPXコマンドに渡す追加の引数
              </p>
            </div>
          </div>
        );

      case 'uvx':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="uvxPackage">UVXパッケージ *</Label>
              <Input
                id="uvxPackage"
                value={form.uvxPackage || ''}
                onChange={(e) => handleInputChange('uvxPackage', e.target.value)}
                placeholder="mcp-server-git"
              />
              {errors.uvxPackage && <p className="text-red-500 text-sm mt-1">{errors.uvxPackage}</p>}
              <p className="text-sm text-gray-500 mt-1">
                UV（Pythonパッケージマネージャー）経由でインストール
              </p>
            </div>

            <div>
              <Label htmlFor="uvxArgs">追加引数</Label>
              <Input
                id="uvxArgs"
                value={form.uvxArgs || ''}
                onChange={(e) => handleInputChange('uvxArgs', e.target.value)}
                placeholder="--port 3000"
              />
              <p className="text-sm text-gray-500 mt-1">
                UVXコマンドに渡す追加の引数
              </p>
            </div>
          </div>
        );

      case 'pip':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pipPackage">PIPパッケージ *</Label>
              <Input
                id="pipPackage"
                value={form.pipPackage || ''}
                onChange={(e) => handleInputChange('pipPackage', e.target.value)}
                placeholder="mcp-server-filesystem"
              />
              {errors.pipPackage && <p className="text-red-500 text-sm mt-1">{errors.pipPackage}</p>}
            </div>

            <div>
              <Label htmlFor="pipVersion">パッケージバージョン</Label>
              <Input
                id="pipVersion"
                value={form.pipVersion || ''}
                onChange={(e) => handleInputChange('pipVersion', e.target.value)}
                placeholder="latest"
              />
            </div>

            <div>
              <Label htmlFor="pythonVersion">Pythonバージョン</Label>
              <Select value={form.pythonVersion || ''} onValueChange={(value) => handleInputChange('pythonVersion', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pythonバージョンを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3.8">Python 3.8</SelectItem>
                  <SelectItem value="3.9">Python 3.9</SelectItem>
                  <SelectItem value="3.10">Python 3.10</SelectItem>
                  <SelectItem value="3.11">Python 3.11</SelectItem>
                  <SelectItem value="3.12">Python 3.12</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'local_script':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="scriptPath">スクリプトパス *</Label>
              <Input
                id="scriptPath"
                value={form.scriptPath || ''}
                onChange={(e) => handleInputChange('scriptPath', e.target.value)}
                placeholder="/path/to/script.py または ./server.js"
              />
              {errors.scriptPath && <p className="text-red-500 text-sm mt-1">{errors.scriptPath}</p>}
              <p className="text-sm text-gray-500 mt-1">
                実行するスクリプトファイルの絶対パスまたは相対パス
              </p>
            </div>

            <div>
              <Label htmlFor="interpreter">インタープリター *</Label>
              <Select value={form.interpreter || ''} onValueChange={(value) => handleInputChange('interpreter', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="インタープリターを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="python">Python</SelectItem>
                  <SelectItem value="node">Node.js</SelectItem>
                  <SelectItem value="bash">Bash</SelectItem>
                  <SelectItem value="python3">Python 3</SelectItem>
                  <SelectItem value="deno">Deno</SelectItem>
                  <SelectItem value="bun">Bun</SelectItem>
                </SelectContent>
              </Select>
              {errors.interpreter && <p className="text-red-500 text-sm mt-1">{errors.interpreter}</p>}
            </div>

            <div>
              <Label htmlFor="scriptArgs">スクリプト引数</Label>
              <Input
                id="scriptArgs"
                value={form.scriptArgs || ''}
                onChange={(e) => handleInputChange('scriptArgs', e.target.value)}
                placeholder="--config config.json --debug"
              />
              <p className="text-sm text-gray-500 mt-1">
                スクリプトに渡す引数
              </p>
            </div>
          </div>
        );

      case 'existing':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="existingContainerId">既存のコンテナ *</Label>
              <Select value={form.existingContainerId || ''} onValueChange={(value) => handleInputChange('existingContainerId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="既存のコンテナを選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableContainers.map((container) => (
                    <SelectItem key={container.id} value={container.id}>
                      {container.name} ({container.image})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.existingContainerId && <p className="text-red-500 text-sm mt-1">{errors.existingContainerId}</p>}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getInstallationTypeIcon = (type: InstallType) => {
    switch (type) {
      case 'docker':
        return <Package className="h-4 w-4" />;
      case 'npm':
        return <Download className="h-4 w-4" />;
      case 'npx':
        return <Download className="h-4 w-4" />;
      case 'uvx':
        return <Package className="h-4 w-4" />;
      case 'pip':
        return <Package className="h-4 w-4" />;
      case 'local_script':
        return <Globe className="h-4 w-4" />;
      case 'github':
        return <GitBranch className="h-4 w-4" />;
      case 'existing':
        return <Upload className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getInstallationTypeDescription = (type: InstallType) => {
    switch (type) {
      case 'docker':
        return 'DockerHubまたはプライベートレジストリからイメージを取得';
      case 'npm':
        return 'NPMレジストリからパッケージをダウンロードしてコンテナ化';
      case 'npx':
        return 'NPXを使用してパッケージを実行（一時インストール）';
      case 'uvx':
        return 'UV（Python）を使用してパッケージを実行・管理';
      case 'pip':
        return 'PIPを使用してPythonパッケージをインストール';
      case 'local_script':
        return 'ローカルスクリプトファイルを直接実行';
      case 'github':
        return 'GitHubリポジトリからソースをクローンしてビルド';
      case 'existing':
        return '既存のDockerコンテナを管理対象として登録';
      default:
        return '';
    }
  };

  // 開発環境での認証チェック
  if (process.env.NODE_ENV !== 'development' && sessionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  if (process.env.NODE_ENV !== 'development' && !session) {
    router.push('/auth/signin');
    return null;
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center space-x-4 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          戻る
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">新しいサーバーを追加</h1>
          <p className="text-muted-foreground">
            複数の方法でMCPサーバーをインストールして管理できます
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'form' | 'json')} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="form" className="flex items-center space-x-2">
            <Settings className="h-4 w-4" />
            <span>フォーム入力</span>
          </TabsTrigger>
          <TabsTrigger value="json" className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>JSON入力</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-6">

      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.general && (
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span>{errors.general}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">サーバー名 *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="My MCP Server"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="このサーバーの説明を入力..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>インストール方法</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>インストールタイプ *</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                {(['docker', 'npm', 'npx', 'uvx', 'pip', 'local_script', 'github', 'existing'] as InstallType[]).map((type) => (
                  <Card
                    key={type}
                    className={`cursor-pointer transition-all ${
                      form.installationType === type
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleInputChange('installationType', type)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-3">
                        {getInstallationTypeIcon(type)}
                        <div>
                          <div className="font-semibold">
                            {type === 'local_script' ? 'Local Script' : type.toUpperCase()}
                          </div>
                          <div className="text-sm text-gray-600">
                            {getInstallationTypeDescription(type)}
                          </div>
                        </div>
                        {form.installationType === type && (
                          <CheckCircle className="h-5 w-5 text-blue-500 ml-auto" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {errors.installationType && <p className="text-red-500 text-sm mt-1">{errors.installationType}</p>}
            </div>

            {form.installationType && (
              <>
                <Separator />
                {renderInstallationTypeFields()}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ネットワーク設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="exposedPort">公開ポート *</Label>
              <Input
                id="exposedPort"
                type="number"
                value={form.exposedPort}
                onChange={(e) => handleInputChange('exposedPort', parseInt(e.target.value) || 0)}
                placeholder="3000"
                min="1"
                max="65535"
                className={errors.exposedPort ? 'border-red-500' : ''}
              />
              {errors.exposedPort && <p className="text-red-500 text-sm mt-1">{errors.exposedPort}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>環境変数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="environmentVars">環境変数</Label>
              <Textarea
                id="environmentVars"
                value={form.dockerEnvVars || ''}
                onChange={(e) => handleEnvironmentVarsChange(e.target.value)}
                placeholder="KEY1=value1&#10;KEY2=value2"
                rows={4}
              />
              <p className="text-gray-500 text-sm mt-1">
                各行に KEY=VALUE の形式で入力してください
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-sm text-gray-600">
                機密情報はBitwardenから安全に取得できます
              </p>
              <BitwardenEnvSelector
                onSelect={(key, value, source) => {
                  // 既存の環境変数に追加
                  const currentEnvVars = form.dockerEnvVars || '';
                  const newEnvVar = `${key}=${value}`;
                  const updatedEnvVars = currentEnvVars
                    ? `${currentEnvVars}\n${newEnvVar}`
                    : newEnvVar;
                  handleEnvironmentVarsChange(updatedEnvVars);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>起動設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoStart"
                checked={form.autoStart}
                onChange={(e) => handleInputChange('autoStart', e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="autoStart">サーバー追加後に自動的に起動する</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? 'サーバーを追加中...' : 'サーバーを追加'}
          </Button>
        </div>
      </form>
        </TabsContent>

        <TabsContent value="json" className="space-y-6">
          <JsonServerInput onClose={() => router.back()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 開発環境では認証バイパス、本番環境では認証必須
export default function AddServerPage() {
  // 開発環境での認証バイパス
  if (process.env.NODE_ENV === 'development') {
    return <NewServerPageComponent />;
  }

  // 本番環境では認証必須
  return (
    <ProtectedRoute>
      <NewServerPageComponent />
    </ProtectedRoute>
  );
}