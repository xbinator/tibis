/**
 * @file model-selector.test.ts
 * @description BChat 输入工具栏模型选择器显示测试。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelSelector from '@/components/BChat/components/InputToolbar/ModelSelector.vue';

const mockLoadProviders = vi.hoisted(() => vi.fn<() => Promise<void>>());
const mockProviders = vi.hoisted(() => [
  {
    id: 'provider-1',
    name: 'Provider 1',
    isEnabled: true,
    models: [
      {
        id: 'model-1',
        name: 'Model 1',
        isEnabled: true
      }
    ]
  }
]);

vi.mock('@/stores/ai/provider', () => ({
  useProviderStore: () => ({
    providers: mockProviders,
    loadProviders: mockLoadProviders
  })
}));

vi.mock('@/components/BButton/index.vue', () => ({
  default: {
    name: 'BButton',
    template: '<button type="button"><slot /></button>'
  }
}));

vi.mock('@/components/BDropdown/index.vue', () => ({
  default: {
    name: 'BDropdown',
    props: {
      open: {
        type: Boolean,
        default: false
      }
    },
    emits: ['update:open'],
    template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>'
  }
}));

vi.mock('@/components/BModel/Icon.vue', () => ({
  default: {
    name: 'BModelIcon',
    template: '<span class="model-icon-stub"></span>'
  }
}));

describe('ModelSelector', (): void => {
  beforeEach((): void => {
    mockLoadProviders.mockResolvedValue(undefined);
  });

  it('shows a placeholder when no current model name is available', (): void => {
    const wrapper = mount(ModelSelector, {
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.model-name').text()).toBe('请选择模型');
  });
});
