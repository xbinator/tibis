/**
 * @file runner.test.ts
 * @description Shell runner 第二期兼容结果语义测试。
 */
import type { PtyShellRunner } from '../../../../../electron/main/modules/shell/pty-runner.mts';
import { describe, expect, it, vi } from 'vitest';
import { createShellCommandRunner } from '../../../../../electron/main/modules/shell/runner.mts';

describe('Shell command runner result compatibility', (): void => {
  it('reports pipe output and an exit termination for a successful command', async (): Promise<void> => {
    const runner = createShellCommandRunner();
    const result = await runner.run({
      commandId: 'pipe-exit-0',
      shell: 'bash',
      command: 'printf ok',
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 5_000,
      interactionMode: 'none'
    });

    expect(result).toMatchObject({
      outputMode: 'pipes',
      termination: { kind: 'exit', exitCode: 0 },
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: 'ok'
    });
  });

  it('keeps a non-zero exit code as a normal exit termination', async (): Promise<void> => {
    const runner = createShellCommandRunner();
    const result = await runner.run({
      commandId: 'pipe-exit-7',
      shell: 'bash',
      command: 'exit 7',
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 5_000,
      interactionMode: 'none'
    });

    expect(result).toMatchObject({
      outputMode: 'pipes',
      termination: { kind: 'exit', exitCode: 7 },
      exitCode: 7,
      timedOut: false
    });
  });

  it('dispatches auto-default requests to the PTY runner', async (): Promise<void> => {
    const run = vi.fn(async () => ({
      commandId: 'pty-route',
      shell: 'bash' as const,
      command: 'interactive',
      cwd: process.cwd(),
      exitCode: 0,
      signal: null,
      durationMs: 1,
      timedOut: false,
      truncated: false,
      outputMode: 'pty' as const,
      terminalOutput: 'done',
      termination: { kind: 'exit' as const, exitCode: 0 },
      autoInteraction: { enabled: true, answerCount: 1 }
    }));
    const ptyRunner: PtyShellRunner = { run, cancel: vi.fn((): boolean => false) };
    const runner = createShellCommandRunner({
      ptyRunner,
      getAutoDefaultCapability: () => ({
        enabled: true,
        reason: null,
        verificationVersion: 'v1',
        platform: process.platform,
        arch: process.arch
      })
    });

    const result = await runner.run({
      commandId: 'pty-route',
      shell: 'bash',
      command: 'interactive',
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 5_000,
      interactionMode: 'auto-default'
    });

    expect(run).toHaveBeenCalledOnce();
    expect(result.outputMode).toBe('pty');
  });

  it('rejects a direct auto-default request when the main-process gate is disabled', async (): Promise<void> => {
    const run = vi.fn();
    const ptyRunner: PtyShellRunner = { run, cancel: vi.fn((): boolean => false) };
    const runner = createShellCommandRunner({
      ptyRunner,
      getAutoDefaultCapability: () => ({
        enabled: false,
        reason: 'FEATURE_DISABLED',
        verificationVersion: 'v1',
        platform: process.platform,
        arch: process.arch
      })
    });

    await expect(
      runner.run({
        commandId: 'pty-disabled',
        shell: 'bash',
        command: 'interactive',
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 5_000,
        interactionMode: 'auto-default'
      })
    ).rejects.toThrow('auto-default');
    expect(run).not.toHaveBeenCalled();
  });
});
