/**
 * @file useMenuAction.test.ts
 * @description 验证系统菜单 action 能切换编辑器页宽。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuAction } from '@/hooks/useMenuAction';

const storage = new Map<string, string>();
const menuCallbacks: Array<(action: string) => void> = [];

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: {
    onMenuAction(callback: (action: string) => void): () => void {
      menuCallbacks.push(callback);
      return () => undefined;
    },
    updateMenuItem: vi.fn(),
    setWindowTitle: vi.fn(async () => undefined)
  }
}));

/**
 * 调用 useMenuAction 的测试挂载组件。
 */
const HookHarness = defineComponent({
  name: 'UseMenuActionHarness',
  setup() {
    useMenuAction();
    return () => null;
  }
});

describe('useMenuAction', () => {
  beforeEach(() => {
    storage.clear();
    menuCallbacks.length = 0;
    setActivePinia(createPinia());
  });

  it('maps page-width menu actions to setting store updates', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    mount(HookHarness);

    const settingStore = useSettingStore();

    menuCallbacks[0]?.('view:pageWidth:wide');
    expect(settingStore.editorPageWidth).toBe('wide');

    menuCallbacks[0]?.('view:pageWidth:full');
    expect(settingStore.editorPageWidth).toBe('full');

    menuCallbacks[0]?.('view:pageWidth:default');
    expect(settingStore.editorPageWidth).toBe('default');
  });
});
