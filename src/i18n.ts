// 国際化機能は一時的に無効化
// 本来の実装は next-intl を使用

export const locales = ['ja', 'en'] as const;
export const defaultLocale = 'ja' as const;

export type Locale = (typeof locales)[number];