/**
 * @file settings-pagination.test.ts
 * @description 验证设置页私有分页容器承接列表底部样式并透传分页参数。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs';
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsPagination from '@/views/settings/_components/SettingsPagination.vue';

/**
 * BPagination 测试替身，暴露接收到的分页参数。
 */
const BPaginationStub = defineComponent({
  name: 'BPagination',
  props: {
    current: { type: Number, required: true },
    total: { type: Number, required: true },
    pageSize: { type: Number, required: true }
  },
  emits: ['update:current'],
  template: `
    <button
      class="b-pagination-stub"
      :data-current="current"
      :data-total="total"
      :data-page-size="pageSize"
      @click="$emit('update:current', current + 1)"
    >
      分页
    </button>
  `
});

/**
 * 挂载设置页分页容器。
 * @param props - 分页属性
 * @returns 组件包装器
 */
function mountSettingsPagination(props: { current: number; total: number; pageSize: number }): VueWrapper {
  return mount(SettingsPagination, {
    props,
    global: {
      stubs: {
        BPagination: BPaginationStub
      }
    }
  });
}

/**
 * 读取设置页分页容器源码。
 * @returns 组件源码文本
 */
function readSettingsPaginationSource(): string {
  return readFileSync('src/views/settings/_components/SettingsPagination.vue', 'utf8');
}

describe('SettingsPagination', (): void => {
  it('hides the settings pagination container when there is only one page', (): void => {
    const wrapper = mountSettingsPagination({ current: 1, total: 8, pageSize: 8 });

    expect(wrapper.find('.settings-pagination').exists()).toBe(false);
    expect(wrapper.find('.b-pagination-stub').exists()).toBe(false);
  });

  it('wraps BPagination and forwards current page updates', async (): Promise<void> => {
    const wrapper = mountSettingsPagination({ current: 2, total: 20, pageSize: 8 });

    expect(wrapper.find('.settings-pagination').exists()).toBe(true);
    expect(wrapper.find('.b-pagination-stub').attributes('data-current')).toBe('2');
    expect(wrapper.find('.b-pagination-stub').attributes('data-total')).toBe('20');
    expect(wrapper.find('.b-pagination-stub').attributes('data-page-size')).toBe('8');

    await wrapper.find('.b-pagination-stub').trigger('click');

    expect(wrapper.emitted('update:current')?.[0]).toEqual([3]);
  });

  it('keeps the settings list footer chrome outside BPagination', (): void => {
    const source = readSettingsPaginationSource();

    expect(source).toContain('border-top');
    expect(source).toContain('padding: 12px 20px');
  });
});
