import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * セキュアなプロセス実行ユーティリティ
 * - シェルを無効化してコマンドインジェクションを防止
 * - タイムアウトとキャンセレーション対応
 * - 構造化エラーハンドリング
 */

export interface ProcessExecutionOptions {
  timeout?: number; // ミリ秒
  maxRetries?: number;
  retryDelay?: number; // ミリ秒
  killSignal?: NodeJS.Signals;
  cwd?: string;
  env?: Record<string, string>;
  maxBufferSize?: number; // バイト
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: NodeJS.Signals;
  executionTime: number;
  retryCount: number;
}

export interface ProcessError {
  code: string;
  message: string;
  exitCode?: number;
  signal?: NodeJS.Signals;
  stderr: string;
  executionTime: number;
  retryCount: number;
}

export class ProcessExecutor extends EventEmitter {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30秒
  private static readonly LONG_TIMEOUT = 300000; // 5分
  private static readonly MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly DEFAULT_RETRY_DELAY = 1000; // 1秒

  /**
   * セキュアなプロセス実行
   */
  static async execute(
    command: string,
    args: string[] = [],
    options: ProcessExecutionOptions = {},
  ): Promise<ProcessResult> {
    const executor = new ProcessExecutor();
    return executor.run(command, args, options);
  }

  /**
   * 長時間実行プロセス用（インストール等）
   */
  static async executeLongRunning(
    command: string,
    args: string[] = [],
    options: ProcessExecutionOptions = {},
  ): Promise<ProcessResult> {
    const defaultOptions = {
      timeout: ProcessExecutor.LONG_TIMEOUT,
      maxRetries: 2,
      retryDelay: 2000,
      ...options,
    };
    return ProcessExecutor.execute(command, args, defaultOptions);
  }

  /**
   * AbortController付きプロセス実行
   */
  static async executeWithAbort(
    command: string,
    args: string[] = [],
    abortController: AbortController,
    options: ProcessExecutionOptions = {},
  ): Promise<ProcessResult> {
    const executor = new ProcessExecutor();
    return executor.runWithAbort(command, args, abortController, options);
  }

  private async run(
    command: string,
    args: string[] = [],
    options: ProcessExecutionOptions = {},
  ): Promise<ProcessResult> {
    const {
      timeout = ProcessExecutor.DEFAULT_TIMEOUT,
      maxRetries = 3,
      retryDelay = ProcessExecutor.DEFAULT_RETRY_DELAY,
      killSignal = 'SIGTERM',
      cwd = process.cwd(),
      env = process.env as Record<string, string>,
      maxBufferSize = ProcessExecutor.MAX_BUFFER_SIZE,
    } = options;

    let lastError: ProcessError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeSingle(
          command,
          args,
          {
            timeout,
            killSignal,
            cwd,
            env,
            maxBufferSize,
          },
          attempt,
        );
        return result;
      } catch (error) {
        lastError = error as ProcessError;
        
        this.emit('retry', {
          attempt,
          maxRetries,
          error: lastError,
          nextRetryDelay: retryDelay * (attempt + 1), // 指数バックオフ
        });

        // 最後の試行でない場合は待機
        if (attempt < maxRetries) {
          await this.sleep(retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  private async runWithAbort(
    command: string,
    args: string[] = [],
    abortController: AbortController,
    options: ProcessExecutionOptions = {},
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      // AbortControllerのハンドリング
      if (abortController.signal.aborted) {
        reject(new Error('Process execution was aborted before starting'));
        return;
      }

      const executionPromise = this.run(command, args, options);

      const abortHandler = () => {
        reject(new Error('Process execution was aborted'));
      };

      abortController.signal.addEventListener('abort', abortHandler);

      executionPromise
        .then(resolve)
        .catch(reject)
        .finally(() => {
          abortController.signal.removeEventListener('abort', abortHandler);
        });
    });
  }

  private executeSingle(
    command: string,
    args: string[] = [],
    options: {
      timeout: number;
      killSignal: NodeJS.Signals;
      cwd: string;
      env: Record<string, string>;
      maxBufferSize: number;
    },
    retryCount: number,
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      // セキュリティ: shellオプションを明示的にfalseに設定
      const childProcess = spawn(command, args, {
        shell: false, // 重要: シェルを無効化
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timeoutId: NodeJS.Timeout | null = null;

      // タイムアウトハンドリング
      if (options.timeout > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          this.killProcess(childProcess, options.killSignal);
        }, options.timeout);
      }

      // 標準出力の処理
      childProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // バッファサイズ制限
        if (stdout.length > options.maxBufferSize) {
          this.killProcess(childProcess, options.killSignal);
          reject(this.createError(
            'BUFFER_OVERFLOW',
            'Output buffer size exceeded',
            undefined,
            stderr,
            Date.now() - startTime,
            retryCount,
          ));
        }

        this.emit('stdout', chunk);
      });

      // 標準エラーの処理
      childProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // バッファサイズ制限
        if (stderr.length > options.maxBufferSize) {
          this.killProcess(childProcess, options.killSignal);
          reject(this.createError(
            'BUFFER_OVERFLOW',
            'Error buffer size exceeded',
            undefined,
            stderr,
            Date.now() - startTime,
            retryCount,
          ));
        }

        this.emit('stderr', chunk);
      });

      // プロセス終了の処理
      childProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const executionTime = Date.now() - startTime;

        if (timedOut) {
          reject(this.createError(
            'TIMEOUT',
            `Process timed out after ${options.timeout}ms`,
            exitCode,
            stderr,
            executionTime,
            retryCount,
            signal,
          ));
          return;
        }

        if (exitCode === 0) {
          resolve({
            stdout,
            stderr,
            exitCode: exitCode ?? 0,
            signal: signal ?? undefined,
            executionTime,
            retryCount,
          });
        } else {
          reject(this.createError(
            'PROCESS_ERROR',
            `Process exited with code ${exitCode}`,
            exitCode,
            stderr,
            executionTime,
            retryCount,
            signal,
          ));
        }
      });

      // プロセス起動エラーの処理
      childProcess.on('error', (error: Error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        reject(this.createError(
          'SPAWN_ERROR',
          `Failed to start process: ${error.message}`,
          undefined,
          stderr,
          Date.now() - startTime,
          retryCount,
        ));
      });
    });
  }

  private killProcess(childProcess: ChildProcess, signal: NodeJS.Signals): void {
    try {
      if (!childProcess.killed) {
        childProcess.kill(signal);
        
        // SIGTERM後にSIGKILLでフォローアップ
        if (signal === 'SIGTERM') {
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      }
    } catch (error) {
      this.emit('killError', error);
    }
  }

  private createError(
    code: string,
    message: string,
    exitCode?: number | null,
    stderr = '',
    executionTime = 0,
    retryCount = 0,
    signal?: NodeJS.Signals | null,
  ): ProcessError {
    return {
      code,
      message,
      exitCode: exitCode ?? undefined,
      signal: signal ?? undefined,
      stderr,
      executionTime,
      retryCount,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}