/**
 * @file native-smoke.test.ts
 * @description Electron ABI PTY smoke 的成功循环和加载失败测试。
 */
import type { PtyProcess, PtyProcessFactory } from '../../../../../electron/main/modules/shell/interaction/pty-process.mts';
import { describe, expect, it, vi } from 'vitest';
import { runShellPtySmoke } from '../../../../../electron/main/modules/shell/native-smoke.mts';

describe('Shell PTY native smoke', (): void => {
  it('observes output, writes one Enter, projects accepted output, and exits cleanly', async (): Promise<void> => {
    let dataListener: ((data: string) => void) | null = null;
    let exitListener: ((event: { exitCode: number; signal?: number }) => void) | null = null;
    const write = vi.fn((data: string): void => {
      if (data !== '\r') return;
      dataListener?.('\r\naccepted\r\n');
      exitListener?.({ exitCode: 0 });
    });
    const terminal: PtyProcess = {
      pid: 42,
      write,
      kill: vi.fn(),
      onData(listener: (data: string) => void) {
        dataListener = listener;
        queueMicrotask((): void => dataListener?.('Continue? [Y/n]'));
        return { dispose: vi.fn() };
      },
      onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
        exitListener = listener;
        return { dispose: vi.fn() };
      }
    };
    const factory: PtyProcessFactory = { spawn: (): PtyProcess => terminal };

    const result = await runShellPtySmoke({ ptyFactory: factory, cwd: process.cwd(), timeoutMs: 1_000 });

    expect(result).toEqual({ ok: true, message: 'Shell PTY ABI smoke PASS' });
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith('\r');
  });

  it('returns a sanitized failure when the native PTY cannot start', async (): Promise<void> => {
    const factory: PtyProcessFactory = {
      spawn: (): PtyProcess => {
        throw new Error('ABI mismatch');
      }
    };

    await expect(runShellPtySmoke({ ptyFactory: factory })).resolves.toEqual({
      ok: false,
      message: 'Shell PTY ABI smoke FAIL: ABI mismatch'
    });
  });
});
