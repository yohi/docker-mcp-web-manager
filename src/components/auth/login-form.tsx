'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, User, AlertCircle } from 'lucide-react';

// =============================================================================
// LoginForm - ログイン認証フォームコンポーネント  
// NextAuth.js と Bitwarden 統合による認証機能
// =============================================================================

/**
 * ログインフォームのバリデーションスキーマ
 */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスは必須です')
    .email('有効なメールアドレスを入力してください'),
  password: z
    .string()
    .min(1, 'パスワードは必須です')
    .min(8, 'パスワードは8文字以上である必要があります'),
  serverUrl: z
    .string()
    .url('有効なURLを入力してください')
    .optional()
    .or(z.literal('')),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  callbackUrl?: string;
  error?: string;
}

/**
 * ログインフォームコンポーネント
 */
export function LoginForm({ callbackUrl = '/dashboard', error }: LoginFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(error || null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      serverUrl: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);

    try {
      console.log('[LOGIN_FORM] Attempting login with:', { 
        email: data.email, 
        hasPassword: !!data.password,
        hasServerUrl: !!data.serverUrl 
      });

      const result = await signIn('custom-auth', {
        email: data.email,
        password: data.password,
        authMethod: 'bitwarden',
        serverUrl: data.serverUrl || undefined,
        redirect: false,
        callbackUrl,
      });

      console.log('[LOGIN_FORM] Login result:', result);

      if (result?.error) {
        console.error('[LOGIN_FORM] Login failed:', result.error);
        
        // エラーの種類に応じて適切なメッセージを表示
        switch (result.error) {
          case 'CredentialsSignin':
            setLoginError('メールアドレスまたはパスワードが正しくありません。');
            break;
          case 'BitwardenUnavailable':
            setLoginError('Bitwardenサーバーに接続できません。サーバーURLを確認してください。');
            break;
          case 'TwoFactorRequired':
            setLoginError('二要素認証が必要です。Bitwarden CLIで認証を完了してください。');
            break;
          case 'SessionExpired':
            setLoginError('Bitwardenセッションの有効期限が切れています。再度ログインしてください。');
            break;
          default:
            setLoginError(`認証エラーが発生しました: ${result.error}`);
        }
        return;
      }

      if (result?.ok) {
        console.log('[LOGIN_FORM] Login successful, redirecting to:', callbackUrl);
        router.push(callbackUrl);
        router.refresh();
      } else {
        setLoginError('ログイン処理中に予期しないエラーが発生しました。');
      }
    } catch (error) {
      console.error('[LOGIN_FORM] Login error:', error);
      setLoginError('ログイン処理中にエラーが発生しました。しばらく経ってから再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  const getInputError = (field: keyof LoginFormData) => {
    const error = errors[field];
    return error?.message;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-gray-900" />
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Docker MCP Web Manager
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            アカウントにサインインしてください
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ログイン</CardTitle>
            <CardDescription>
              Bitwardenの認証情報を使用してログインします
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              {/* グローバルエラー */}
              {loginError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}

              {/* メールアドレス入力 */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  メールアドレス
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    className="pl-10"
                    disabled={isLoading}
                    {...register('email')}
                  />
                </div>
                {getInputError('email') && (
                  <p className="text-sm text-red-600">{getInputError('email')}</p>
                )}
              </div>

              {/* パスワード入力 */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  パスワード
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10"
                    disabled={isLoading}
                    {...register('password')}
                  />
                </div>
                {getInputError('password') && (
                  <p className="text-sm text-red-600">{getInputError('password')}</p>
                )}
              </div>

              {/* Bitwardenサーバー URL (オプション) */}
              <div className="space-y-2">
                <label htmlFor="serverUrl" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Bitwardenサーバー URL <span className="text-gray-400">(オプション)</span>
                </label>
                <Input
                  id="serverUrl"
                  type="url"
                  placeholder="https://bitwarden.example.com"
                  disabled={isLoading}
                  {...register('serverUrl')}
                />
                <p className="text-xs text-gray-500">
                  セルフホスト版Bitwardenを使用している場合はサーバーURLを入力してください
                </p>
                {getInputError('serverUrl') && (
                  <p className="text-sm text-red-600">{getInputError('serverUrl')}</p>
                )}
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !isValid}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ログイン中...
                  </>
                ) : (
                  'ログイン'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* フッター */}
        <div className="text-center text-sm text-gray-600">
          <p>
            このアプリケーションはBitwardenによる認証が必要です。
          </p>
          <p className="mt-1">
            アカウントをお持ちでない場合は、管理者にお問い合わせください。
          </p>
        </div>
      </div>
    </div>
  );
}