declare module 'date-fns' {
  export function formatDistanceToNow(date: Date, options?: any): string;
  export function format(date: Date, formatStr: string, options?: any): string;
  export function parseISO(dateString: string): Date;
  export function isValid(date: Date): boolean;
  export function addDays(date: Date, amount: number): Date;
  export function subDays(date: Date, amount: number): Date;
  export function startOfDay(date: Date): Date;
  export function endOfDay(date: Date): Date;
}

declare module 'date-fns/locale' {
  export const ja: any;
  export const en: any;
}