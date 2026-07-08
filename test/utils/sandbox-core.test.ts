/* eslint-disable max-classes-per-file */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable no-use-before-define */
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

/**
 * Worker run 输入消息。
 */
interface WorkerRunInputMessage {
  /** 消息类型。 */
  type: 'run';
  /** 沙箱运行 ID。 */
  runId: string;
  /** 沙箱运行载荷。 */
  payload: {
    /** 注入参数。 */
    arguments?: Record<string, unknown>;
  };
}

/**
 * Worker host-response 输入消息。
 */
interface WorkerHostResponseInputMessage {
  /** 消息类型。 */
  type: 'host-response';
  /** 宿主函数请求 ID。 */
  requestId: string;
  /** 宿主函数返回值。 */
  value: unknown;
}

/**
 * 判断值是否是 Worker run 输入消息。
 * @param value - 待判断值
 * @returns 是否是 Worker run 输入消息
 */
function isWorkerRunInputMessage(value: unknown): value is WorkerRunInputMessage {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as { type?: unknown; runId?: unknown; payload?: unknown };

  return record.type === 'run' && typeof record.runId === 'string' && typeof record.payload === 'object' && record.payload !== null;
}

/**
 * 判断值是否是 Worker host-response 输入消息。
 * @param value - 待判断值
 * @returns 是否是 Worker host-response 输入消息
 */
function isWorkerHostResponseInputMessage(value: unknown): value is WorkerHostResponseInputMessage {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as { type?: unknown; requestId?: unknown };

  return record.type === 'host-response' && typeof record.requestId === 'string';
}

/** 校验 run payload 可结构化克隆的 Worker 测试替身。 */
class CloneCheckingRunWorkerMock {
  /** Worker 消息处理器。 */
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  /** Worker 错误处理器。 */
  public onerror: ((event: ErrorEvent) => void) | null = null;

  /**
   * 校验主线程 run 消息可结构化克隆，并回传克隆后的参数。
   * @param message - 主线程消息
   */
  public postMessage(message: unknown): void {
    const clonedMessage = structuredClone(message);
    if (!isWorkerRunInputMessage(clonedMessage)) return;

    queueMicrotask((): void => {
      this.onmessage?.({
        data: {
          type: 'done',
          runId: clonedMessage.runId,
          result: {
            value: clonedMessage.payload.arguments
          }
        }
      } as MessageEvent<unknown>);
    });
  }

  /**
   * 终止 Worker。
   */
  public terminate(): void {}
}

/** 校验 host-response payload 可结构化克隆的 Worker 测试替身。 */
class CloneCheckingHostResponseWorkerMock {
  /** Worker 消息处理器。 */
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  /** Worker 错误处理器。 */
  public onerror: ((event: ErrorEvent) => void) | null = null;

  /**
   * 校验主线程消息可结构化克隆，并模拟一次宿主函数调用。
   * @param message - 主线程消息
   */
  public postMessage(message: unknown): void {
    const clonedMessage = structuredClone(message);

    if (isWorkerRunInputMessage(clonedMessage)) {
      queueMicrotask((): void => {
        this.onmessage?.({
          data: {
            type: 'host-call',
            runId: clonedMessage.runId,
            requestId: `${clonedMessage.runId}:host:1`,
            name: 'getMovie',
            args: []
          }
        } as MessageEvent<unknown>);
      });
      return;
    }

    if (isWorkerHostResponseInputMessage(clonedMessage)) {
      queueMicrotask((): void => {
        this.onmessage?.({
          data: {
            type: 'done',
            runId: clonedMessage.requestId.split(':host:')[0],
            result: {
              value: clonedMessage.value
            }
          }
        } as MessageEvent<unknown>);
      });
      return;
    }

    queueMicrotask((): void => {
      this.onmessage?.({
        data: {
          type: 'error',
          runId: 'unknown',
          message: 'unexpected worker message'
        }
      } as MessageEvent<unknown>);
    });
  }

  /**
   * 终止 Worker。
   */
  public terminate(): void {}
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

  it('sends cloneable payload arguments to worker runs', async (): Promise<void> => {
    vi.stubGlobal('Worker', CloneCheckingRunWorkerMock);

    const movie = new Proxy({ title: '流浪地球' }, {});

    await expect(
      runSandboxCode({
        code: 'return movie.title',
        arguments: {
          movie
        }
      })
    ).resolves.toEqual({
      value: {
        movie: {
          title: '流浪地球'
        }
      }
    });
  });

  it('sends cloneable host function responses back to worker runs', async (): Promise<void> => {
    vi.stubGlobal('Worker', CloneCheckingHostResponseWorkerMock);

    await expect(
      runSandboxCode(
        {
          code: 'return await getMovie()'
        },
        {
          hostFunctions: {
            getMovie: (): unknown => new Proxy({ title: '流浪地球' }, {})
          }
        }
      )
    ).resolves.toEqual({
      value: {
        title: '流浪地球'
      }
    });
  });
});
