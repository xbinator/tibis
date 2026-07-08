/**
 * @file sandbox-core.test.ts
 * @description 通用 JS 沙箱核心行为测试。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSandboxSession, runSandboxCode } from '@/utils/sandbox';

/** 不主动响应消息的 Worker 测试替身。 */
class TimeoutWorkerMock {
  /** 已创建的 Worker 实例。 */
  public static instances: TimeoutWorkerMock[] = [];

  /** Worker 消息处理器。 */
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  /** Worker 错误处理器。 */
  public onerror: ((event: ErrorEvent) => void) | null = null;

  /** 主线程发送给 Worker 的消息。 */
  public readonly messages: unknown[] = [];

  /** Worker 是否已被终止。 */
  public terminated = false;

  /**
   * 创建 Worker 测试替身。
   */
  public constructor() {
    TimeoutWorkerMock.instances.push(this);
  }

  /**
   * 接收主线程消息但不返回结果，用于触发超时。
   * @param message - 主线程消息
   */
  public postMessage(message: unknown): void {
    this.messages.push(message);
  }

  /**
   * 终止 Worker。
   */
  public terminate(): void {
    this.terminated = true;
  }
}

describe('runSandboxCode', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TimeoutWorkerMock.instances = [];
  });

  it('runs inner sandbox functions in strict mode', async (): Promise<void> => {
    const result = await runSandboxCode(
      {
        code: ["const fn = __sandbox.createFunction([], 'return this === undefined')", 'return fn()'].join('\n')
      },
      {
        useWorker: false
      }
    );

    expect(result.value).toBe(true);
  });

  it('keeps shadow global state across sandbox session runs', async (): Promise<void> => {
    const session = createSandboxSession({ useWorker: false });

    try {
      const firstResult = await session.run({
        code: ['globalThis.count = (globalThis.count ?? 0) + 1', 'return globalThis.count'].join('\n')
      });
      const secondResult = await session.run({
        code: ['globalThis.count = (globalThis.count ?? 0) + 1', 'return globalThis.count'].join('\n')
      });

      expect(firstResult.value).toBe(1);
      expect(secondResult.value).toBe(2);
    } finally {
      session.dispose();
    }
  });

  it('rejects sandbox session runs after dispose', async (): Promise<void> => {
    const session = createSandboxSession({ useWorker: false });

    session.dispose();

    await expect(session.run({ code: 'return 1' })).rejects.toThrow('沙箱 session 已销毁');
  });

  it('terminates worker sandbox sessions after a run timeout', async (): Promise<void> => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', TimeoutWorkerMock);

    const session = createSandboxSession({ timeoutMs: 10 });
    const runPromise = session.run({ code: 'return 1' });

    await vi.advanceTimersByTimeAsync(10);

    await expect(runPromise).rejects.toThrow('沙箱 JS 执行超时');
    expect(TimeoutWorkerMock.instances[0]?.terminated).toBe(true);
    await expect(session.run({ code: 'return 2' })).rejects.toThrow('沙箱 session 已销毁');
  });
});
