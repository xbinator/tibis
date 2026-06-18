/**
 * @file memory-loading.test.ts
 * @description 记忆 Store 懒加载与并发加载测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from '@/stores/ai/memory';

/** 原生平台方法 mock。 */
const nativeMock = vi.hoisted(() => ({
  getHomeDir: vi.fn<() => Promise<string>>(),
  getPathStatus: vi.fn<(path: string) => Promise<{ exists: boolean }>>(),
  readFile: vi.fn<(path: string) => Promise<{ content: string; name: string; ext: string }>>()
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    ensureDir: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  })
}));

describe('memory store loading', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    nativeMock.getHomeDir.mockReset();
    nativeMock.getPathStatus.mockReset();
    nativeMock.readFile.mockReset();
    nativeMock.getHomeDir.mockResolvedValue('/Users/test');
    nativeMock.getPathStatus.mockResolvedValue({ exists: true });
    nativeMock.readFile.mockResolvedValue({
      content: '# MEMORY\n\n## Preferences\n- 喜欢 TypeScript',
      name: 'MEMORY',
      ext: 'md'
    });
  });

  it('coalesces concurrent loadMemory calls into one disk read', async (): Promise<void> => {
    const store = useMemoryStore();

    await Promise.all([store.loadMemory(), store.loadMemory()]);

    expect(store.loaded).toBe(true);
    expect(nativeMock.getPathStatus).toHaveBeenCalledTimes(1);
    expect(nativeMock.readFile).toHaveBeenCalledTimes(1);
  });
});
