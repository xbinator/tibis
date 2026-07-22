/**
 * @file provider.test.ts
 * @description Provider Store 加载并发控制测试。
 */
import type { AIProvider } from 'types/ai';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerStorage } from '@/shared/storage';
import { useProviderStore } from '@/stores/ai/provider';

/**
 * 可由测试显式完成的异步任务。
 */
interface Deferred<T> {
  /** 等待中的 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T | PromiseLike<T>) => void;
}

/**
 * 创建可控异步任务。
 * @returns Promise 及其完成函数
 */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve): void => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

/**
 * 创建 Provider 测试数据。
 * @returns 已启用的聊天 Provider
 */
function createProvider(): AIProvider {
  return {
    id: 'provider-1',
    name: 'Provider 1',
    description: 'Provider for tests',
    type: 'openai',
    isEnabled: true,
    models: [
      {
        id: 'model-1',
        name: 'Model 1',
        type: 'chat',
        isEnabled: true
      }
    ]
  };
}

describe('provider store', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('coalesces concurrent provider loads into one storage read', async (): Promise<void> => {
    const deferred = createDeferred<AIProvider[]>();
    const listProviders = vi.spyOn(providerStorage, 'listProviders').mockReturnValue(deferred.promise);
    const store = useProviderStore();

    const firstLoad = store.loadProviders();
    const secondLoad = store.loadProviders();
    deferred.resolve([createProvider()]);
    await Promise.all([firstLoad, secondLoad]);

    expect(listProviders).toHaveBeenCalledOnce();
    expect(store.providers).toEqual([createProvider()]);
    expect(store.loading).toBe(false);
  });
});
