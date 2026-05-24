/**
 * @file runner.mts
 * @description Shell 命令子进程 runner，负责进程生命周期、实时输出、超时和取消。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ShellCommandOutputChunk, ShellCommandRunRequest, ShellCommandRunResult } from './types.mjs';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { Effect } from 'effect';

/** 默认最终输出截断字符数。 */
const DEFAULT_MAX_OUTPUT_CHARS = 20_000;

/** Shell 命令输出接收函数。 */
export type ShellCommandOutputSink = (chunk: ShellCommandOutputChunk) => void;

/** Shell 命令 spawn 函数。 */
export type ShellCommandSpawn = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

/**
 * Shell 命令 runner 创建选项。
 */
export interface CreateShellCommandRunnerOptions {
  /** 子进程创建函数，测试时可注入。 */
  spawnProcess?: ShellCommandSpawn;
}

/**
 * Shell 命令 runner。
 */
export interface ShellCommandRunner {
  /**
   * 运行命令。
   * @param request - 命令执行请求
   * @param sink - 实时输出接收函数
   * @returns 命令执行结果
   */
  run: (request: ShellCommandRunRequest, sink?: ShellCommandOutputSink) => Promise<ShellCommandRunResult>;
  /**
   * 按命令 ID 取消运行中的命令。
   * @param commandId - 命令 ID
   * @returns 是否找到并取消
   */
  cancel: (commandId: string) => boolean;
}

/**
 * 活跃命令记录。
 */
interface ActiveCommand {
  /** 子进程对象。 */
  child: ChildProcessWithoutNullStreams;
  /** 是否已经触发超时。 */
  timedOut: boolean;
}

/**
 * 将 shell 请求转换为可执行命令和参数。
 * @param request - 命令执行请求
 * @returns spawn 参数
 */
function resolveSpawnCommand(request: ShellCommandRunRequest): { command: string; args: string[] } {
  if (request.shell === 'powershell') {
    const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    return {
      command: executable,
      args: ['-NoProfile', '-NonInteractive', '-Command', request.command]
    };
  }

  return {
    command: 'bash',
    args: ['-lc', request.command]
  };
}

/**
 * 判断目标目录是否位于工作区内。
 * @param cwd - 执行目录
 * @param workspaceRoot - 工作区根目录
 * @returns 是否位于工作区内
 */
function isCwdInsideWorkspace(cwd: string, workspaceRoot: string): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedWorkspace = path.resolve(workspaceRoot);
  const relativePath = path.relative(resolvedWorkspace, resolvedCwd);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

/**
 * 追加输出并按最大长度截断。
 * @param current - 当前输出
 * @param next - 新输出
 * @param maxChars - 最大字符数
 * @returns 新输出和是否截断
 */
function appendBoundedOutput(current: string, next: string, maxChars: number): { value: string; truncated: boolean } {
  const merged = `${current}${next}`;
  if (merged.length <= maxChars) {
    return { value: merged, truncated: false };
  }

  return { value: merged.slice(merged.length - maxChars), truncated: true };
}

/**
 * 创建 Shell 命令 runner。
 * @param options - runner 创建选项
 * @returns Shell 命令 runner
 */
export function createShellCommandRunner(options: CreateShellCommandRunnerOptions = {}): ShellCommandRunner {
  const spawnProcess = options.spawnProcess ?? spawn;
  const activeCommands = new Map<string, ActiveCommand>();

  /**
   * 运行命令。
   * @param request - 命令执行请求
   * @param sink - 实时输出接收函数
   * @returns 命令执行结果
   */
  function run(request: ShellCommandRunRequest, sink?: ShellCommandOutputSink): Promise<ShellCommandRunResult> {
    if (!isCwdInsideWorkspace(request.cwd, request.workspaceRoot)) {
      return Promise.reject(new Error('命令执行目录必须位于当前工作区内'));
    }

    const maxOutputChars = request.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const startedAt = Date.now();
    const spawnCommand = resolveSpawnCommand(request);
    const child = Effect.runSync(
      Effect.sync(() =>
        spawnProcess(spawnCommand.command, spawnCommand.args, {
          cwd: request.cwd,
          shell: false,
          env: process.env
        })
      )
    );
    const activeCommand: ActiveCommand = {
      child,
      timedOut: false
    };
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let sequence = 0;
    let settled = false;

    activeCommands.set(request.commandId, activeCommand);

    const timeout = setTimeout(() => {
      activeCommand.timedOut = true;
      child.kill('SIGTERM');
    }, request.timeoutMs);

    /**
     * 处理输出流片段。
     * @param stream - 输出流类型
     * @param chunk - 输出内容
     */
    function handleOutput(stream: 'stdout' | 'stderr', chunk: Buffer | string): void {
      const text = chunk.toString();
      const bounded = appendBoundedOutput(stream === 'stdout' ? stdout : stderr, text, maxOutputChars);
      if (stream === 'stdout') {
        stdout = bounded.value;
      } else {
        stderr = bounded.value;
      }
      truncated = truncated || bounded.truncated;
      sequence += 1;
      sink?.({
        commandId: request.commandId,
        stream,
        text,
        sequence,
        createdAt: new Date().toISOString()
      });
    }

    return new Promise<ShellCommandRunResult>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer | string) => handleOutput('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer | string) => handleOutput('stderr', chunk));
      child.on('error', (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        activeCommands.delete(request.commandId);
        reject(error);
      });
      child.on('exit', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        activeCommands.delete(request.commandId);
        resolve({
          commandId: request.commandId,
          shell: request.shell,
          command: request.command,
          cwd: request.cwd,
          exitCode,
          signal,
          durationMs: Date.now() - startedAt,
          timedOut: activeCommand.timedOut,
          stdout,
          stderr,
          truncated
        });
      });
    });
  }

  /**
   * 取消运行中的命令。
   * @param commandId - 命令 ID
   * @returns 是否找到并取消
   */
  function cancel(commandId: string): boolean {
    const activeCommand = activeCommands.get(commandId);
    if (!activeCommand) {
      return false;
    }

    activeCommand.child.kill('SIGTERM');
    return true;
  }

  return { run, cancel };
}

/** 默认 Shell 命令 runner。 */
export const shellCommandRunner = createShellCommandRunner();
