/**
 * @file subprocess-runner.mts
 * @description ChatRuntime 主进程有界子进程 runner。
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { AIToolExecutionError } from 'types/ai';

/** 本 runner 使用的子进程类型。 */
type RuntimeChildProcess = ChildProcessByStdio<null, Readable, Readable>;

/** stdout 流式处理决策。 */
export type RuntimeSubprocessStdoutDecision = 'continue' | 'terminate';

/** stdout 流式处理回调。 */
export type RuntimeSubprocessStdoutHandler = (chunk: Buffer) => RuntimeSubprocessStdoutDecision | void;

/** 有界子进程执行输入。 */
export interface RuntimeSubprocessInput {
  /** 可执行命令。 */
  command: string;
  /** 命令参数。 */
  args: string[];
  /** 工作目录。 */
  cwd?: string;
  /** 超时时间。 */
  timeoutMs: number;
  /** stdout 最大字节数。 */
  stdoutLimitBytes: number;
  /** stderr 最大字节数。 */
  stderrLimitBytes: number;
  /** 是否缓存 stdout 文本。 */
  bufferStdout?: boolean;
  /** stdout 流式处理回调。 */
  onStdoutChunk?: RuntimeSubprocessStdoutHandler;
  /** 外部取消信号。 */
  signal?: AbortSignal;
}

/** 有界子进程执行结果。 */
export interface RuntimeSubprocessResult {
  /** 退出码。 */
  exitCode: number | null;
  /** 退出信号。 */
  signal: NodeJS.Signals | null;
  /** stdout 文本。 */
  stdout: string;
  /** stderr 文本。 */
  stderr: string;
  /** 是否超时。 */
  timedOut: boolean;
  /** 是否由 stdout 消费者主动终止。 */
  terminatedByConsumer: boolean;
  /** 执行耗时。 */
  elapsedMs: number;
}

/** 文件搜索子进程错误。 */
export class RuntimeSubprocessError extends Error {
  /** 工具错误码。 */
  readonly code: AIToolExecutionError['code'];

  /**
   * 创建子进程错误。
   * @param code - 工具错误码
   * @param message - 错误消息
   */
  constructor(code: AIToolExecutionError['code'], message: string) {
    super(message);
    this.name = 'RuntimeSubprocessError';
    this.code = code;
  }
}

/**
 * 安全 kill 子进程或进程组。
 * @param child - 子进程
 */
function killRuntimeChildProcess(child: RuntimeChildProcess | null, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!child || child.killed || child.pid === undefined) return;

  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      child.kill(signal);
      return;
    }
  }

  child.kill(signal);
}

/**
 * 拼接缓冲区为 UTF-8 文本。
 * @param chunks - Buffer 列表
 * @returns UTF-8 文本
 */
function concatRuntimeBufferText(chunks: Buffer[]): string {
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * 执行有界子进程。
 * @param input - 子进程执行输入
 * @returns 子进程执行结果
 */
export function runBoundedSubprocess(input: RuntimeSubprocessInput): Promise<RuntimeSubprocessResult> {
  return new Promise<RuntimeSubprocessResult>((resolve, reject) => {
    const startedAt = Date.now();
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let terminatedByConsumer = false;
    let child: RuntimeChildProcess | null = null;
    let timeout: ReturnType<typeof setTimeout>;
    let forceKillTimeout: ReturnType<typeof setTimeout> | null = null;
    let abortListener: (() => void) | null = null;
    let pendingFailure: RuntimeSubprocessError | null = null;

    /**
     * 清理定时器和取消监听。
     */
    function cleanup(): void {
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
      if (abortListener) {
        input.signal?.removeEventListener('abort', abortListener);
      }
    }

    /**
     * 结束当前 Promise。
     * @param callback - 结束回调
     */
    function settleOnce(callback: () => void): void {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    }

    /**
     * 请求终止子进程，并等待 close 事件完成清理。
     * @param error - 终止后需要返回的错误
     */
    function requestTermination(error: RuntimeSubprocessError | null): void {
      if (error && !pendingFailure) {
        pendingFailure = error;
      }

      killRuntimeChildProcess(child);
      if (!forceKillTimeout) {
        forceKillTimeout = setTimeout(() => {
          killRuntimeChildProcess(child, 'SIGKILL');
        }, 1_000);
      }
    }

    abortListener = (): void => {
      requestTermination(new RuntimeSubprocessError('USER_CANCELLED', '工具调用已取消'));
    };

    timeout = setTimeout(() => {
      timedOut = true;
      requestTermination(new RuntimeSubprocessError('TOOL_TIMEOUT', 'grep 执行超时'));
    }, input.timeoutMs);

    try {
      child = spawn(input.command, input.args, {
        ...(input.cwd ? { cwd: input.cwd } : {}),
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : '启动子进程失败';
      reject(new RuntimeSubprocessError('EXECUTION_FAILED', message));
      return;
    }

    if (input.signal?.aborted) {
      abortListener();
      return;
    }

    input.signal?.addEventListener('abort', abortListener, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      if (pendingFailure) return;
      stdoutBytes += chunk.byteLength;
      let shouldTerminate = false;
      try {
        shouldTerminate = input.onStdoutChunk?.(chunk) === 'terminate';
      } catch (error) {
        const message = error instanceof Error ? error.message : '处理 stdout 失败';
        requestTermination(new RuntimeSubprocessError('EXECUTION_FAILED', message));
        return;
      }

      if (stdoutBytes > input.stdoutLimitBytes && !shouldTerminate) {
        requestTermination(new RuntimeSubprocessError('EXECUTION_FAILED', 'stdout 超过工具输出上限'));
        return;
      }
      if (input.bufferStdout !== false) {
        stdoutChunks.push(chunk);
      }
      if (shouldTerminate) {
        terminatedByConsumer = true;
        requestTermination(null);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (pendingFailure) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > input.stderrLimitBytes) {
        requestTermination(new RuntimeSubprocessError('EXECUTION_FAILED', 'stderr 超过工具输出上限'));
        return;
      }
      stderrChunks.push(chunk);
    });

    child.on('error', (error: Error) => {
      settleOnce(() => reject(new RuntimeSubprocessError('EXECUTION_FAILED', error.message)));
    });

    child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (pendingFailure) {
        settleOnce(() => reject(pendingFailure));
        return;
      }

      settleOnce(() =>
        resolve({
          exitCode,
          signal,
          stdout: concatRuntimeBufferText(stdoutChunks),
          stderr: concatRuntimeBufferText(stderrChunks),
          timedOut,
          terminatedByConsumer,
          elapsedMs: Date.now() - startedAt
        })
      );
    });
  });
}
