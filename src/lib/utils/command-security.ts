import { spawn, ChildProcess } from 'child_process';
import { AbortController } from 'abort-controller';
import { z } from 'zod';

// =============================================================================
// Command Security Utilities
// シェルインジェクション防止と安全なコマンド実行
// =============================================================================

/**
 * 許可されたdocker mcpサブコマンドの定義
 */
const ALLOWED_DOCKER_MCP_COMMANDS = [
  'list',
  'details',
  'start',
  'stop',
  'enable',
  'disable',
  'logs',
  'install',
  'uninstall',
  'status',
  'gateway',
] as const;

export type DockerMcpCommand = typeof ALLOWED_DOCKER_MCP_COMMANDS[number];

/**
 * 許可されたBitwarden CLIサブコマンドの定義
 */
const ALLOWED_BITWARDEN_COMMANDS = [
  '--version',
  'status',
  'login',
  'unlock',
  'lock',
  'logout',
  'sync',
  'list',
  'get',
  'config',
] as const;

export type BitwardenCommand = typeof ALLOWED_BITWARDEN_COMMANDS[number];

/**
 * コマンド実行結果の型定義
 */
export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  cancelled: boolean;
}

/**
 * コマンド実行エラーの型定義
 */
export interface CommandError {
  code: string;
  message: string;
  exitCode?: number;
  stderr?: string;
  context: {
    command: string;
    args: string[];
    timeout: number;
    timestamp: string;
  };
}

/**
 * 安全なコマンド実行オプション
 */
export interface SafeExecuteOptions {
  timeout?: number; // デフォルト: 30秒
  maxRetries?: number; // デフォルト: 0（リトライなし）
  retryDelay?: number; // デフォルト: 1000ms
  abortSignal?: AbortSignal;
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * コマンド引数の検証
 * シェルインジェクション攻撃を防ぐための厳格な検証
 */
export function validateCommandArguments(
  command: string,
  args: string[]
): { valid: boolean; error?: string } {
  // docker mcp コマンドの検証
  if (command === 'docker') {
    if (args.length < 2 || args[0] !== 'mcp') {
      return { valid: false, error: 'Only docker mcp subcommands are allowed' };
    }

    const subcommand = args[1];
    if (!ALLOWED_DOCKER_MCP_COMMANDS.includes(subcommand as DockerMcpCommand)) {
      return {
        valid: false,
        error: `Docker MCP subcommand '${subcommand}' is not in the allowlist`,
      };
    }
  }
  // Bitwarden CLI コマンドの検証
  else if (command === 'bw') {
    if (args.length === 0) {
      return { valid: false, error: 'Bitwarden CLI requires arguments' };
    }

    const subcommand = args[0];
    if (!ALLOWED_BITWARDEN_COMMANDS.includes(subcommand as BitwardenCommand)) {
      return {
        valid: false,
        error: `Bitwarden CLI subcommand '${subcommand}' is not in the allowlist`,
      };
    }
  }
  // その他のコマンドは拒否
  else {
    return { valid: false, error: `Command '${command}' is not allowed. Only docker and bw commands are permitted.` };
  }

  // 危険な文字の検証
  const dangerousPatterns = [
    /[;&|`$()]/,     // Shell operators and command substitution
    /\.\./,          // Directory traversal
    /^\s*$/,         // Empty or whitespace-only
    /[\x00-\x1F]/,   // Control characters
    /[\x7F-\xFF]/,   // Non-ASCII characters
  ];

  for (const arg of args) {
    for (const pattern of dangerousPatterns) {
      if (pattern.test(arg)) {
        return {
          valid: false,
          error: `Argument contains dangerous pattern: ${arg}`,
        };
      }
    }

    // 引数の長さ制限
    if (arg.length > 255) {
      return {
        valid: false,
        error: `Argument too long (max 255 characters): ${arg}`,
      };
    }
  }

  // 引数の数制限（Bitwardenコマンドの方が多くの引数を使う場合がある）
  const maxArgs = command === 'bw' ? 30 : 20;
  if (args.length > maxArgs) {
    return {
      valid: false,
      error: `Too many arguments (max ${maxArgs})`,
    };
  }

  return { valid: true };
}

/**
 * JSON応答の安全な検証とパース
 */
export function safeParseJsonResponse<T>(
  jsonString: string,
  schema: z.ZodSchema<T>
): { success: boolean; data?: T; error?: string } {
  try {
    // 空文字列や null のチェック
    if (!jsonString || jsonString.trim() === '') {
      return { success: false, error: 'Empty JSON response' };
    }

    // JSON形式の基本検証
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch (jsonError) {
      return {
        success: false,
        error: `Invalid JSON format: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}`,
      };
    }

    // Zodスキーマによる詳細検証
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return {
        success: false,
        error: `Schema validation failed: ${result.error.message}`,
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: `JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 指数バックオフによるリトライ戦略
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        break; // 最後の試行なのでリトライしない
      }

      // 指数バックオフでの待機
      const delay = baseDelay * Math.pow(2, attempt);
      const jitteredDelay = delay + Math.random() * delay * 0.1;
      
      console.warn(`Command failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(jitteredDelay)}ms:`, lastError.message);
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }

  throw lastError;
}

/**
 * 安全なコマンド実行
 * 全てのセキュリティ要件を満たした実行環境を提供
 */
export async function safeExecuteCommand(
  command: string,
  args: string[],
  options: SafeExecuteOptions = {}
): Promise<CommandResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  const {
    timeout = 30000, // 30秒デフォルト
    maxRetries = 0,
    retryDelay = 1000,
    abortSignal,
    env = {},
    cwd = process.cwd(),
  } = options;

  // パスワードなど機密情報をマスクする関数
  const sanitizeArgs = (args: string[]): string[] => {
    if (command === 'bw' && args[0] === 'login' && args.length > 2) {
      // bw login email password の場合、パスワードをマスク
      return [args[0], args[1], '***MASKED***', ...args.slice(3)];
    }
    return args;
  };

  // コマンド引数の検証
  const validation = validateCommandArguments(command, args);
  if (!validation.valid) {
    throw new Error(`Command validation failed: ${validation.error}`);
  }

  const operation = async (): Promise<CommandResult> => {
    return new Promise((resolve, reject) => {
      let childProcess: ChildProcess | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      let aborted = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGTERM');
          // SIGKILL as fallback after 5 seconds
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      };

      try {
        // AbortController/AbortSignalによるキャンセレーション対応
        if (abortSignal?.aborted) {
          const error: CommandError = {
            code: 'COMMAND_ABORTED',
            message: 'Command was aborted before execution',
            context: { command, args: sanitizeArgs(args), timeout, timestamp },
          };
          return reject(error);
        }

        const abortHandler = () => {
          aborted = true;
          cleanup();
          const error: CommandError = {
            code: 'COMMAND_ABORTED',
            message: 'Command was aborted',
            context: { command, args: sanitizeArgs(args), timeout, timestamp },
          };
          reject(error);
        };

        abortSignal?.addEventListener('abort', abortHandler, { once: true });

        // セキュリティ強化: shellを明示的に無効化
        childProcess = spawn(command, args, {
          shell: false, // シェルインジェクション防止のため必須
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...env },
          cwd,
          detached: false,
        });

        let stdout = '';
        let stderr = '';

        childProcess.stdout?.setEncoding('utf8');
        childProcess.stderr?.setEncoding('utf8');

        childProcess.stdout?.on('data', (data: string) => {
          stdout += data;
        });

        childProcess.stderr?.on('data', (data: string) => {
          stderr += data;
        });

        // タイムアウト設定
        timeoutId = setTimeout(() => {
          if (!aborted) {
            aborted = true;
            cleanup();
            const error: CommandError = {
              code: 'COMMAND_TIMEOUT',
              message: `Command timed out after ${timeout}ms`,
              context: { command, args: sanitizeArgs(args), timeout, timestamp },
            };
            reject(error);
          }
        }, timeout);

        childProcess.on('close', (exitCode: number | null) => {
          const duration = Date.now() - startTime;
          
          // Cleanup and remove abort listener
          cleanup();
          abortSignal?.removeEventListener('abort', abortHandler);

          if (aborted) {
            return; // Already handled by timeout or abort
          }

          const result: CommandResult = {
            success: exitCode === 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode ?? -1,
            duration,
            cancelled: false,
          };

          resolve(result);
        });

        childProcess.on('error', (error: Error) => {
          cleanup();
          abortSignal?.removeEventListener('abort', abortHandler);
          
          const commandError: CommandError = {
            code: 'COMMAND_EXECUTION_ERROR',
            message: `Failed to execute command: ${error.message}`,
            context: { command, args: sanitizeArgs(args), timeout, timestamp },
          };
          reject(commandError);
        });

      } catch (error) {
        cleanup();
        const commandError: CommandError = {
          code: 'COMMAND_SETUP_ERROR',
          message: `Failed to setup command execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
          context: { command, args, timeout, timestamp },
        };
        reject(commandError);
      }
    });
  };

  try {
    if (maxRetries > 0) {
      return await executeWithRetry(operation, maxRetries, retryDelay);
    } else {
      return await operation();
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error; // CommandError as-is
    }
    
    // 予期しないエラーをCommandError形式にラップ
    const commandError: CommandError = {
      code: 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      context: { command, args, timeout, timestamp },
    };
    throw commandError;
  }
}

/**
 * Docker MCPコマンドの実行
 * docker mcp専用の最適化されたラッパー
 */
export async function executeDockerMcpCommand(
  subcommand: DockerMcpCommand,
  subArgs: string[] = [],
  options: SafeExecuteOptions = {}
): Promise<CommandResult> {
  const args = ['mcp', subcommand, ...subArgs];
  return safeExecuteCommand('docker', args, options);
}

/**
 * 長時間実行コマンド用の設定
 */
export const LONG_RUNNING_OPTIONS: SafeExecuteOptions = {
  timeout: 300000, // 5分
  maxRetries: 2,
  retryDelay: 2000,
};

/**
 * 短時間実行コマンド用の設定
 */
export const QUICK_OPTIONS: SafeExecuteOptions = {
  timeout: 30000, // 30秒
  maxRetries: 1,
  retryDelay: 1000,
};