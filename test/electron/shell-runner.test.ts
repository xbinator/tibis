/**
 * @file shell-runner.test.ts
 * @description 验证 Shell 命令 runner 的输出流、退出状态、超时和取消行为。
 */
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 可驱动的 mock 子进程。
 */
interface MockChildProcess {
  /** 子进程对象。 */
  child: ChildProcessWithoutNullStreams;
  /** kill mock。 */
  killMock: ReturnType<typeof vi.fn>;
  /** 触发子进程事件。 */
  emit: (event: string, ...args: unknown[]) => void;
}

/**
 * 创建可驱动 mock 子进程。
 * @returns mock 子进程
 */
function createMockChildProcess(): MockChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const killMock = vi.fn();

  const child = {
    stdin,
    stdout,
    stderr,
    killed: false,
    kill: killMock,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return child;
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return child;
    }
  } as unknown as ChildProcessWithoutNullStreams;

  return {
    child,
    killMock,
    emit: (event: string, ...args: unknown[]): void => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  };
}

describe('shell command runner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams stdout and returns exit metadata', async () => {
    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess();
    const spawnProcess = vi.fn((_command: string, _args: string[], _options: SpawnOptionsWithoutStdio) => mockChild.child);
    const chunks: Array<{ stream: string; text: string }> = [];
    const runner = createShellCommandRunner({ spawnProcess });

    const promise = runner.run(
      {
        commandId: 'cmd-1',
        shell: 'bash',
        command: 'echo hello',
        cwd: '/workspace',
        workspaceRoot: '/workspace',
        timeoutMs: 5000
      },
      (chunk) => chunks.push({ stream: chunk.stream, text: chunk.text })
    );

    mockChild.child.stdout.write('hello\n');
    mockChild.emit('exit', 0, null);

    await expect(promise).resolves.toMatchObject({
      commandId: 'cmd-1',
      exitCode: 0,
      signal: null,
      stdout: 'hello\n',
      stderr: '',
      timedOut: false
    });
    expect(chunks).toEqual([{ stream: 'stdout', text: 'hello\n' }]);
    expect(spawnProcess).toHaveBeenCalledWith('bash', ['-lc', 'echo hello'], expect.objectContaining({ cwd: '/workspace', shell: false }));
  });

  it('streams stderr and preserves non-zero exit code', async () => {
    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess();
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });
    const chunks: Array<{ stream: string; text: string }> = [];

    const promise = runner.run(
      {
        commandId: 'cmd-2',
        shell: 'bash',
        command: 'exit 2',
        cwd: '/workspace',
        workspaceRoot: '/workspace',
        timeoutMs: 5000
      },
      (chunk) => chunks.push({ stream: chunk.stream, text: chunk.text })
    );

    mockChild.child.stderr.write('failed\n');
    mockChild.emit('exit', 2, null);

    await expect(promise).resolves.toMatchObject({
      exitCode: 2,
      stderr: 'failed\n',
      timedOut: false
    });
    expect(chunks).toEqual([{ stream: 'stderr', text: 'failed\n' }]);
  });

  it('kills commands when the process timeout is reached', async () => {
    vi.useFakeTimers();

    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess();
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });

    const promise = runner.run({
      commandId: 'cmd-3',
      shell: 'bash',
      command: 'sleep 30',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      timeoutMs: 100
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');

    mockChild.emit('exit', null, 'SIGTERM');

    await expect(promise).resolves.toMatchObject({
      timedOut: true,
      signal: 'SIGTERM'
    });
  });

  it('cancels a running command by commandId', async () => {
    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess();
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });

    const promise = runner.run({
      commandId: 'cmd-4',
      shell: 'bash',
      command: 'sleep 30',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      timeoutMs: 5000
    });

    expect(runner.cancel('cmd-4')).toBe(true);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');

    mockChild.emit('exit', null, 'SIGTERM');

    await expect(promise).resolves.toMatchObject({
      signal: 'SIGTERM'
    });
  });
});
