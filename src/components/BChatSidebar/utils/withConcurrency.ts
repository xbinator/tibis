/**
 * @file withConcurrency.ts
 * @description 限流并发执行异步任务的工具函数
 */

/**
 * 限流并发执行一组异步任务。
 * 使用 Promise.race 维持并发槽位，单个任务失败不影响其余任务。
 * @param tasks - 任务工厂函数数组
 * @param limit - 最大并发数
 */
export async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  const executing = new Set<Promise<unknown>>();

  for (const task of tasks) {
    // 任务内部自行处理错误（try/catch），此处 .catch 仅用于确保 Promise chain 不断裂
    const p = task()
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {})
      .finally(() => executing.delete(p));

    executing.add(p);
    // eslint-disable-next-line no-await-in-loop
    if (executing.size >= limit) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}
