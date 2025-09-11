import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// 対応言語の定義
export const locales = ['ja', 'en'] as const;
export type Locale = (typeof locales)[number];

// デフォルト言語
export const defaultLocale: Locale = 'ja';

export default getRequestConfig(async ({ locale }) => {
  // リクエストされたlocaleが対応言語に含まれているかチェック
  if (!locales.includes(locale as Locale)) notFound();

  return {
    messages: (await import(`../messages/${locale}.json`)).default
  };
});