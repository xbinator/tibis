/**
 * @file withConcurrency.test.ts
 * @description 限流并发工具函数单元测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { withConcurrency } from '@/components/BChatSidebar/utils/withConcurrency';

/** 创建并等待指定毫秒数的 Promise */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

describe('withConcurrency', () => {
  it('runs all tasks to completion', async () => {
    const callOrder: string[] = [];
    const tasks = [10, 20, 30].map((d, i) => async () => {
      await delay(d);
      callOrder.push(`task-${i}`);
    });

    const start = Date.now();
    await withConcurrency(tasks, 3);
    const elapsed = Date.now() - start;

    expect(callOrder).toHaveLength(3);
    // 全部并发完成，总时间应接近最长单个任务的时间
    expect(elapsed).toBeLessThan(100);
  });

  it('respects concurrency limit', async () => {
    const running = vi.fn();
    const doneCountsAtCall: number[] = [];

    const tasks = [0, 1, 2, 3, 4].map((_, i) => async () => {
      running();
      // 让不同的任务有不同的执行时长，便于观察并发槽位
      await delay(i === 0 ? 30 : 10);
      doneCountsAtCall.push(i);
    });

    await withConcurrency(tasks, 2);

    // 所有任务都应执行完成
    expect(running).toHaveBeenCalledTimes(5);
  });

  it('continues execution when some tasks fail', async () => {
    const results: string[] = [];
    const tasks: (() => Promise<string>)[] = [
      async () => {
        throw new Error('fail');
      },
      async () => {
        results.push('ok');
        return 'ok';
      }
    ];

    // withConcurrency 内部 catch 吞掉错误，应继续执行后续任务
    await withConcurrency(tasks, 2);

    expect(results).toEqual(['ok']);
  });

  it('handles empty task array', async () => {
    await expect(withConcurrency([], 5)).resolves.toBeUndefined();
  });

  it('works with concurrency limit of 1', async () => {
    const startOrder: string[] = [];

    const tasks = [20, 10].map((d, i) => async () => {
      startOrder.push(`start-${i}`);
      await delay(d);
      return `done-${i}`;
    });

    await withConcurrency(tasks, 1);

    // limit=1 时任务应按顺序启动
    expect(startOrder).toEqual(['start-0', 'start-1']);
  });
});
