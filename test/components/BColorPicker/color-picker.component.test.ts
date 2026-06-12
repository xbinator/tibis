/**
 * @file color-picker.component.test.ts
 * @description 验证 BColorPicker 预设色、自定义颜色入口和紧凑弹层交互。
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
    props: {
      disabled: {
        type: Boolean,
        default: false
      },
      open: {
        type: Boolean,
        default: false
      }
    },
    emits: ['update:open'],
    template: `
      <div class="b-dropdown-stub" :data-placement="$attrs.placement">
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
 * @returns 颜色选择器包装器
 */
function mountColorPicker(): VueWrapper {
  return mount(BColorPicker, {
    props: {
      format: 'hex',
      inputTestId: 'color-picker-input',
      presetColors: ['#111827', '#ef4444', '#3b82f6'],
      value: '#111827'
    }
  });
}

describe('BColorPicker', (): void => {
  it('emits color changes when selecting a preset swatch', async (): Promise<void> => {
    const wrapper = mountColorPicker();

    await wrapper.find('[data-testid="color-picker-preset-#ef4444"]').trigger('click');

    expect(wrapper.emitted('change')).toEqual([['#ef4444']]);
    expect(wrapper.emitted('update:value')).toEqual([['#ef4444']]);
    expect(wrapper.find('[data-testid="color-picker-input"]').exists()).toBe(false);
  });

  it('keeps manual input inside the custom color dropdown', async (): Promise<void> => {
    const wrapper = mountColorPicker();

    expect(wrapper.find('.b-dropdown-stub').attributes('data-placement')).toBe('topLeft');
    expect(wrapper.find('[data-testid="color-picker-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="color-picker-custom-divider"]').exists()).toBe(true);

    await wrapper.find('[data-testid="color-picker-custom-trigger"]').trigger('click');

    expect(wrapper.find('[data-testid="color-picker-input"]').exists()).toBe(true);
    expect(wrapper.find('.b-color-picker__panel').classes()).toContain('is-compact');
  });
});
