'use client';

import { clsx } from 'clsx';

// =============================================================================
// ローディングスピナーコンポーネント
// 統一されたローディング表示
// =============================================================================

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'gray' | 'white' | 'green' | 'red' | 'yellow';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

const colorClasses = {
  blue: 'border-blue-600',
  gray: 'border-gray-600',
  white: 'border-white',
  green: 'border-green-600',
  red: 'border-red-600',
  yellow: 'border-yellow-600',
};

export default function LoadingSpinner({
  size = 'md',
  color = 'blue',
  className,
  text,
}: LoadingSpinnerProps) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div className="flex flex-col items-center space-y-2">
        <div
          className={clsx(
            'animate-spin rounded-full border-2 border-gray-200',
            sizeClasses[size],
            colorClasses[color]
          )}
          style={{
            borderTopColor: 'transparent',
          }}
        />
        {text && (
          <p className="text-sm text-gray-600 animate-pulse">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}

// フルページローディング
export function FullPageLoading({ text = '読み込み中...' }: { text?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <LoadingSpinner size="xl" text={text} />
    </div>
  );
}

// カードローディング
export function CardLoading({ text }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

// ボタン内ローディング
export function ButtonLoading({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <LoadingSpinner 
      size={size} 
      color="white" 
      className="mr-2" 
    />
  );
}