'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Key,
  Search,
  Shield,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  LogIn
} from 'lucide-react';

// =============================================================================
// Bitwarden環境変数選択コンポーネント
// Bitwardenアイテムから環境変数を選択・設定
// =============================================================================

interface BitwardenItem {
  id: string;
  name: string;
  type: number;
  favorite: boolean;
  availableFields: Array<{ name: string; type: 'text' | 'password' | 'hidden' }>;
}

interface BitwardenAuthState {
  status: 'unauthenticated' | 'locked' | 'unlocked';
  userEmail?: string;
  serverUrl?: string;
}

type AuthMethod = 'password' | 'apikey' | 'sso';

interface BitwardenEnvSelectorProps {
  onSelect: (key: string, value: string, source: 'bitwarden') => void;
  trigger?: React.ReactNode;
}

export function BitwardenEnvSelector({ onSelect, trigger }: BitwardenEnvSelectorProps) {
  const [open, setOpen] = useState(false);
  const [authState, setAuthState] = useState<BitwardenAuthState>({ status: 'unauthenticated' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BitwardenItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // 認証フォーム状態
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    totpCode: '',
    masterPassword: '',
    clientId: '',
    clientSecret: '',
    ssoIdentifier: ''
  });

  // 選択状態
  const [selectedItem, setSelectedItem] = useState<BitwardenItem | null>(null);
  const [selectedField, setSelectedField] = useState<string>('');
  const [envVarName, setEnvVarName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ダイアログ開始時にステータス確認
  useEffect(() => {
    if (open) {
      checkBitwardenStatus();
    }
  }, [open]);

  const checkBitwardenStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/bitwarden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' })
      });

      const result = await response.json();
      console.log('[BITWARDEN] Status check result:', result);

      if (result.success) {
        setAuthState({
          status: result.data.status,
          userEmail: result.data.userEmail,
          serverUrl: result.data.serverUrl
        });

        console.log('[BITWARDEN] Auth state updated:', {
          status: result.data.status,
          userEmail: result.data.userEmail,
          isLoggedIn: result.data.isLoggedIn,
          isUnlocked: result.data.isUnlocked,
          sessionRecovered: result.data.sessionRecovered
        });

        // アンロック済みの場合はアイテムを取得
        if (result.data.status === 'unlocked') {
          console.log('[BITWARDEN] Vault is unlocked, fetching items...');
          await fetchItems();
        } else {
          console.log('[BITWARDEN] Vault not unlocked, status:', result.data.status);
        }
      } else {
        console.error('[BITWARDEN] Status check failed:', result.error);
        setError(result.error?.message || 'ステータス確認に失敗しました');
      }
    } catch (error) {
      setError('Bitwardenステータスの確認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    // 認証方法別のバリデーション
    if (authMethod === 'password') {
      if (!authForm.email || !authForm.password) {
        setError('メールアドレスとパスワードを入力してください');
        return;
      }
    } else if (authMethod === 'apikey') {
      if (!authForm.clientId || !authForm.clientSecret) {
        setError('Client IDとClient Secretを入力してください');
        return;
      }
    }
    // SSO認証はssoIdentifierは任意

    setLoading(true);
    setError(null);

    try {
      const loginData: any = { action: 'login' };

      if (authMethod === 'password') {
        loginData.email = authForm.email;
        loginData.password = authForm.password;
        if (authForm.totpCode) {
          loginData.totpCode = authForm.totpCode;
        }
      } else if (authMethod === 'apikey') {
        loginData.clientId = authForm.clientId;
        loginData.clientSecret = authForm.clientSecret;
      } else if (authMethod === 'sso') {
        loginData.ssoIdentifier = authForm.ssoIdentifier || undefined;
      }

      const response = await fetch('/api/v1/bitwarden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const result = await response.json();

      if (!result.success) {
        if (authMethod === 'password' && result.error.requiresTOTP && !authForm.totpCode) {
          setError('2段階認証コードを入力してください');
          return;
        }
        setError(result.error.message || 'ログインに失敗しました');
        return;
      }

      // ログイン成功時はステータスを更新してアイテム取得
      await checkBitwardenStatus();
      setAuthForm({
        email: '',
        password: '',
        totpCode: '',
        masterPassword: '',
        clientId: '',
        clientSecret: '',
        ssoIdentifier: ''
      });

    } catch (error) {
      setError('ログイン中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!authForm.masterPassword) {
      setError('マスターパスワードを入力してください');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/bitwarden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unlock',
          masterPassword: authForm.masterPassword
        })
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error.message || 'アンロックに失敗しました');
        return;
      }

      // アンロック成功時はアイテムを取得
      await fetchItems();
      setAuthState(prev => ({ ...prev, status: 'unlocked' }));
      setAuthForm(prev => ({ ...prev, masterPassword: '' }));

    } catch (error) {
      setError('アンロック中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async (search?: string) => {
    setLoading(true);
    console.log('[BITWARDEN] Fetching items, search:', search);

    try {
      const params = new URLSearchParams();
      if (search) {
        params.append('search', search);
      }

      const response = await fetch(`/api/v1/bitwarden?${params}`);
      const result = await response.json();

      console.log('[BITWARDEN] Fetch items result:', result);

      if (result.success) {
        console.log('[BITWARDEN] Items fetched successfully:', result.data.items?.length || 0, 'items');
        setItems(result.data.items || []);
      } else {
        console.error('[BITWARDEN] Fetch items failed:', result.error);
        setError(result.error.message || 'アイテムの取得に失敗しました');
      }
    } catch (error) {
      console.error('[BITWARDEN] Fetch items error:', error);
      setError('アイテムの取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchItems(searchTerm);
  };

  const handleItemSelect = (item: BitwardenItem) => {
    setSelectedItem(item);
    setSelectedField('');
    setEnvVarName('');
  };

  const handleFieldSelect = (fieldName: string) => {
    setSelectedField(fieldName);
    // 環境変数名を自動生成（例: アイテム名_フィールド名）
    const autoEnvName = `${selectedItem?.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${fieldName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
    setEnvVarName(autoEnvName);
  };

  const handleConfirmSelection = async () => {
    if (!selectedItem || !selectedField || !envVarName) {
      setError('アイテム、フィールド、環境変数名をすべて選択してください');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/v1/bitwarden/${selectedItem.id}?field=${selectedField}`);
      const result = await response.json();

      if (result.success) {
        onSelect(envVarName, result.data.value, 'bitwarden');
        setOpen(false);
        // 状態リセット
        setSelectedItem(null);
        setSelectedField('');
        setEnvVarName('');
      } else {
        setError(result.error.message || '値の取得に失敗しました');
      }
    } catch (error) {
      setError('値の取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const renderAuthForm = () => {
    if (authState.status === 'unlocked') {
      return null;
    }

    if (authState.status === 'locked') {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Vaultのアンロック</span>
            </CardTitle>
            <CardDescription>
              Bitwardenにはログイン済みですが、Vaultがロックされています
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="masterPassword">マスターパスワード</Label>
              <Input
                id="masterPassword"
                type={showPassword ? 'text' : 'password'}
                value={authForm.masterPassword}
                onChange={(e) => setAuthForm(prev => ({ ...prev, masterPassword: e.target.value }))}
                onKeyPress={(e) => e.key === 'Enter' && handleUnlock()}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Button onClick={() => setShowPassword(!showPassword)} variant="outline" size="sm">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button onClick={handleUnlock} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                アンロック
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <LogIn className="h-5 w-5" />
            <span>Bitwardenログイン</span>
          </CardTitle>
          <CardDescription>
            Bitwardenにログインしてアイテムにアクセスします
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={authMethod} onValueChange={(value) => setAuthMethod(value as AuthMethod)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="password">パスワード</TabsTrigger>
              <TabsTrigger value="apikey">APIキー</TabsTrigger>
              <TabsTrigger value="sso">SSO</TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="space-y-4">
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={authForm.password}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="totpCode">2段階認証コード（オプション）</Label>
                <Input
                  id="totpCode"
                  type="text"
                  value={authForm.totpCode}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, totpCode: e.target.value }))}
                  placeholder="123456"
                />
              </div>
            </TabsContent>

            <TabsContent value="apikey" className="space-y-4">
              <div>
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  type="text"
                  value={authForm.clientId}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, clientId: e.target.value }))}
                  placeholder="user.12345678-1234-1234-1234-123456789012"
                />
              </div>
              <div>
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type={showPassword ? 'text' : 'password'}
                  value={authForm.clientSecret}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, clientSecret: e.target.value }))}
                  placeholder="APIキーのClient Secret"
                />
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  APIキーは{' '}
                  <a
                    href="https://vault.bitwarden.com/#/settings/security"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Bitwardenの設定
                  </a>
                  で生成できます。
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="sso" className="space-y-4">
              <div>
                <Label htmlFor="ssoIdentifier">組織識別子（オプション）</Label>
                <Input
                  id="ssoIdentifier"
                  type="text"
                  value={authForm.ssoIdentifier}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, ssoIdentifier: e.target.value }))}
                  placeholder="your-organization"
                />
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  SSO認証はブラウザで実行されます。CLIでの対話的認証が必要です。
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>
          <div className="flex items-center space-x-2">
            <Button onClick={() => setShowPassword(!showPassword)} variant="outline" size="sm">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button onClick={handleLogin} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
              ログイン
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderItemSelector = () => {
    if (authState.status !== 'unlocked') {
      return null;
    }

    return (
      <div className="space-y-4">
        {/* 検索 */}
        <div className="flex space-x-2">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="アイテムを検索..."
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} variant="outline">
            <Search className="h-4 w-4" />
          </Button>
          <Button onClick={() => fetchItems()} variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* アイテム一覧 */}
        <div className="max-h-60 overflow-y-auto space-y-2">
          {items.map(item => (
            <Card
              key={item.id}
              className={`cursor-pointer transition-colors ${
                selectedItem?.id === item.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => handleItemSelect(item)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-gray-500">
                      {item.availableFields.length} フィールド利用可能
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    {item.favorite && <Badge variant="secondary">★</Badge>}
                    <Badge variant="outline">
                      {item.type === 1 ? 'ログイン' : item.type === 2 ? 'メモ' : 'その他'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* フィールド選択 */}
        {selectedItem && (
          <Card>
            <CardHeader>
              <CardTitle>フィールド選択: {selectedItem.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>利用可能フィールド</Label>
                <Select value={selectedField} onValueChange={handleFieldSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="フィールドを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedItem.availableFields.map(field => (
                      <SelectItem key={field.name} value={field.name}>
                        <div className="flex items-center space-x-2">
                          <span>{field.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {field.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="envVarName">環境変数名</Label>
                <Input
                  id="envVarName"
                  value={envVarName}
                  onChange={(e) => setEnvVarName(e.target.value)}
                  placeholder="VARIABLE_NAME"
                />
              </div>

              <Button
                onClick={handleConfirmSelection}
                disabled={!selectedField || !envVarName || loading}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                環境変数として設定
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="flex items-center space-x-2">
            <Key className="h-4 w-4" />
            <span>Bitwardenから選択</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Bitwarden環境変数選択</span>
          </DialogTitle>
          <DialogDescription>
            Bitwardenのアイテムから環境変数を安全に取得します
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {authState.status === 'unlocked' && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Bitwardenに接続しました - {authState.userEmail}
              </AlertDescription>
            </Alert>
          )}

          {renderAuthForm()}
          {renderItemSelector()}
        </div>
      </DialogContent>
    </Dialog>
  );
}