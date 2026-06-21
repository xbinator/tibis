/**
 * @file use-shortcuts.test.ts
 * @description 验证全局快捷键 Hook 的重复按键行为。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { useShortcuts } from '@/hooks/useShortcuts';

/**
 * 派发键盘事件到全局窗口。
 * @param type - 键盘事件类型
 * @param options - 键盘事件参数
 */
function dispatchWindowKeyboardEvent(type: 'keydown' | 'keyup', options: KeyboardEventInit): void {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      ...options
    })
  );
}

/**
 * 挂载使用 useShortcuts 的测试组件。
 * @param setupShortcuts - 快捷键注册逻辑
 */
function mountShortcuts(setupShortcuts: () => void): VueWrapper {
  return mount(
    defineComponent({
      setup() {
        setupShortcuts();
        return () => null;
      }
    }),
    { attachTo: document.body }
  );
}

describe('useShortcuts', (): void => {
  it('repeats repeatable shortcuts while the key is held', async (): Promise<void> => {
    const handler = vi.fn();

    mountShortcuts((): void => {
      const { registerShortcut } = useShortcuts();
      registerShortcut({ key: 'Ctrl+Z', handler, repeatable: true });
    });
    await nextTick();

    dispatchWindowKeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true });
    dispatchWindowKeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, repeat: true });
    await nextTick();

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
