/**
 * @file index.test.ts
 * @description 验证 BPagination 的显隐、翻页按钮和页码更新行为。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs';
import { defineComponent, h, type VNode } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BPagination from '@/components/BPagination/index.vue';

/**
 * Ant Pagination 测试替身，只暴露 BPagination 依赖的 itemRender 与 v-model 行为。
 */
const APaginationStub = defineComponent({
  name: 'APagination',
  props: {
    current: { type: Number, required: true },
    total: { type: Number, required: true },
    pageSize: { type: Number, required: true }
  },
  emits: ['update:current'],
  setup(props, { emit, slots }): () => VNode {
    /**
     * 渲染分页项插槽。
     * @param type - Ant Pagination 的分页项类型
     * @returns 分页项节点
     */
    function renderItem(type: 'prev' | 'next'): VNode[] {
      return slots.itemRender?.({ type, originalElement: null }) ?? [];
    }

    return (): VNode =>
      h('nav', { class: 'a-pagination-stub' }, [
        h(
          'div',
          {
            class: 'prev-trigger',
            onClick: (): void => emit('update:current', Math.max(1, props.current - 1))
          },
          renderItem('prev')
        ),
        h(
          'div',
          {
            class: 'next-trigger',
            onClick: (): void => emit('update:current', props.current + 1)
          },
          renderItem('next')
        )
      ]);
  }
});

/**
 * BButton 测试替身，保留分页组件关心的图标与按钮属性。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    icon: { type: String, default: '' },
    square: { type: Boolean, default: false },
    size: { type: String, default: 'middle' },
    type: { type: String, default: 'primary' }
  },
  template: '<button class="b-button-stub" :data-icon="icon" :data-square="String(square)" :data-size="size" :data-type="type"><slot /></button>'
});

/**
 * 挂载分页组件。
 * @param props - 分页属性
 * @returns 组件包装器
 */
function mountPagination(props: { current: number; total: number; pageSize: number }): VueWrapper {
  return mount(BPagination, {
    props,
    global: {
      stubs: {
        APagination: APaginationStub,
        BButton: BButtonStub
      }
    }
  });
}

/**
 * 读取分页组件源码。
 * @returns 分页组件源码文本
 */
function readPaginationSource(): string {
  return readFileSync('src/components/BPagination/index.vue', 'utf8');
}

describe('BPagination', (): void => {
  it('does not render when total does not exceed one page', (): void => {
    const wrapper = mountPagination({ current: 1, total: 8, pageSize: 8 });

    expect(wrapper.find('.b-pagination').exists()).toBe(false);
    expect(wrapper.find('.a-pagination-stub').exists()).toBe(false);
  });

  it('renders navigation buttons and forwards current page updates', async (): Promise<void> => {
    const wrapper = mountPagination({ current: 2, total: 20, pageSize: 8 });
    const buttons = wrapper.findAll('.b-button-stub');

    expect(wrapper.find('.b-pagination').exists()).toBe(true);
    expect(buttons[0].attributes('data-icon')).toBe('lucide:chevron-left');
    expect(buttons[0].attributes('data-square')).toBe('true');
    expect(buttons[0].attributes('data-size')).toBe('small');
    expect(buttons[0].attributes('data-type')).toBe('outline');
    expect(buttons[1].attributes('data-icon')).toBe('lucide:chevron-right');

    await wrapper.find('.next-trigger').trigger('click');

    expect(wrapper.emitted('update:current')?.[0]).toEqual([3]);
  });

  it('does not include settings-specific container chrome', (): void => {
    const source = readPaginationSource();

    expect(source).not.toContain('border-top');
    expect(source).not.toContain('padding: 12px 20px');
  });
});
