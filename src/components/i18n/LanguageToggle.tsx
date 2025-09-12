'use client';

// 国際化機能は一時的に無効化
import React from 'react';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  variant?: 'button' | 'dropdown' | 'compact';
  showLabel?: boolean;
  className?: string;
}

export function LanguageToggle({ 
  variant = 'dropdown',
  showLabel = false,
  className 
}: LanguageToggleProps) {
  // 現在は日本語固定
  const currentLanguage = { code: 'ja', name: '日本語', flag: '🇯🇵' };

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('flex items-center gap-2', className)}
      disabled
    >
      <Globe className="h-4 w-4" />
      {showLabel && (
        <>
          <span className="text-sm">{currentLanguage.flag}</span>
          <span>{currentLanguage.name}</span>
        </>
      )}
      {!showLabel && <span className="sr-only">言語設定（無効）</span>}
    </Button>
  );
}