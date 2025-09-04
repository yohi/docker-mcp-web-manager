import { z } from 'zod';
import { allowedDockerMCPCommandsSchema, dockerMCPCommandArgsSchema } from '../schemas/docker-mcp-schemas';

/**
 * コマンドインジェクション攻撃を防ぐためのセキュリティユーティリティ
 */

// 危険な文字パターンの定義
const DANGEROUS_PATTERNS = [
  /[;&|`$(){}[\]<>'"\\]/g, // シェル特殊文字
  /\.\./g, // ディレクトリトラバーサル
  /\0/g, // ヌル文字
  /[\r\n]/g, // 改行文字
  /\s{2,}/g, // 複数のスペース
];

// 危険なコマンド文字列の定義
const DANGEROUS_COMMANDS = [
  'rm', 'del', 'delete', 'format',
  'shutdown', 'reboot', 'halt',
  'chmod', 'chown', 'sudo', 'su',
  'curl', 'wget', 'nc', 'netcat',
  'cat', 'more', 'less', 'head', 'tail',
  'grep', 'find', 'locate',
  'ps', 'kill', 'killall', 'pkill',
  'mount', 'umount', 'fdisk',
  'iptables', 'ufw', 'firewall',
];

/**
 * 文字列が安全かどうかを検証する
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  let sanitized = input.trim();

  // 危険なパターンをチェック
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sanitized)) {
      throw new Error(`Dangerous pattern detected in input: ${sanitized}`);
    }
  }

  // 最大長制限
  if (sanitized.length > 1000) {
    throw new Error('Input string is too long (max 1000 characters)');
  }

  return sanitized;
}

/**
 * Docker MCPコマンドが許可されているかどうかを検証する
 */
export function validateDockerMCPCommand(command: string): boolean {
  try {
    allowedDockerMCPCommandsSchema.parse(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * コマンド引数を検証・サニタイズする
 */
export function validateAndSanitizeArgs(args: unknown): z.infer<typeof dockerMCPCommandArgsSchema> {
  // Zodスキーマによる検証
  const validatedArgs = dockerMCPCommandArgsSchema.parse(args);

  // 文字列引数のサニタイズ
  if (validatedArgs.serverId) {
    validatedArgs.serverId = sanitizeString(validatedArgs.serverId);
  }

  if (validatedArgs.toolName) {
    validatedArgs.toolName = sanitizeString(validatedArgs.toolName);
  }

  if (validatedArgs.search) {
    validatedArgs.search = sanitizeString(validatedArgs.search);
  }

  if (validatedArgs.category) {
    validatedArgs.category = sanitizeString(validatedArgs.category);
  }

  // JSON オブジェクトのサニタイズ
  if (validatedArgs.input) {
    validatedArgs.input = sanitizeJsonObject(validatedArgs.input);
  }

  return validatedArgs;
}

/**
 * JSONオブジェクトを再帰的にサニタイズする
 */
function sanitizeJsonObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeJsonObject);
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeJsonObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * コマンド配列を構築する（シェルインジェクション防止）
 */
export function buildSecureCommandArray(
  baseCommand: string,
  subCommand: string,
  args: string[] = [],
): string[] {
  // ベースコマンドの検証
  if (baseCommand !== 'docker' && baseCommand !== 'docker-compose') {
    throw new Error(`Unsupported base command: ${baseCommand}`);
  }

  // サブコマンドの検証
  if (!validateDockerMCPCommand(subCommand)) {
    throw new Error(`Invalid Docker MCP command: ${subCommand}`);
  }

  // 引数の検証とサニタイズ
  const sanitizedArgs = args.map(arg => {
    if (typeof arg !== 'string') {
      throw new Error('All arguments must be strings');
    }
    return sanitizeString(arg);
  });

  // 危険なコマンドのチェック
  const allParts = [baseCommand, subCommand, ...sanitizedArgs];
  for (const part of allParts) {
    for (const dangerousCmd of DANGEROUS_COMMANDS) {
      if (part.toLowerCase().includes(dangerousCmd)) {
        throw new Error(`Dangerous command detected: ${dangerousCmd}`);
      }
    }
  }

  return [baseCommand, 'mcp', subCommand, ...sanitizedArgs];
}

/**
 * ファイルパスの検証（パストラバーサル攻撃防止）
 */
export function validateFilePath(filePath: string): string {
  const sanitized = sanitizeString(filePath);

  // パストラバーサルのチェック
  if (sanitized.includes('..') || sanitized.includes('./') || sanitized.includes('.\\')) {
    throw new Error('Path traversal detected in file path');
  }

  // 絶対パスのチェック
  if (sanitized.startsWith('/') || sanitized.match(/^[A-Za-z]:/)) {
    throw new Error('Absolute paths are not allowed');
  }

  // 許可された拡張子のチェック（ログファイル用）
  const allowedExtensions = ['.log', '.txt'];
  const hasValidExtension = allowedExtensions.some(ext => 
    sanitized.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    throw new Error('Invalid file extension. Only .log and .txt files are allowed');
  }

  return sanitized;
}

/**
 * 環境変数名の検証
 */
export function validateEnvironmentVariableName(name: string): string {
  const sanitized = sanitizeString(name);

  // 環境変数名のパターンチェック（英数字とアンダースコアのみ）
  if (!/^[A-Z][A-Z0-9_]*$/.test(sanitized)) {
    throw new Error('Invalid environment variable name format');
  }

  // 長さ制限
  if (sanitized.length > 100) {
    throw new Error('Environment variable name is too long');
  }

  return sanitized;
}