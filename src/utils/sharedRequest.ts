/**
 * @file sharedRequest.ts
 * @description 提供按键共享执行中异步请求的通用 Class。
 */

/**
 * 按资源键共享正在执行的异步请求。
 */
export class SharedRequest<Key, Result> {
  /** 正在执行的请求。 */
  private readonly pendingRequests = new Map<Key, Promise<Result>>();

  /** 实际异步请求处理函数。 */
  private readonly handler: (key: Key) => Promise<Result>;

  /**
   * 创建共享请求实例。
   * @param handler - 实际异步请求处理函数
   */
  public constructor(handler: (key: Key) => Promise<Result>) {
    this.handler = handler;
  }

  /**
   * 执行请求，相同 Key 的并发调用共享同一个 Promise。
   * @param key - 请求资源键
   * @returns 请求结果
   */
  public fetch(key: Key): Promise<Result> {
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // 统一进入 Promise 链，确保 handler 同步抛错也表现为拒绝的 Promise。
    const current = Promise.resolve()
      .then((): Promise<Result> => this.handler(key))
      .finally((): void => {
        if (this.pendingRequests.get(key) === current) {
          this.pendingRequests.delete(key);
        }
      });

    this.pendingRequests.set(key, current);
    return current;
  }
}
