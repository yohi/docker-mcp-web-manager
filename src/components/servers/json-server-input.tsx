'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  CheckCircle,
  FileText,
  Loader2,
  Package,
  Download,
  Globe,
  GitBranch,
  Upload
} from 'lucide-react';
import { InstallType } from '@/types/models';
import { JsonInputExamples } from './json-input-examples';

interface JsonServerInputProps {
  onClose: () => void;
}

export function JsonServerInput({ onClose }: JsonServerInputProps) {
  const router = useRouter();
  const [jsonInput, setJsonInput] = useState('');
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [jsonPreview, setJsonPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'examples'>('input');

  // JSON入力の処理
  const handleJsonInputChange = (value: string) => {
    setJsonInput(value);
    setJsonErrors([]);
    setJsonPreview(null);

    if (!value.trim()) return;

    try {
      const parsed = JSON.parse(value);

      // 単一オブジェクトか配列かをチェック
      const servers = Array.isArray(parsed) ? parsed : [parsed];

      // 各サーバー設定の基本バリデーション
      const errors: string[] = [];
      servers.forEach((server, index) => {
        if (!server.name) {
          errors.push(`サーバー ${index + 1}: name は必須です`);
        }
        if (!server.installationType) {
          errors.push(`サーバー ${index + 1}: installationType は必須です`);
        }
        const validTypes: InstallType[] = ['docker', 'npm', 'npx', 'uvx', 'pip', 'local_script', 'github', 'existing'];
        if (server.installationType && !validTypes.includes(server.installationType)) {
          errors.push(`サーバー ${index + 1}: 無効な installationType: ${server.installationType}`);
        }
      });

      if (errors.length > 0) {
        setJsonErrors(errors);
      } else {
        setJsonPreview(servers);
      }
    } catch (error) {
      setJsonErrors(['無効なJSON形式です']);
    }
  };

  // JSON形式でのサーバー作成
  const handleJsonSubmit = async () => {
    if (!jsonPreview) return;

    setLoading(true);
    setJsonErrors([]);

    try {
      const responses = [];

      for (const serverData of jsonPreview) {
        const response = await fetch('/api/v1/servers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(serverData),
        });

        const result = await response.json();
        responses.push({ ...result, serverName: serverData.name });
      }

      // 結果の集計
      const successful = responses.filter(r => r.success);
      const failed = responses.filter(r => !r.success);

      if (failed.length === 0) {
        router.push('/servers?message=' + encodeURIComponent(`${successful.length}個のサーバーを追加しました`));
      } else {
        const errorMessages = failed.map(r => `${r.serverName}: ${r.error?.message || '不明なエラー'}`);
        setJsonErrors([
          `${successful.length}個のサーバーを追加、${failed.length}個のサーバーでエラー:`,
          ...errorMessages
        ]);
      }
    } catch (error) {
      setJsonErrors(['サーバーの作成に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー')]);
    } finally {
      setLoading(false);
    }
  };

  const getInstallationTypeIcon = (type: InstallType) => {
    switch (type) {
      case 'docker':
        return <Package className="h-4 w-4" />;
      case 'npm':
      case 'npx':
        return <Download className="h-4 w-4" />;
      case 'uvx':
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

  const handleSelectExample = (json: string) => {
    setJsonInput(json);
    handleJsonInputChange(json);
    setActiveTab('input');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>JSON設定でサーバーを追加</span>
          </CardTitle>
          <p className="text-sm text-gray-600">
            JSON形式でサーバー設定を入力してください。単一のサーバーまたは複数のサーバーの配列を指定できます。
          </p>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'input' | 'examples')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="input">JSON入力</TabsTrigger>
              <TabsTrigger value="examples">設定例</TabsTrigger>
            </TabsList>

            <TabsContent value="input" className="mt-4 space-y-4">
              <div>
                <Label htmlFor="jsonInput">JSON設定 *</Label>
                <Textarea
                  id="jsonInput"
                  placeholder={`{
  "name": "example-server",
  "description": "サンプルサーバー",
  "installationType": "docker",
  "dockerImage": "nginx",
  "dockerTag": "latest",
  "exposedPort": 3000,
  "environmentVars": {},
  "autoStart": true
}`}
                  value={jsonInput}
                  onChange={(e) => handleJsonInputChange(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  disabled={loading}
                />
              </div>

              {jsonErrors.length > 0 && (
                <Card className="border-red-200">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      {jsonErrors.map((error, index) => (
                        <div key={index} className="flex items-start space-x-2 text-red-600">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{error}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {jsonPreview && (
                <Card className="border-green-200">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      <span>プレビュー（{jsonPreview.length}個のサーバー）</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {jsonPreview.map((server: any, index: number) => (
                        <div key={index} className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                          {getInstallationTypeIcon(server.installationType)}
                          <div className="flex-1">
                            <div className="font-medium">{server.name}</div>
                            <div className="text-sm text-gray-600">
                              {server.installationType} - ポート: {server.exposedPort || 3000}
                            </div>
                            {server.description && (
                              <div className="text-xs text-gray-500 mt-1">{server.description}</div>
                            )}
                          </div>
                          <Badge variant="outline">{server.installationType}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="examples" className="mt-4">
              <JsonInputExamples onSelectExample={handleSelectExample} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={loading}
        >
          キャンセル
        </Button>
        <Button
          onClick={handleJsonSubmit}
          disabled={loading || !jsonPreview}
        >
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {loading ? 'サーバーを追加中...' : `${jsonPreview?.length || 0}個のサーバーを追加`}
        </Button>
      </div>
    </div>
  );
}