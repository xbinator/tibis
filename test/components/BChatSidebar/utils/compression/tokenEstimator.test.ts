/**
 * @file tokenEstimator.test.ts
 * @description TokenEstimator 模块测试：消息哈希与 token 估算缓存失效判断。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建测试用基础消息。
 */
function makeMsg(overrides: Partial<Message> & { id: string; content: string }): Message {
  return {
    id: overrides.id,
    role: overrides.role ?? 'user',
    content: overrides.content,
    parts: overrides.parts ?? [{ type: 'text', text: overrides.content } as never],
    loading: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

beforeEach((): void => {
  vi.resetModules();
});

describe('buildMessageContentHash', () => {
  it('changes when content changes even if content length and part count stay the same', async () => {
    const { buildMessageContentHash } = await import('@/components/BChatSidebar/utils/compression/tokenEstimator');

    const first = makeMsg({ id: 'm1', content: 'abcd' });
    const second = makeMsg({ id: 'm1', content: 'wxyz' });

    expect(buildMessageContentHash(first)).not.toBe(buildMessageContentHash(second));
  });
});

describe('createTokenEstimator', () => {
  it('loads js-tiktoken lazily only when an estimator is created', async () => {
    let moduleLoadCount = 0;

    vi.doMock('js-tiktoken', () => {
      moduleLoadCount += 1;
      return {
        getEncoding: vi.fn(() => ({
          encode: (text: string): number[] => Array.from(text).map((_, index: number) => index)
        }))
      };
    });

    const tokenEstimatorModule = await import('@/components/BChatSidebar/utils/compression/tokenEstimator');

    expect(moduleLoadCount).toBe(0);

    const estimator = await tokenEstimatorModule.createTokenEstimator('gpt-4o');

    expect(moduleLoadCount).toBe(1);
    expect(estimator?.estimateText('hello')).toBe(5);
  });
});
