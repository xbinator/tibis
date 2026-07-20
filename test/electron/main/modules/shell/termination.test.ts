/**
 * @file termination.test.ts
 * @description PTY 平台终止原语抽象测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { createPtyStrategy } from '../../../../../electron/main/modules/shell/interaction/termination.mts';

describe('PtyTerminationStrategy', (): void => {
  it('uses Ctrl+C then verified process-group signals on Unix', (): void => {
    const pty = { write: vi.fn(), kill: vi.fn(), pid: 42 };
    const killSystemProcess = vi.fn();
    const strategy = createPtyStrategy('darwin', { killSystemProcess, runTaskkill: vi.fn() });

    strategy.interruptTree(pty);
    strategy.terminateTree(pty);
    strategy.forceTree(pty);

    expect(pty.write).toHaveBeenCalledWith('\u0003');
    expect(killSystemProcess).toHaveBeenNthCalledWith(1, -42, 'SIGTERM');
    expect(killSystemProcess).toHaveBeenNthCalledWith(2, -42, 'SIGKILL');
    expect(pty.kill).not.toHaveBeenCalled();
  });

  it('uses taskkill tree termination on Windows', (): void => {
    const pty = { write: vi.fn(), kill: vi.fn(), pid: 42 };
    const runTaskkill = vi.fn((): boolean => true);
    const strategy = createPtyStrategy('win32', { killSystemProcess: vi.fn(), runTaskkill });

    strategy.interruptTree(pty);
    strategy.terminateTree(pty);
    strategy.forceTree(pty);

    expect(pty.write).toHaveBeenCalledWith('\u0003');
    expect(runTaskkill).toHaveBeenNthCalledWith(1, 42, false);
    expect(runTaskkill).toHaveBeenNthCalledWith(2, 42, true);
    expect(pty.kill).not.toHaveBeenCalled();
  });

  it('reports process-group liveness and treats ESRCH as empty', (): void => {
    const pty = { write: vi.fn(), kill: vi.fn(), pid: 42 };
    const killSystemProcess = vi.fn();
    const strategy = createPtyStrategy('linux', { killSystemProcess, runTaskkill: vi.fn() });

    expect(strategy.isTreeAlive(pty)).toBe(true);
    expect(killSystemProcess).toHaveBeenLastCalledWith(-42, 0);

    killSystemProcess.mockImplementation((): never => {
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    });
    expect(strategy.isTreeAlive(pty)).toBe(false);
  });

  it('captures detached descendants before interrupting and signals them deepest first', (): void => {
    const pty = { write: vi.fn(), kill: vi.fn(), pid: 42 };
    const killSystemProcess = vi.fn();
    const listDescendants = vi.fn((): number[] => [43, 44]);
    const strategy = createPtyStrategy('darwin', { killSystemProcess, listDescendants, runTaskkill: vi.fn() });

    strategy.interruptTree(pty);
    strategy.terminateTree(pty);

    expect(listDescendants).toHaveBeenCalledWith(42);
    expect(killSystemProcess).toHaveBeenNthCalledWith(1, 44, 'SIGTERM');
    expect(killSystemProcess).toHaveBeenNthCalledWith(2, 43, 'SIGTERM');
    expect(killSystemProcess).toHaveBeenNthCalledWith(3, -42, 'SIGTERM');
  });

  it('retains descendants observed across multiple tracking snapshots', (): void => {
    const pty = { write: vi.fn(), kill: vi.fn(), pid: 42 };
    const killSystemProcess = vi.fn();
    const listDescendants = vi.fn().mockReturnValueOnce([43]).mockReturnValueOnce([44]);
    const strategy = createPtyStrategy('linux', { killSystemProcess, listDescendants, runTaskkill: vi.fn() });

    strategy.trackTree(pty);
    strategy.trackTree(pty);
    strategy.terminateTree(pty);

    expect(killSystemProcess).toHaveBeenNthCalledWith(1, 44, 'SIGTERM');
    expect(killSystemProcess).toHaveBeenNthCalledWith(2, 43, 'SIGTERM');
    expect(killSystemProcess).toHaveBeenNthCalledWith(3, -42, 'SIGTERM');
  });

  it('fails closed when process-tree inspection is unavailable', (): void => {
    const pty = { write: vi.fn(), kill: vi.fn(), pid: 42 };
    const missing = new Error('missing') as NodeJS.ErrnoException;
    missing.code = 'ESRCH';
    const killSystemProcess = vi.fn((): never => {
      throw missing;
    });
    const strategy = createPtyStrategy('linux', {
      killSystemProcess,
      listDescendants: (): number[] => {
        throw new Error('inspection blocked');
      },
      runTaskkill: vi.fn()
    });

    strategy.trackTree(pty);

    expect(strategy.isTreeAlive(pty)).toBe(true);
  });
});
