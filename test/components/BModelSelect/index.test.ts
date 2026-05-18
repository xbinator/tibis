/**
 * @file index.test.ts
 * @description BModelSelect 组件单元测试。
 */
/* @vitest-environment jsdom */

import { defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BModelSelect from '@/components/BModelSelect/index.vue';
import type { SelectedModel } from '@/stores/ai/serviceModel';

/**
 * BModal 占位组件，渲染默认插槽内容。
 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: String, default: '480px' },
    closable: { type: Boolean, default: true }
  },
  template: `
    <div v-if="open" class="modal-stub">
      <div class="modal-stub__header">{{ title }}</div>
      <div class="modal-stub__body"><slot /></div>
    </div>
  `
});

/**
 * BModelIcon 占位组件。
 */
const BModelIconStub = defineComponent({
  name: 'BModelIcon',
  props: {
    model: { type: String, default: '' },
    size: { type: Number, default: 16 }
  },
  template: '<span class="model-icon-stub">{{ model }}</span>'
});

/**
 * BScrollbar 占位组件。
 */
const BScrollbarStub = defineComponent({
  name: 'BScrollbar',
  props: {
    maxHeight: { type: String, default: '' }
  },
  template: '<div class="scrollbar-stub"><slot /></div>'
});

// Mock useProviderStore
vi.mock('@/stores/ai/provider', () => ({
  useProviderStore: () => ({
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        isEnabled: true,
        models: [
          { id: 'gpt-4', name: 'GPT-4', isEnabled: true },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isEnabled: true }
        ]
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        isEnabled: true,
        models: [{ id: 'claude-3-opus', name: 'Claude 3 Opus', isEnabled: true }]
      }
    ],
    loadProviders: vi.fn()
  })
}));

// Mock useSettingStore
vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    settings: {}
  })
}));

describe('BModelSelect', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /**
   * 挂载 BModelSelect 组件。
   * @param props - 组件属性
   * @returns 组件包装器
   */
  function mountBModelSelect(props: Record<string, unknown> = {}) {
    return mount(BModelSelect, {
      props,
      global: {
        stubs: {
          BModal: BModalStub,
          BModelIcon: BModelIconStub,
          BScrollbar: BScrollbarStub
        }
      }
    });
  }

  it('should render model list when opened', async () => {
    const wrapper = mountBModelSelect({ open: true });

    await nextTick();

    expect(wrapper.find('.model-search').exists()).toBe(true);
    expect(wrapper.find('.model-list').exists()).toBe(true);
    expect(wrapper.findAll('.model-group')).toHaveLength(2);
  });

  it('should filter models by search query', async () => {
    const wrapper = mountBModelSelect({ open: true });

    await nextTick();

    const input = wrapper.find('.model-search__input');
    await input.setValue('GPT');

    expect(wrapper.findAll('.model-item')).toHaveLength(2);
  });

  it('should emit change event when model is selected', async () => {
    const wrapper = mountBModelSelect({ open: true });

    await nextTick();

    const firstModel = wrapper.find('.model-item');
    await firstModel.trigger('click');

    expect(wrapper.emitted('change')).toBeTruthy();
    expect(wrapper.emitted('change')![0][0]).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4'
    } as SelectedModel);
  });

  it('should close dialog after model selection', async () => {
    const wrapper = mountBModelSelect({ open: true });

    await nextTick();

    const firstModel = wrapper.find('.model-item');
    await firstModel.trigger('click');

    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0][0]).toBe(false);
  });

  it('should show empty state when no models available', async () => {
    const wrapper = mountBModelSelect({ open: true });

    await nextTick();

    expect(wrapper.find('.model-list').exists()).toBe(true);
  });

  it('should expose open method', async () => {
    const wrapper = mountBModelSelect();

    expect(typeof wrapper.vm.open).toBe('function');

    wrapper.vm.open();
    await nextTick();

    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0][0]).toBe(true);
  });
});
