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

  it('uses and clears the caller model context', async (): Promise<void> => {
    const store = useCommandPanelStore();
    const onModelChange = vi.fn<(_model: { providerId: string; modelId: string }) => Promise<void>>().mockResolvedValue(undefined);
    const currentModel = { providerId: 'provider-1', modelId: 'model-2' };

    store.openModel({
      modelContext: {
        getCurrentModel: (): typeof currentModel => currentModel,
        onModelChange
      }
    });

    expect(store.getContextModel()).toEqual(currentModel);
    await expect(store.changeContextModel({ providerId: 'provider-1', modelId: 'model-3' })).resolves.toBe(true);
    expect(onModelChange).toHaveBeenCalledWith({ providerId: 'provider-1', modelId: 'model-3' });

    store.close();
    expect(store.getContextModel()).toBeUndefined();
    await expect(store.changeContextModel(currentModel)).resolves.toBe(false);
  });
});
