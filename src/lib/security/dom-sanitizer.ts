/**
 * DOM操作セキュリティユーティリティ
 * XSS攻撃を防ぐための安全なDOM操作を提供
 */

/**
 * 安全なSVGアイコン作成
 */
export function createSafeIcon(className: string = 'h-5 w-5 text-white'): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5');

  svg.appendChild(path);
  return svg;
}

/**
 * パッケージアイコンを安全に作成
 */
export function createPackageIcon(parent: HTMLElement, className?: string): void {
  if (!parent) {
    throw new Error('Parent element is required');
  }

  // 既存の内容をクリア（安全に）
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }

  // セーフクラス名の設定
  const safeClassName = 'flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600';
  parent.className = safeClassName;

  // アイコンコンテナを作成
  const iconContainer = document.createElement('div');

  // SVGアイコンを安全に作成して追加
  const svgIcon = createSafeIcon(className);
  iconContainer.appendChild(svgIcon);
  parent.appendChild(iconContainer);
}

/**
 * 安全なテキスト設定
 */
export function setSafeText(element: HTMLElement, text: string): void {
  element.textContent = text; // innerHTML ではなく textContent を使用
}

/**
 * 安全な属性設定
 */
export function setSafeAttribute(
  element: HTMLElement,
  attribute: string,
  value: string
): void {
  // 危険な属性をブロック
  const dangerousAttributes = [
    'onclick', 'onload', 'onerror', 'onmouseover',
    'javascript:', 'data:', 'vbscript:'
  ];

  const lowerAttr = attribute.toLowerCase();
  const lowerValue = value.toLowerCase();

  if (dangerousAttributes.some(danger =>
    lowerAttr.includes(danger) || lowerValue.includes(danger)
  )) {
    throw new Error(`Potentially dangerous attribute or value: ${attribute}=${value}`);
  }

  element.setAttribute(attribute, value);
}

/**
 * URLの安全性をチェック
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    // HTTPSまたはHTTPのみ許可
    const allowedProtocols = ['https:', 'http:'];
    if (!allowedProtocols.includes(parsedUrl.protocol)) {
      return false;
    }

    // javascript:, data:, vbscript: などの危険なスキームをブロック
    const dangerousSchemes = ['javascript:', 'data:', 'vbscript:'];
    if (dangerousSchemes.some(scheme => url.toLowerCase().startsWith(scheme))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 安全なリンク作成
 */
export function createSafeLink(href: string, text: string, target?: string): HTMLAnchorElement {
  if (!isValidUrl(href)) {
    throw new Error(`Invalid or potentially dangerous URL: ${href}`);
  }

  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;

  if (target) {
    link.target = target;
    // target="_blank" の場合はセキュリティ対策
    if (target === '_blank') {
      link.rel = 'noopener noreferrer';
    }
  }

  return link;
}

/**
 * XSS攻撃から文字列をサニタイズ
 */
export function sanitizeString(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML; // HTMLエンティティエンコードされた文字列を取得
}

/**
 * CSP（Content Security Policy）ヘルパー
 */
export const CSP_DIRECTIVES = {
  // 基本的なCSPディレクティブ
  DEFAULT_SRC: "'self'",
  SCRIPT_SRC: "'self' 'unsafe-inline'", // Next.jsのため unsafe-inline が必要
  STYLE_SRC: "'self' 'unsafe-inline' https://fonts.googleapis.com",
  IMG_SRC: "'self' data: https: blob:",
  FONT_SRC: "'self' https://fonts.gstatic.com",
  CONNECT_SRC: "'self' ws: wss:",
  FRAME_ANCESTORS: "'none'",
  BASE_URI: "'self'",
  FORM_ACTION: "'self'",
  UPGRADE_INSECURE_REQUESTS: '',
} as const;

/**
 * CSPヘッダー文字列を生成
 */
export function generateCSPHeader(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, value]) => {
      const kebabCase = directive.toLowerCase().replace(/_/g, '-');
      return value ? `${kebabCase} ${value}` : kebabCase;
    })
    .join('; ');
}

export default {
  createSafeIcon,
  createPackageIcon,
  setSafeText,
  setSafeAttribute,
  isValidUrl,
  createSafeLink,
  sanitizeString,
  generateCSPHeader,
  CSP_DIRECTIVES,
};