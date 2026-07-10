/**
 * @file render-scheduler.test.ts
 * @description BMessage 帧预算调度器测试。
 */
import { describe, expect, it, vi } from 'vitest';
import type { FrameCallback, FrameHandle, MessageRenderSchedulerRuntime } from '@/components/BMessage/utils/messageScheduler';
import { createMessageRenderScheduler } from '@/components/BMessage/utils/messageScheduler';

/**
 * 可手动推进的调度器测试运行时。
 */
interface TestSchedulerRuntime {
  /** 调度器运行时依赖。 */
  runtime: MessageRenderSchedulerRuntime;
  /** 执行当前待处理帧。 */
  flushFrame: () => void;
  /** 设置高精度时钟。 */
  setNow: (value: number) => void;
  /** 错误上报 mock。 */
  reportError: ReturnType<typeof vi.fn>;
}

/**
 * 创建可手动推进帧的测试运行时。
 * @returns 测试运行时与控制函数
 */
function createRuntime(): TestSchedulerRuntime {
  let callback: FrameCallback | null = null;
  let now = 0;
  const reportError = vi.fn();

  return {
    runtime: {
      requestFrame(nextCallback: FrameCallback): FrameHandle {
        callback = nextCallback;
        return 1;
      },
      cancelFrame(): void {
        callback = null;
      },
      now: (): number => now,
      reportError
    },
    flushFrame(): void {
      const nextCallback = callback;
      callback = null;
      nextCallback?.();
    },
    setNow(value: number): void {
      now = value;
    },
    reportError
  };
}

describe('createMessageRenderScheduler', (): void => {
  it('replaces a queued task with the latest task for the same token', (): void => {
    const { runtime, flushFrame } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6 });
    const token = Symbol('message');
    const first = vi.fn();
    const latest = vi.fn();

    scheduler.enqueue({ token, priority: 'normal', run: first });
    scheduler.enqueue({ token, priority: 'high', run: latest });
    flushFrame();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it('runs high priority tasks first and yields after the frame budget', (): void => {
    const { runtime, flushFrame, setNow } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6 });
    const calls: string[] = [];

    scheduler.enqueue({ token: Symbol('normal'), priority: 'normal', run: (): number => calls.push('normal') });
    scheduler.enqueue({
      token: Symbol('high-one'),
      priority: 'high',
      run: (): void => {
        calls.push('high-one');
        setNow(7);
      }
    });
    scheduler.enqueue({ token: Symbol('high-two'), priority: 'high', run: (): number => calls.push('high-two') });

    flushFrame();
    expect(calls).toEqual(['high-two', 'high-one']);

    setNow(0);
    flushFrame();
    expect(calls).toEqual(['high-two', 'high-one', 'normal']);
  });

  it('runs the most recently promoted high priority task first', (): void => {
    const { runtime, flushFrame } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6, maxTasksPerFrame: 1 });
    const calls: string[] = [];

    scheduler.enqueue({ token: Symbol('older'), priority: 'high', run: (): number => calls.push('older') });
    scheduler.enqueue({ token: Symbol('newer'), priority: 'high', run: (): number => calls.push('newer') });

    flushFrame();
    expect(calls).toEqual(['newer']);
  });

  it('limits each frame even when queued tasks are individually cheap', (): void => {
    const { runtime, flushFrame } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6, maxTasksPerFrame: 2 });
    const calls: string[] = [];

    scheduler.enqueue({ token: Symbol('one'), priority: 'normal', run: (): number => calls.push('one') });
    scheduler.enqueue({ token: Symbol('two'), priority: 'normal', run: (): number => calls.push('two') });
    scheduler.enqueue({ token: Symbol('three'), priority: 'normal', run: (): number => calls.push('three') });

    flushFrame();
    expect(calls).toEqual(['one', 'two']);

    flushFrame();
    expect(calls).toEqual(['one', 'two', 'three']);
  });

  it('cancels queued work and isolates task errors', (): void => {
    const { runtime, flushFrame, reportError } = createRuntime();
    const scheduler = createMessageRenderScheduler({ runtime, budgetMs: 6 });
    const cancelledToken = Symbol('cancelled');
    const cancelled = vi.fn();
    const afterError = vi.fn();
    const error = new Error('parse failed');

    scheduler.enqueue({ token: cancelledToken, priority: 'normal', run: cancelled });
    scheduler.cancel(cancelledToken);
    scheduler.enqueue({
      token: Symbol('error'),
      priority: 'high',
      run: (): never => {
        throw error;
      }
    });
    scheduler.enqueue({ token: Symbol('after'), priority: 'high', run: afterError });
    flushFrame();

    expect(cancelled).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(error);
    expect(afterError).toHaveBeenCalledOnce();
  });

  it('falls back to a timer when requestAnimationFrame is unavailable', (): void => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const scheduler = createMessageRenderScheduler();
    const task = vi.fn();

    scheduler.enqueue({ token: Symbol('fallback'), priority: 'normal', run: task });
    expect(task).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(task).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
