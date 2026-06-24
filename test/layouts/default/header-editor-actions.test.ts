/**
 * @file header-editor-actions.test.ts
 * @description HeaderEditorActions 组件测试，覆盖有工具栏数据时的尾部分割线渲染。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderEditorActions from '@/layouts/default/components/HeaderEditorActions.vue';
import { useHeaderToolbarStore } from '@/stores/ui/headerToolbar';

/**
 * 挂载 HeaderEditorActions 测试组件。
 * @returns Vue Test Utils 包装器
 */
function mountHeaderEditorActions(): ReturnType<typeof shallowMount> {
  return shallowMount(HeaderEditorActions, {
    global: {
      stubs: {
        BButton: true,
        BDropdown: true,
        BDropdownMenu: true,
        BIcon: true
      }
    }
  });
}

describe('HeaderEditorActions', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('renders a trailing divider only when toolbar items are visible', (): void => {
    const store = useHeaderToolbarStore();

    const emptyWrapper = mountHeaderEditorActions();

    expect(emptyWrapper.find('.header-editor-actions').exists()).toBe(false);

    store.register('editor-a', [
      {
        type: 'action',
        key: 'outline',
        icon: 'lucide:list',
        tooltip: '显示大纲',
        onClick: vi.fn()
      }
    ]);

    const wrapper = mountHeaderEditorActions();

    expect(wrapper.find('.header-editor-actions').exists()).toBe(true);
    expect(wrapper.find('.header-editor-actions__trailing-divider').exists()).toBe(true);
  });
});
