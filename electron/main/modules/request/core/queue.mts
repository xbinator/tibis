/**
 * @file queue.mts
 * @description 平台托管 request 的主进程并发队列。
 */

/**
 * 托管请求队列。
 */
export interface RequestQueue {
  /**
   * 添加一个异步任务到队列。
   * @param run - 异步任务
   * @returns 任务结果
   */
  add: <T>(run: () => Promise<T>) => Promise<T>;
}

/**
 * 托管请求等待队列任务。
 */
interface RequestQueuedTask<T> {
  /** 执行函数。 */
  run: () => Promise<T>;
  /** 成功回调。 */
  resolve: (value: T) => void;
  /** 失败回调。 */
  reject: (reason: unknown) => void;
}

/**
 * 创建类似 p-queue 的并发队列，只限制并发数，不限制等待队列长度。
 * @param concurrency - 最大并发数
 * @returns 托管请求队列
 */
export function createRequestQueue(concurrency: number): RequestQueue {
  const maxConcurrency = Math.max(1, concurrency);
  let activeCount = 0;
  const queue: Array<RequestQueuedTask<unknown>> = [];
  /** 推进等待队列。 */
  let runNext = (): void => undefined;

  /**
   * 处理任务完成后的队列推进。
   */
  function handleTaskSettled(): void {
    activeCount -= 1;
    runNext();
  }

  /**
   * 推进等待队列。
   */
  runNext = (): void => {
    while (activeCount < maxConcurrency && queue.length > 0) {
      const task = queue.shift();
      if (!task) return;

      activeCount += 1;
      task.run().then(task.resolve).catch(task.reject).finally(handleTaskSettled);
    }
  };

  return {
    add<T>(run: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject): void => {
        queue.push({
          run: run as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject
        });
        runNext();
      });
    }
  };
}
