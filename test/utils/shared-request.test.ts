/**
 * @file shared-request.test.ts
 * @description 按键共享异步请求测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { SharedRequest } from '@/utils/sharedRequest';

/**
 * 可由测试控制结果的 Promise。
 */
interface Deferred<T> {
  /** 等待外部完成的 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

describe('SharedRequest', (): void => {
  it('shares concurrent requests with the same key', async (): Promise<void> => {
    const deferred = createDeferred<string>();
    const handler = vi.fn((_key: string): Promise<string> => deferred.promise);
    const requests = new SharedRequest<string, string>(handler);

    const first = requests.fetch('weather');
    const second = requests.fetch('weather');
    await Promise.resolve();

    expect(first).toBe(second);
    expect(handler).toHaveBeenCalledOnce();
    deferred.resolve('sunny');
    await expect(first).resolves.toBe('sunny');
  });

  it('runs different keys independently', async (): Promise<void> => {
    const weather = createDeferred<string>();
    const travel = createDeferred<string>();
    const handler = vi.fn((key: string): Promise<string> => (key === 'weather' ? weather.promise : travel.promise));
    const requests = new SharedRequest<string, string>(handler);

    const first = requests.fetch('weather');
    const second = requests.fetch('travel');
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(2);
    weather.resolve('sunny');
    travel.resolve('train');
    await expect(first).resolves.toBe('sunny');
    await expect(second).resolves.toBe('train');
  });

  it('clears successful requests after settlement', async (): Promise<void> => {
    const handler = vi.fn(async (_key: string): Promise<string> => 'ready');
    const requests = new SharedRequest<string, string>(handler);

    await expect(requests.fetch('weather')).resolves.toBe('ready');
    await expect(requests.fetch('weather')).resolves.toBe('ready');

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('clears failed requests so later calls can retry', async (): Promise<void> => {
    const handler = vi.fn<(_key: string) => Promise<string>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ready');
    const requests = new SharedRequest<string, string>(handler);

    await expect(requests.fetch('weather')).rejects.toThrow('offline');
    await expect(requests.fetch('weather')).resolves.toBe('ready');

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('converts a synchronous handler throw into a rejected Promise', async (): Promise<void> => {
    const requests = new SharedRequest<string, string>(() => {
      throw new Error('sync failure');
    });

    await expect(requests.fetch('weather')).rejects.toThrow('sync failure');
  });
});
