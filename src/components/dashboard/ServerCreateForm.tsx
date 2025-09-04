/**
 * サーバー作成フォームコンポーネント
 * 
 * 機能要件：
 * - Docker MCPを使用したサーバー作成
 * - 入力検証とエラーハンドリング
 * - 段階的な設定フォーム
 * - プリセット設定の提供
 * - リアルタイム検証
 */

'use client';

import { useState, useCallback } from 'react';
import { z } from 'zod';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * サーバー作成フォームのバリデーションスキーマ
 */
const serverCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'サーバー名を入力してください')
    .max(64, 'サーバー名は64文字以内で入力してください')
    .regex(/^[a-zA-Z0-9_-]+$/, 'サーバー名は英数字、アンダースコア、ハイフンのみ使用できます'),
  image: z
    .string()
    .min(1, 'Dockerイメージを入力してください')
    .max(512, 'Dockerイメージ名が長すぎます'),
  tag: z
    .string()
    .default('latest')
    .max(128, 'タグ名が長すぎます'),
  ports: z
    .array(z.object({
      host: z.number().min(1).max(65535),
      container: z.number().min(1).max(65535),
      protocol: z.enum(['tcp', 'udp']).default('tcp'),
    }))
    .default([]),
  environment: z
    .array(z.object({
      key: z.string().min(1, '環境変数名を入力してください'),
      value: z.string(),
      isSecret: z.boolean().default(false),
    }))
    .default([]),
  volumes: z
    .array(z.object({
      host: z.string().min(1, 'ホストパスを入力してください'),
      container: z.string().min(1, 'コンテナパスを入力してください'),
      mode: z.enum(['ro', 'rw']).default('rw'),
    }))
    .default([]),
  network: z
    .string()
    .optional(),
  restart: z
    .enum(['no', 'always', 'unless-stopped', 'on-failure'])
    .default('unless-stopped'),
  cpuLimit: z
    .number()
    .min(0.1)
    .max(32)
    .optional(),
  memoryLimit: z
    .number()
    .min(128)
    .max(32768)
    .optional(),
  healthCheck: z
    .object({
      test: z.string().min(1, 'ヘルスチェックコマンドを入力してください'),
      interval: z.number().min(1).max(300).default(30),
      timeout: z.number().min(1).max(300).default(10),
      retries: z.number().min(1).max(10).default(3),
    })
    .optional(),
  labels: z
    .array(z.object({
      key: z.string().min(1),
      value: z.string(),
    }))
    .default([]),
  autoStart: z.boolean().default(true),
});

type ServerCreateData = z.infer<typeof serverCreateSchema>;

/**
 * フォームエラー状態
 */
interface FormErrors {
  [key: string]: string[];
}

/**
 * プリセット定義
 */
interface Preset {
  id: string;
  name: string;
  description: string;
  config: Partial<ServerCreateData>;
}

const presets: Preset[] = [
  {
    id: 'nginx',
    name: 'Nginx Webサーバー',
    description: '軽量なWebサーバーとして動作します',
    config: {
      image: 'nginx',
      tag: 'alpine',
      ports: [{ host: 80, container: 80, protocol: 'tcp' }],
      volumes: [{ host: './html', container: '/usr/share/nginx/html', mode: 'ro' }],
      restart: 'unless-stopped',
    },
  },
  {
    id: 'redis',
    name: 'Redis キャッシュサーバー',
    description: 'インメモリデータストアとして動作します',
    config: {
      image: 'redis',
      tag: 'alpine',
      ports: [{ host: 6379, container: 6379, protocol: 'tcp' }],
      volumes: [{ host: './redis-data', container: '/data', mode: 'rw' }],
      restart: 'unless-stopped',
    },
  },
  {
    id: 'postgres',
    name: 'PostgreSQL データベース',
    description: 'リレーショナルデータベースとして動作します',
    config: {
      image: 'postgres',
      tag: 'alpine',
      ports: [{ host: 5432, container: 5432, protocol: 'tcp' }],
      environment: [
        { key: 'POSTGRES_DB', value: 'myapp', isSecret: false },
        { key: 'POSTGRES_USER', value: 'user', isSecret: false },
        { key: 'POSTGRES_PASSWORD', value: 'password', isSecret: true },
      ],
      volumes: [{ host: './postgres-data', container: '/var/lib/postgresql/data', mode: 'rw' }],
      restart: 'unless-stopped',
      memoryLimit: 1024,
    },
  },
  {
    id: 'custom',
    name: 'カスタム設定',
    description: '手動で詳細設定を行います',
    config: {},
  },
];

/**
 * サーバー作成フォームコンポーネントのプロパティ
 */
interface ServerCreateFormProps {
  onSuccess?: (serverId: string) => void;
  onCancel?: () => void;
  className?: string;
}

/**
 * サーバー作成フォームコンポーネント
 */
export default function ServerCreateForm({
  onSuccess,
  onCancel,
  className = '',
}: ServerCreateFormProps) {
  const { hasPermission, hasRole } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [formData, setFormData] = useState<ServerCreateData>({
    name: '',
    image: '',
    tag: 'latest',
    ports: [],
    environment: [],
    volumes: [],
    restart: 'unless-stopped',
    labels: [],
    autoStart: true,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  // 権限チェック
  const canCreateServers = hasPermission('servers:create') || hasRole('admin' as any);

  /**
   * プリセット選択ハンドラ
   */
  const handlePresetSelect = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(presetId);
      setFormData(prev => ({
        ...prev,
        ...preset.config,
      }));
    }
  }, []);

  /**
   * フォーム値更新
   */
  const updateFormData = useCallback((updates: Partial<ServerCreateData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setErrors({}); // エラーをクリア
  }, []);

  /**
   * 配列フィールドの追加
   */
  const addArrayItem = useCallback((field: 'ports' | 'environment' | 'volumes' | 'labels') => {
    const defaultItems = {
      ports: { host: 8080, container: 8080, protocol: 'tcp' as const },
      environment: { key: '', value: '', isSecret: false },
      volumes: { host: '', container: '', mode: 'rw' as const },
      labels: { key: '', value: '' },
    };

    setFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] as any[]), defaultItems[field]],
    }));
  }, []);

  /**
   * 配列フィールドの削除
   */
  const removeArrayItem = useCallback((field: 'ports' | 'environment' | 'volumes' | 'labels', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] as any[]).filter((_, i) => i !== index),
    }));
  }, []);

  /**
   * 配列フィールドの更新
   */
  const updateArrayItem = useCallback((
    field: 'ports' | 'environment' | 'volumes' | 'labels',
    index: number,
    updates: any
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] as any[]).map((item, i) =>
        i === index ? { ...item, ...updates } : item
      ),
    }));
  }, []);

  /**
   * バリデーション
   */
  const validate = useCallback(() => {
    try {
      serverCreateSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formErrors: FormErrors = {};
        error.errors.forEach(err => {
          const field = err.path.join('.');
          if (!formErrors[field]) {
            formErrors[field] = [];
          }
          formErrors[field].push(err.message);
        });
        setErrors(formErrors);
      }
      return false;
    }
  }, [formData]);

  /**
   * フォーム送信
   */
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canCreateServers) {
      setErrors({ general: ['サーバーを作成する権限がありません'] });
      return;
    }

    if (!validate()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'サーバーの作成に失敗しました');
      }

      const result = await response.json();
      onSuccess?.(result.data.id);
    } catch (error) {
      setErrors({
        general: [error instanceof Error ? error.message : '予期しないエラーが発生しました'],
      });
    } finally {
      setIsLoading(false);
    }
  }, [formData, canCreateServers, validate, onSuccess]);

  /**
   * 権限がない場合
   */
  if (!canCreateServers) {
    return (
      <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">アクセス権限がありません</h3>
          <p className="text-sm text-gray-600 mb-4">サーバーを作成する権限がありません。</p>
          {onCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              戻る
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">新しいサーバーの作成</h2>
          <p className="text-sm text-gray-600 mt-1">Docker MCPを使用してコンテナサーバーを作成します</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ステップインジケーター */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          {[
            { number: 1, title: 'プリセット選択' },
            { number: 2, title: '基本設定' },
            { number: 3, title: '詳細設定' },
            { number: 4, title: '確認・作成' },
          ].map((s, index) => (
            <div key={s.number} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step >= s.number
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {step > s.number ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  s.number
                )}
              </div>
              <span className={`ml-2 text-sm font-medium ${step >= s.number ? 'text-gray-900' : 'text-gray-500'}`}>
                {s.title}
              </span>
              {index < 3 && (
                <div className={`w-8 h-px mx-4 ${step > s.number ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* エラー表示 */}
      {errors.general && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">エラーが発生しました</h3>
              <div className="mt-2 text-sm text-red-700">
                {errors.general.map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="p-6">
          {step === 1 && (
            <PresetStep 
              presets={presets}
              selectedPreset={selectedPreset}
              onPresetSelect={handlePresetSelect}
              onNext={() => setStep(2)}
            />
          )}
          
          {step === 2 && (
            <BasicStep 
              formData={formData}
              errors={errors}
              onUpdate={updateFormData}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          
          {step === 3 && (
            <AdvancedStep 
              formData={formData}
              errors={errors}
              onUpdate={updateFormData}
              addArrayItem={addArrayItem}
              removeArrayItem={removeArrayItem}
              updateArrayItem={updateArrayItem}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          
          {step === 4 && (
            <ReviewStep 
              formData={formData}
              isLoading={isLoading}
              onBack={() => setStep(3)}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </form>
    </div>
  );
}

// Step components will be implemented in separate files
function PresetStep({ presets, selectedPreset, onPresetSelect, onNext }: any) {
  return (
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">プリセットを選択</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((preset: Preset) => (
          <div
            key={preset.id}
            className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
              selectedPreset === preset.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => onPresetSelect(preset.id)}
          >
            <h4 className="font-medium text-gray-900 mb-2">{preset.name}</h4>
            <p className="text-sm text-gray-600">{preset.description}</p>
          </div>
        ))}
      </div>
      
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!selectedPreset}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          次へ
          <svg className="ml-2 -mr-1 w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BasicStep({ formData, errors, onUpdate, onNext, onBack }: any) {
  return <div>基本設定ステップ（実装予定）</div>;
}

function AdvancedStep({ formData, errors, onUpdate, addArrayItem, removeArrayItem, updateArrayItem, onNext, onBack }: any) {
  return <div>詳細設定ステップ（実装予定）</div>;
}

function ReviewStep({ formData, isLoading, onBack, onSubmit }: any) {
  return <div>確認ステップ（実装予定）</div>;
}