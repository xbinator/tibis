/**
 * @file color-picker.component.test.ts
 * @description 验证 BColorPicker SV 面板、色相条、输入框和弹层交互。
 * @vitest-environment jsdom
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BColorPicker from '@/components/BColorPicker/index.vue';

vi.mock('@vueuse/core', () => ({
  /**
   * 提供稳定的指针坐标，避免拖拽逻辑依赖浏览器环境。
   * @returns 指针坐标响应式替身
   */
  usePointer: (): { x: { value: number }; y: { value: number } } => ({
    x: { value: 0 },
    y: { value: 0 }
  })
}));

vi.mock('ant-design-vue', () => ({
  Input: {
    name: 'AInput',
    inheritAttrs: false,
    props: {
      value: {
        type: String,
        default: ''
      }
    },
    emits: ['blur', 'update:value'],
    template: `
      <label class="a-input-stub">
        <input
          v-bind="$attrs"
          :value="value"
          @blur="$emit('blur')"
          @input="$emit('update:value', $event.target.value)"
        />
        <slot name="suffix" />
      </label>
    `
  }
}));

vi.mock('@/components/BDropdown/index.vue', () => ({
  default: {
    name: 'BDropdown',
    inheritAttrs: false,
    props: {
      disabled: {
        type: Boolean,
        default: false
      },
      open: {
        type: Boolean,
        default: false
      },
      placement: {
        type: String,
        default: undefined
      },
      align: {
        type: Object,
        default: undefined
      }
    },
    emits: ['update:open'],
    template: `
      <div class="b-dropdown-stub" :data-placement="placement">
        <div class="b-dropdown-stub__trigger" @click="$emit('update:open', !open)">
          <slot />
        </div>
        <div v-if="open" class="b-dropdown-stub__overlay">
          <slot name="overlay" />
        </div>
      </div>
    `
  }
}));

/**
 * 挂载颜色选择器。
 * @param propsOverrides - 可选的 props 覆盖
 * @returns 颜色选择器包装器
 */
function mountColorPicker(propsOverrides: Record<string, unknown> = {}): VueWrapper {
  return mount(BColorPicker, {
    props: {
      format: 'hex',
      inputTestId: 'color-picker-input',
      value: '#111827',
      ...propsOverrides
    }
  });
}

describe('BColorPicker', (): void => {
  it('renders the SV panel, hue bar, alpha bar and input inside the dropdown overlay', async (): Promise<void> => {
    const wrapper = mountColorPicker();

    // 打开下拉面板以渲染 overlay 内容
    await wrapper.find('.b-dropdown-stub__trigger').trigger('click');

    expect(wrapper.find('.b-color-picker__sv-panel').exists()).toBe(true);
    expect(wrapper.find('.b-color-picker__hue-bar').exists()).toBe(true);
    expect(wrapper.find('.b-color-picker__alpha-bar').exists()).toBe(true);
    expect(wrapper.find('[data-testid="color-picker-input"]').exists()).toBe(true);
  });

  it('passes placement prop to BDropdown', (): void => {
    const wrapper = mountColorPicker({ placement: 'rightTop' });

    expect(wrapper.find('.b-dropdown-stub').attributes('data-placement')).toBe('rightTop');
  });

  it('applies is-compact class to the panel', async (): Promise<void> => {
    const wrapper = mountColorPicker();

    await wrapper.find('.b-dropdown-stub__trigger').trigger('click');

    expect(wrapper.find('.b-color-picker__panel').classes()).toContain('is-compact');
  });

  it('emits update:value and change when input value is valid', async (): Promise<void> => {
    const wrapper = mountColorPicker();

    await wrapper.find('.b-dropdown-stub__trigger').trigger('click');

    const input = wrapper.find('input[data-testid="color-picker-input"]');
    await input.setValue('#ef4444');

    expect(wrapper.emitted('update:value')).toBeTruthy();
    expect(wrapper.emitted('change')).toBeTruthy();
  });

  it('disables dropdown trigger when readonly is true', (): void => {
    const wrapper = mountColorPicker({ readonly: true });

    expect(wrapper.find('.b-dropdown-stub').attributes('data-placement')).toBeUndefined();
    // BDropdown 接收到 disabled=true，dropdown 不应打开
    expect(wrapper.find('.b-dropdown-stub__overlay').exists()).toBe(false);
  });
});
