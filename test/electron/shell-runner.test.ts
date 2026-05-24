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
 * @param pid - 可选进程 ID，设置后可触发进程组 kill 逻辑
 * @returns mock 子进程
 */
function createMockChildProcess(pid?: number): MockChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const killMock = vi.fn();

  const child = {
    stdin,
    stdout,
    stderr,
    pid,
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

    // 超时后先发 SIGTERM
    await vi.advanceTimersByTimeAsync(100);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');

    // 宽限期后升级为 SIGKILL
    await vi.advanceTimersByTimeAsync(3_000);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGKILL');

    // SIGKILL 宽限期后仍未退出则强制 resolve
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).resolves.toMatchObject({
      timedOut: true,
      signal: 'SIGKILL',
      exitCode: null
    });
  });

  it('resolves normally when process exits after SIGTERM within grace period', async () => {
    vi.useFakeTimers();

    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess();
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });

    const promise = runner.run({
      commandId: 'cmd-grace',
      shell: 'bash',
      command: 'sleep 30',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      timeoutMs: 100
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');

    // 进程在宽限期内退出
    mockChild.emit('exit', null, 'SIGTERM');

    await expect(promise).resolves.toMatchObject({
      timedOut: true,
      signal: 'SIGTERM'
    });
  });

  it('cancels a running command by commandId and force-resolves if process ignores signals', async () => {
    vi.useFakeTimers();

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

    // 宽限期后升级为 SIGKILL
    await vi.advanceTimersByTimeAsync(3_000);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGKILL');

    // SIGKILL 宽限期后仍未退出则强制 resolve
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(promise).resolves.toMatchObject({
      signal: 'SIGKILL',
      exitCode: null,
      timedOut: false
    });
  });

  it('cancel resolves normally when process exits within grace period', async () => {
    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess();
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });

    const promise = runner.run({
      commandId: 'cmd-cancel-grace',
      shell: 'bash',
      command: 'sleep 30',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      timeoutMs: 5000
    });

    expect(runner.cancel('cmd-cancel-grace')).toBe(true);
    expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');

    // 进程在宽限期内正常退出
    mockChild.emit('exit', null, 'SIGTERM');

    await expect(promise).resolves.toMatchObject({
      signal: 'SIGTERM'
    });
  });

  it('uses process group kill on Unix when child has a pid', async () => {
    vi.useFakeTimers();

    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess(12345);
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });

    const promise = runner.run({
      commandId: 'cmd-pid',
      shell: 'bash',
      command: 'sleep 30',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      timeoutMs: 100
    });

    // 超时触发
    await vi.advanceTimersByTimeAsync(100);

    // Unix 平台应使用负 PID 杀进程组
    if (process.platform !== 'win32') {
      expect(processKillSpy).toHaveBeenCalledWith(-12345, 'SIGTERM');
    } else {
      expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');
    }

    // 宽限期后升级 SIGKILL
    await vi.advanceTimersByTimeAsync(3_000);
    if (process.platform !== 'win32') {
      expect(processKillSpy).toHaveBeenCalledWith(-12345, 'SIGKILL');
    } else {
      expect(mockChild.killMock).toHaveBeenCalledWith('SIGKILL');
    }

    mockChild.emit('exit', null, 'SIGKILL');
    await expect(promise).resolves.toMatchObject({
      signal: 'SIGKILL'
    });

    processKillSpy.mockRestore();
  });

  it('falls back to child.kill when process group kill throws', async () => {
    vi.useFakeTimers();

    const { createShellCommandRunner } = await import('../../electron/main/modules/shell/runner.mjs');
    const mockChild = createMockChildProcess(99999);
    // 模拟进程组不存在
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    const runner = createShellCommandRunner({ spawnProcess: vi.fn(() => mockChild.child) });

    const promise = runner.run({
      commandId: 'cmd-fallback',
      shell: 'bash',
      command: 'sleep 30',
      cwd: '/workspace',
      workspaceRoot: '/workspace',
      timeoutMs: 100
    });

    await vi.advanceTimersByTimeAsync(100);

    // 进程组 kill 失败后回退到 child.kill
    if (process.platform !== 'win32') {
      expect(mockChild.killMock).toHaveBeenCalledWith('SIGTERM');
    }

    mockChild.emit('exit', null, 'SIGTERM');
    await expect(promise).resolves.toMatchObject({
      signal: 'SIGTERM'
    });

    processKillSpy.mockRestore();
  });
});
