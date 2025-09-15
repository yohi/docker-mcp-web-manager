'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Upload,
  FileJson,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Server
} from 'lucide-react';
import { ImportResult } from '@/app/api/v1/servers/import/route';

// =============================================================================
// サーバー設定のエクスポート・インポート機能
// JSON形式での一括管理をサポート
// =============================================================================

interface ExportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedServerIds?: string[];
  onImportSuccess?: () => void;
}

export function ExportImportDialog({
  open,
  onOpenChange,
  selectedServerIds = [],
  onImportSuccess
}: ExportImportDialogProps) {
  // エクスポート関連の状態
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [includeSecrets, setIncludeSecrets] = useState(false);

  // インポート関連の状態
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [importData, setImportData] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // エクスポート処理
  const handleExport = async () => {
    setExportLoading(true);
    setExportError(null);

    try {
      const params = new URLSearchParams({
        format: 'json',
        includeSecrets: includeSecrets.toString(),
        ...(selectedServerIds.length > 0 && { ids: selectedServerIds.join(',') })
      });

      const response = await fetch(`/api/v1/servers/export?${params}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'エクスポートに失敗しました');
      }

      // ファイルダウンロード処理
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // ファイル名を決定
      const filename = selectedServerIds.length > 0
        ? `mcp-servers-selected-${new Date().toISOString().split('T')[0]}.json`
        : `mcp-servers-all-${new Date().toISOString().split('T')[0]}.json`;

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'エクスポートに失敗しました');
    } finally {
      setExportLoading(false);
    }
  };

  // ファイル選択処理
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        // JSONの妥当性をチェック
        JSON.parse(content);
        setImportData(content);
        setImportError(null);
      } catch (error) {
        setImportError('無効なJSONファイルです');
      }
    };
    reader.readAsText(file);
  };

  // インポート処理（バリデーション）
  const handleValidateImport = async () => {
    if (!importData) {
      setImportError('インポートするデータを入力してください');
      return;
    }

    setImportLoading(true);
    setImportError(null);

    try {
      const data = JSON.parse(importData);
      const params = new URLSearchParams({
        validate: 'true',
        overwrite: overwriteExisting.toString()
      });

      const response = await fetch(`/api/v1/servers/import?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'バリデーションに失敗しました');
      }

      setImportResult(result.data);

    } catch (error) {
      console.error('Import validation failed:', error);
      setImportError(error instanceof Error ? error.message : 'バリデーションに失敗しました');
    } finally {
      setImportLoading(false);
    }
  };

  // インポート実行処理
  const handleExecuteImport = async () => {
    if (!importData) return;

    setImportLoading(true);
    setImportError(null);

    try {
      const data = JSON.parse(importData);
      const params = new URLSearchParams({
        overwrite: overwriteExisting.toString()
      });

      const response = await fetch(`/api/v1/servers/import?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'インポートに失敗しました');
      }

      setImportResult(result.data);

      // 成功時のコールバック
      if (result.data.imported > 0 && onImportSuccess) {
        onImportSuccess();
      }

    } catch (error) {
      console.error('Import failed:', error);
      setImportError(error instanceof Error ? error.message : 'インポートに失敗しました');
    } finally {
      setImportLoading(false);
    }
  };

  // ダイアログクローズ時のリセット
  const handleClose = () => {
    setExportError(null);
    setImportError(null);
    setImportResult(null);
    setImportData('');
    setIncludeSecrets(false);
    setOverwriteExisting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <FileJson className="h-5 w-5" />
            <span>サーバー設定のエクスポート・インポート</span>
          </DialogTitle>
          <DialogDescription>
            サーバー設定をJSON形式でエクスポート・インポートして一括管理できます
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="export" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="flex items-center space-x-2">
              <Download className="h-4 w-4" />
              <span>エクスポート</span>
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>インポート</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>設定のエクスポート</CardTitle>
                <CardDescription>
                  {selectedServerIds.length > 0
                    ? `選択した ${selectedServerIds.length} 個のサーバー設定をエクスポート`
                    : '全てのサーバー設定をエクスポート'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeSecrets"
                    checked={includeSecrets}
                    onCheckedChange={(checked) => setIncludeSecrets(checked === true)}
                  />
                  <Label htmlFor="includeSecrets">
                    機密情報を含める（パスワード、APIキーなど）
                  </Label>
                </div>

                {exportError && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{exportError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end space-x-2">
                  <Button
                    onClick={handleExport}
                    disabled={exportLoading}
                    className="flex items-center space-x-2"
                  >
                    {exportLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span>
                      {exportLoading ? 'エクスポート中...' : 'JSONファイルをダウンロード'}
                    </span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>設定のインポート</CardTitle>
                <CardDescription>
                  JSONファイルからサーバー設定をインポートします
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>インポートファイル</Label>
                  <div className="flex space-x-2">
                    <Input
                      type="file"
                      accept=".json"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      ファイル選択
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="importData">またはJSONデータを直接入力</Label>
                  <Textarea
                    id="importData"
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    placeholder="JSONデータをペーストしてください..."
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="overwriteExisting"
                    checked={overwriteExisting}
                    onCheckedChange={(checked) => setOverwriteExisting(checked === true)}
                  />
                  <Label htmlFor="overwriteExisting">
                    同名のサーバーが存在する場合は上書きする
                  </Label>
                </div>

                {importError && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{importError}</AlertDescription>
                  </Alert>
                )}

                {importResult && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="font-semibold">インポート結果</div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              成功: {importResult.imported}
                            </Badge>
                          </div>
                          <div>
                            <Badge variant="secondary">
                              スキップ: {importResult.skipped}
                            </Badge>
                          </div>
                          <div>
                            <Badge variant="destructive">
                              失敗: {importResult.failed}
                            </Badge>
                          </div>
                        </div>

                        {importResult.details.imported.length > 0 && (
                          <div>
                            <div className="font-medium">成功:</div>
                            <div className="text-sm text-gray-600">
                              {importResult.details.imported.join(', ')}
                            </div>
                          </div>
                        )}

                        {importResult.details.skipped.length > 0 && (
                          <div>
                            <div className="font-medium">スキップ:</div>
                            <div className="text-sm text-gray-600">
                              {importResult.details.skipped.map(item => (
                                <div key={item.name}>
                                  {item.name}: {item.reason}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {importResult.details.failed.length > 0 && (
                          <div>
                            <div className="font-medium">失敗:</div>
                            <div className="text-sm text-red-600">
                              {importResult.details.failed.map(item => (
                                <div key={item.name}>
                                  {item.name}: {item.error}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={handleValidateImport}
                    disabled={importLoading || !importData}
                    className="flex items-center space-x-2"
                  >
                    {importLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>検証のみ実行</span>
                  </Button>
                  <Button
                    onClick={handleExecuteImport}
                    disabled={importLoading || !importData}
                    className="flex items-center space-x-2"
                  >
                    {importLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>
                      {importLoading ? 'インポート中...' : 'インポート実行'}
                    </span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleClose}>
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}