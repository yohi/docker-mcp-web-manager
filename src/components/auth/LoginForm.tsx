/**
 * ログインフォームコンポーネント
 * 
 * 機能要件：
 * - 認証情報（メール・パスワード）の入力検証
 * - Bitwardenログイン統合
 * - セキュアなフォーム送信
 * - リアルタイム検証とエラー表示
 * - アクセシビリティ対応
 */

'use client';

import { useState, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

/**
 * ログインフォームのバリデーションスキーマ
 */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('有効なメールアドレスを入力してください')
    .max(255, 'メールアドレスが長すぎます'),
  password: z
    .string()
    .min(1, 'パスワードを入力してください')
    .min(8, 'パスワードは8文字以上である必要があります')
    .max(128, 'パスワードが長すぎます'),
  provider: z.enum(['credentials', 'bitwarden']).default('credentials'),
});

type LoginFormData = z.infer<typeof loginSchema>;

/**
 * フォームエラー状態
 */
interface FormErrors {
  email?: string[];
  password?: string[];
  general?: string[];
}

/**
 * ログインフォームコンポーネントのプロパティ
 */
interface LoginFormProps {
  callbackUrl?: string;
  error?: string;
  className?: string;
}

/**
 * ログインフォームコンポーネント
 */
export default function LoginForm({
  callbackUrl = '/',
  error,
  className = '',
}: LoginFormProps) {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    provider: 'credentials',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();

  /**
   * リアルタイムバリデーション
   */
  const validateField = useCallback((field: keyof LoginFormData, value: string) => {
    try {
      loginSchema.shape[field].parse(value);
      setErrors(prev => ({ ...prev, [field]: undefined }));
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setErrors(prev => ({
          ...prev,
          [field]: error.errors.map(e => e.message),
        }));
      }
      return false;
    }
  }, []);

  /**
   * フォーム値の変更ハンドラ
   */
  const handleInputChange = useCallback((
    field: keyof LoginFormData,
    value: string
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // リアルタイム検証（ユーザーが入力を始めた後）
    if (value.length > 0 || errors[field as keyof FormErrors]) {
      validateField(field, value);
    }
  }, [errors, validateField]);

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      // フォーム全体のバリデーション
      const validationResult = loginSchema.safeParse(formData);
      
      if (!validationResult.success) {
        const formErrors: FormErrors = {};
        validationResult.error.errors.forEach(error => {
          const field = error.path[0] as keyof FormErrors;
          if (!formErrors[field]) {
            formErrors[field] = [];
          }
          formErrors[field]!.push(error.message);
        });
        setErrors(formErrors);
        return;
      }

      // NextAuth経由でサインイン
      const result = await signIn(formData.provider, {
        email: formData.email,
        password: formData.password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        // 認証エラーの処理
        let errorMessage = 'ログインに失敗しました';
        
        switch (result.error) {
          case 'CredentialsSignin':
            errorMessage = 'メールアドレスまたはパスワードが間違っています';
            break;
          case 'AccountNotLinked':
            errorMessage = 'このアカウントは別の認証方法でリンクされています';
            break;
          case 'AccessDenied':
            errorMessage = 'アクセスが拒否されました';
            break;
          case 'Verification':
            errorMessage = 'メールアドレスの確認が必要です';
            break;
          default:
            errorMessage = `認証エラー: ${result.error}`;
        }
        
        setErrors({ general: [errorMessage] });
        return;
      }

      if (result?.ok) {
        // ログイン成功
        router.push(result.url || callbackUrl);
        router.refresh(); // セッション情報を更新
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrors({
        general: ['予期しないエラーが発生しました。しばらく経ってから再試行してください。'],
      });
    } finally {
      setIsLoading(false);
    }
  }, [formData, callbackUrl, router]);

  /**
   * パスワード表示切り替え
   */
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  /**
   * プロバイダー変更ハンドラ
   */
  const handleProviderChange = useCallback((provider: 'credentials' | 'bitwarden') => {
    setFormData(prev => ({ ...prev, provider }));
    setErrors({}); // エラーをクリア
  }, []);

  return (
    <div className={`max-w-md mx-auto ${className}`}>
      <div className="bg-white shadow-lg rounded-lg px-8 pt-6 pb-8 mb-4">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
            ログイン
          </h2>
          <p className="text-gray-600 text-center">
            Docker MCP Web Managerにアクセス
          </p>
        </div>

        {/* 全般的なエラー表示 */}
        {(error || errors.general) && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  エラーが発生しました
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error && <p>{error}</p>}
                  {errors.general?.map((err, index) => (
                    <p key={index}>{err}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 認証プロバイダー選択 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            認証方法
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="provider"
                value="credentials"
                checked={formData.provider === 'credentials'}
                onChange={() => handleProviderChange('credentials')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                disabled={isLoading}
              />
              <span className="ml-2 text-sm text-gray-700">
                メール・パスワード
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="provider"
                value="bitwarden"
                checked={formData.provider === 'bitwarden'}
                onChange={() => handleProviderChange('bitwarden')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                disabled={isLoading}
              />
              <span className="ml-2 text-sm text-gray-700">
                Bitwarden
              </span>
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* メールアドレス入力 */}
          <div className="mb-4">
            <label 
              htmlFor="email" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              メールアドレス
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={`appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="user@example.com"
              required
              autoComplete="email"
              disabled={isLoading}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <div id="email-error" className="mt-1">
                {errors.email.map((error, index) => (
                  <p key={index} className="text-red-600 text-sm">
                    {error}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* パスワード入力 */}
          <div className="mb-6">
            <label 
              htmlFor="password" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              パスワード
              <span className="text-red-500 ml-1">*</span>
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className={`appearance-none border rounded w-full py-2 px-3 pr-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.password ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                placeholder="••••••••"
                required
                autoComplete={formData.provider === 'credentials' ? 'current-password' : 'off'}
                disabled={isLoading}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={togglePasswordVisibility}
                disabled={isLoading}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? (
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && (
              <div id="password-error" className="mt-1">
                {errors.password.map((error, index) => (
                  <p key={index} className="text-red-600 text-sm">
                    {error}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 送信ボタン */}
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors w-full flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  ログイン中...
                </>
              ) : (
                <>
                  ログイン
                  {formData.provider === 'bitwarden' && (
                    <svg className="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 9.74s9-4.19 9-9.74V7l-10-5z"/>
                    </svg>
                  )}
                </>
              )}
            </button>
          </div>
        </form>

        {/* 注意事項 */}
        <div className="mt-6 text-xs text-gray-500 text-center">
          <p>
            ログインすることで、
            <a href="/terms" className="text-blue-600 hover:text-blue-800">利用規約</a>
            および
            <a href="/privacy" className="text-blue-600 hover:text-blue-800">プライバシーポリシー</a>
            に同意したものとします。
          </p>
        </div>
      </div>
    </div>
  );
}