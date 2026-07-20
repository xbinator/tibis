/**
 * @file pty-runner.test.ts
 * @description 真实 PTY fixture 的自动默认回答、事件顺序和不支持输入测试。
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ShellRunEventEnvelope } from '../../../../../electron/main/modules/shell/types.mts';
import { describe, expect, it } from 'vitest';
import { createPtyStrategy } from '../../../../../electron/main/modules/shell/interaction/termination.mts';
import { createPtyShellRunner, type PtyShellRunner } from '../../../../../electron/main/modules/shell/pty-runner.mts';

/** 当前 CI 平台可用的交互 Shell。 */
const TEST_SHELL = process.platform === 'win32' ? 'powershell' : 'bash';

/**
 * 创建 fixture 命令。
 * @param scenario - fixture 场景
 * @returns shell 命令
 */
function fixtureCommand(scenario: string, args: string[] = []): string {
  const fixture = resolve(process.cwd(), 'test/fixtures/shell/interactive-cli.mjs');
  return ['node', JSON.stringify(fixture), scenario, ...args.map((arg: string): string => JSON.stringify(arg))].join(' ');
}

/**
 * 创建不依赖受限测试沙箱进程表读取的真实 PTY runner。
 * @param listDescendants - 测试提供的确定性后代 PID
 * @returns PTY runner
 */
function createTestRunner(listDescendants: (pid: number) => number[] = (): number[] => []): PtyShellRunner {
  const terminationStrategy = createPtyStrategy(process.platform, { listDescendants });
  return createPtyShellRunner({
    terminationStrategy,
    gracePeriodMs: 50,
    autoDefaultOptions: { activeOutputWindowMs: 200, promptSettleMs: 100, transitionSettleMs: 100 }
  });
}

/**
 * 判断测试子进程是否仍存在。
 * @param pid - 测试 fixture 子进程 PID
 * @returns 是否仍可发送信号
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 等待测试子进程从系统进程表消失。
 * @param pid - 测试 fixture 子进程 PID
 * @returns 是否在期限内消失
 */
function waitProcessExit(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  return new Promise<boolean>((resolvePromise: (exited: boolean) => void): void => {
    /** 轮询测试 PID，直到退出或达到期限。 */
    function checkProcess(): void {
      if (!isProcessAlive(pid)) {
        resolvePromise(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolvePromise(false);
        return;
      }
      setTimeout(checkProcess, 50);
    }

    checkProcess();
  });
}

describe('PtyShellRunner', (): void => {
  it('answers one boolean default and emits ordered terminal, answer, and finished events', async (): Promise<void> => {
    const events: ShellRunEventEnvelope[] = [];
    const runner = createTestRunner();
    const result = await runner.run(
      {
        commandId: 'pty-boolean',
        shell: TEST_SHELL,
        command: fixtureCommand('boolean-default'),
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 4_000,
        interactionMode: 'auto-default'
      },
      (event) => events.push(event)
    );

    expect(result.terminalOutput).toContain('accepted');
    expect(result).toMatchObject({
      outputMode: 'pty',
      termination: { kind: 'exit', exitCode: 0 },
      autoInteraction: { enabled: true, answerCount: 1 }
    });
    expect(result.terminalOutput).toContain('accepted');
    expect(events.some((item) => item.event.type === 'auto_answer')).toBe(true);
    expect(events.at(-1)?.event.type).toBe('finished');
    expect(events.filter((item: ShellRunEventEnvelope): boolean => item.event.type === 'finished')).toHaveLength(1);
    expect(events.map((item) => item.sequence)).toEqual(events.map((_item, index) => index + 1));
  });

  it('answers a settled prompt even when completed build text remains visible', async (): Promise<void> => {
    const runner = createTestRunner();
    const result = await runner.run({
      commandId: 'pty-stale-build',
      shell: TEST_SHELL,
      command: fixtureCommand('stale-compile-prompt'),
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 2_500,
      interactionMode: 'auto-default'
    });

    expect(result).toMatchObject({
      termination: { kind: 'exit', exitCode: 0 },
      autoInteraction: { enabled: true, answerCount: 1 }
    });
    expect(result.terminalOutput).toContain('accepted after build');
  });

  it('completes a multi-page wizard and boolean confirmation in one command', async (): Promise<void> => {
    const events: ShellRunEventEnvelope[] = [];
    const runner = createTestRunner();
    const result = await runner.run(
      {
        commandId: 'pty-multi-wizard',
        shell: TEST_SHELL,
        command: fixtureCommand('multi-wizard'),
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 5_000,
        interactionMode: 'auto-default'
      },
      (event: ShellRunEventEnvelope): void => {
        events.push(event);
      }
    );

    expect(result).toMatchObject({
      termination: { kind: 'exit', exitCode: 0 },
      autoInteraction: { enabled: true, answerCount: 3 }
    });
    expect(events.filter((item: ShellRunEventEnvelope): boolean => item.event.type === 'auto_answer')).toHaveLength(3);
    expect(result.terminalOutput).toContain('installed wizard defaults');
  });

  it('gracefully stops instead of answering a secret prompt', async (): Promise<void> => {
    const runner = createTestRunner();
    const result = await runner.run(
      {
        commandId: 'pty-secret',
        shell: TEST_SHELL,
        command: fixtureCommand('secret-input'),
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 5_000,
        interactionMode: 'auto-default'
      },
      (): void => undefined
    );

    expect(result).toMatchObject({
      termination: { kind: 'unsupported_prompt', reason: 'secret' },
      autoInteraction: { enabled: true, answerCount: 0, stopReason: 'unsupported_prompt' }
    });
  });

  it('answers the same prompt again after real PTY output closes the prior checkpoint', async (): Promise<void> => {
    const events: ShellRunEventEnvelope[] = [];
    const runner = createTestRunner();
    const result = await runner.run(
      {
        commandId: 'pty-reentry',
        shell: TEST_SHELL,
        command: fixtureCommand('same-screen-reentry'),
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 8_000,
        interactionMode: 'auto-default'
      },
      (event: ShellRunEventEnvelope): void => {
        events.push(event);
      }
    );

    expect(result).toMatchObject({
      termination: { kind: 'exit', exitCode: 0 },
      autoInteraction: { enabled: true, answerCount: 2 }
    });
    expect(events.filter((item: ShellRunEventEnvelope): boolean => item.event.type === 'auto_answer')).toHaveLength(2);
    expect(result.terminalOutput).toContain('accepted twice');
  }, 10_000);

  it('does not finalize graceful stop while a PTY descendant remains alive', async (): Promise<void> => {
    const tempDir = mkdtempSync(join(tmpdir(), 'tibis-pty-cleanup-'));
    const pidFile = join(tempDir, 'child.pid');
    let childPid = 0;
    try {
      const runner = createTestRunner((): number[] => {
        try {
          childPid = Number(readFileSync(pidFile, 'utf8'));
          return childPid > 0 ? [childPid] : [];
        } catch {
          return [];
        }
      });
      const result = await runner.run({
        commandId: 'pty-tree-cleanup',
        shell: TEST_SHELL,
        command: fixtureCommand('child-process-tree', [pidFile]),
        cwd: process.cwd(),
        workspaceRoot: process.cwd(),
        timeoutMs: 5_000,
        interactionMode: 'auto-default'
      });
      childPid = Number(result.terminalOutput?.match(/CHILD_PID=(\d+)/)?.[1] ?? childPid);

      const exitedByRunner = childPid > 0 ? await waitProcessExit(childPid) : false;
      if (!exitedByRunner && childPid > 0) {
        process.kill(childPid, 'SIGKILL');
        await waitProcessExit(childPid);
      }

      expect(childPid).toBeGreaterThan(0);
      expect(result.termination).toEqual({ kind: 'unsupported_prompt', reason: 'secret' });
      expect(exitedByRunner).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 8_000);
});
