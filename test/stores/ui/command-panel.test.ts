/**
 * @file command-panel.test.ts
 * @description 命令面板 Store 测试，覆盖全局打开状态、输入状态和关闭回调。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommandPanelStore } from '@/stores/ui/commandPanel';

describe('useCommandPanelStore', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('opens recent scope and resets keyword', (): void => {
    const store = useCommandPanelStore();

    store.setKeyword('alpha');
    store.openRecent();

    expect(store.visible).toBe(true);
    expect(store.scope).toBe('recent');
    expect(store.keyword).toBe('');
  });

  it('opens model scope and runs close callback once', (): void => {
    const store = useCommandPanelStore();
    const onClose = vi.fn();

    store.openModel({ onClose });
    store.setKeyword('qwen');
    store.close();
    store.close();

    expect(store.visible).toBe(false);
    expect(store.scope).toBe('model');
    expect(store.keyword).toBe('');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
