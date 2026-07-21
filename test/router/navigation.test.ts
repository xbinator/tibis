/**
 * @file navigation.test.ts
 * @description Vue Router 导航结果判定测试。
 * @vitest-environment jsdom
 */
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { isBlockingNavigationFailure } from '@/router/navigation';

/** 创建包含两个页面的内存路由。 */
function createTestRouter(): ReturnType<typeof createRouter> {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/a', component: { template: '<div>A</div>' } },
      { path: '/b', component: { template: '<div>B</div>' } }
    ]
  });
}

describe('isBlockingNavigationFailure', (): void => {
  it('accepts duplicated navigation but rejects an aborted navigation', async (): Promise<void> => {
    const router = createTestRouter();
    await router.push('/a');

    expect(isBlockingNavigationFailure(await router.push('/a'))).toBe(false);

    router.beforeEach((): false => false);
    expect(isBlockingNavigationFailure(await router.push('/b'))).toBe(true);
  });
});
