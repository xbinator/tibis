/**
 * @file index.test.ts
 * @description 验证 BSegmented 的选项渲染、模型更新、禁用态、自定义标签与懒渲染内容。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BSegmented from '@/components/BSegmented/index.vue';
import type { BSegmentedOption, BSegmentedValue } from '@/components/BSegmented/types';

/**
 * ResizeObserver 测试替身，用固定宽度触发布局同步。
 */
class ResizeObserverMock {
  /**
   * 创建 ResizeObserver 替身。
   * @param callback - 观察回调
   */
  public constructor(private readonly callback: ResizeObserverCallback) {}

  /**
   * 开始观察并立即派发一次尺寸。
   * @param target - 被观察元素
   */
  public observe(target: Element): void {
    this.callback([{ target, contentRect: new DOMRect(0, 0, 300, 32) } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  /**
   * 取消单个元素观察，测试无需实现。
   */
  public unobserve(): void {}

  /**
   * 取消全部观察，测试无需实现。
   */
  public disconnect(): void {}
}

/** 测试用选项。 */
const OPTIONS: BSegmentedOption[] = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right', disabled: true }
];

/**
 * 挂载分段控制组件。
 * @param props - props 覆盖
 * @returns Vue Test Utils 包装器
 */
function mountSegmented(props: { value?: BSegmentedValue; options?: BSegmentedOption[] } = {}): VueWrapper {
  return mount(BSegmented, {
    props: {
      options: props.options ?? OPTIONS,
      value: props.value
    },
    attachTo: document.body
  });
}

describe('BSegmented', (): void => {
  beforeEach((): void => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders labels from options', (): void => {
    const wrapper = mountSegmented({ value: 'left' });

    expect(wrapper.text()).toContain('左对齐');
    expect(wrapper.text()).toContain('居中');
    expect(wrapper.text()).toContain('右对齐');
  });

  it('defaults to the first enabled option when value is unset', async (): Promise<void> => {
    const wrapper = mountSegmented();

    await nextTick();

    expect(wrapper.findAll('.b-segmented__tab')[0].classes()).toContain('is-active');
    expect(wrapper.emitted('update:value')?.[0]).toEqual(['left']);
  });

  it('emits update:value and change when clicking another option', async (): Promise<void> => {
    const wrapper = mountSegmented({ value: 'left' });

    await wrapper.findAll('.b-segmented__tab')[1].trigger('click');

    expect(wrapper.emitted('update:value')?.[0]).toEqual(['center']);
    expect(wrapper.emitted('change')?.[0]).toEqual(['center', OPTIONS[1]]);
  });

  it('does not switch to a disabled option', async (): Promise<void> => {
    const wrapper = mountSegmented({ value: 'left' });

    await wrapper.findAll('.b-segmented__tab')[2].trigger('click');

    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.findAll('.b-segmented__tab')[0].classes()).toContain('is-active');
  });

  it('renders the label slot with the option record', (): void => {
    const wrapper = mount(BSegmented, {
      props: {
        value: 'left',
        options: OPTIONS
      },
      slots: {
        label: '<template #label="{ record, active }"><span class="custom-label">{{ record.value }}:{{ active }}</span></template>'
      }
    });

    expect(wrapper.find('.custom-label').text()).toBe('left:true');
  });

  it('lazily renders named content slots after activation', async (): Promise<void> => {
    const Host = defineComponent({
      components: { BSegmented },
      setup(): { active: Ref<BSegmentedValue>; options: BSegmentedOption[] } {
        /** 当前激活项。 */
        const active = ref<BSegmentedValue>('left');

        return { active, options: OPTIONS };
      },
      template: `
        <BSegmented v-model:value="active" :options="options">
          <template #left><div class="left-panel">left panel</div></template>
          <template #center><div class="center-panel">center panel</div></template>
        </BSegmented>
      `
    });
    const wrapper = mount(Host);

    expect(wrapper.find('.left-panel').exists()).toBe(true);
    expect(wrapper.find('.center-panel').exists()).toBe(false);

    await wrapper.findAll('.b-segmented__tab')[1].trigger('click');

    expect(wrapper.find('.center-panel').exists()).toBe(true);
  });
});
