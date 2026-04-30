/**
 * @file index.test.ts
 * @description 验证日志页将状态内聚到页面后仍能正确加载、筛选和分页。
 */
/* @vitest-environment jsdom */

import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '@/shared/logger/types';
import type { LogFilterBarDataItem } from '@/views/settings/logger/components/LogFilterBar.vue';
import LoggerView from '@/views/settings/logger/index.vue';

/** 模拟日志查询方法。 */
const { getLogsMock } = vi.hoisted(() => ({
  getLogsMock: vi.fn()
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    getLogs: getLogsMock,
    openLogFolder: vi.fn()
  }
}));

/**
 * 创建测试日志条目。
 * @param message - 日志消息。
 * @returns 测试日志条目。
 */
function createEntry(message: string): LogEntry {
  return {
    timestamp: '2026-04-30 12:00:00.000',
    level: 'INFO',
    scope: 'renderer',
    message
  };
}

/**
 * 挂载日志页面。
 * @returns 挂载结果。
 */
function mountLoggerView(): VueWrapper {
  return mount(LoggerView, {
    global: {
      stubs: {
        BScrollbar: {
          emits: ['scroll'],
          template: '<div class="scroll-stub" @scroll="$emit(\'scroll\', $event)"><slot /></div>'
        },
        ASpin: {
          template: '<div class="spin-stub"></div>'
        },
        LogTimeline: {
          props: ['entry'],
          template: '<div class="timeline-stub">{{ entry.message }}</div>'
        },
        LogFilterBar: defineComponent({
          name: 'LogFilterBar',
          props: {
            count: {
              type: Number,
              required: true
            },
            value: {
              type: Object,
              required: true
            }
          },
          emits: ['update:value', 'change'],
          template: '<div class="filter-stub"></div>'
        })
      }
    }
  });
}

/**
 * 创建日志筛选栏数据对象。
 * @param overrides - 覆盖字段。
 * @returns 日志筛选栏数据对象。
 */
function createDataItem(overrides: Partial<LogFilterBarDataItem> = {}): LogFilterBarDataItem {
  return {
    level: '',
    keyword: '',
    date: '',
    ...overrides
  };
}

describe('LoggerView', () => {
  beforeEach(() => {
    getLogsMock.mockReset();
  });

  it('loads logs on mount with the default page size', async () => {
    getLogsMock.mockResolvedValue([createEntry('first')]);

    mountLoggerView();
    await nextTick();
    await nextTick();

    expect(getLogsMock).toHaveBeenCalledWith({
      limit: 100,
      offset: 0
    });
  });

  it('resets pagination when a filter changes', async () => {
    getLogsMock.mockResolvedValueOnce([createEntry('first')]).mockResolvedValueOnce([createEntry('filtered')]);

    const wrapper = mountLoggerView();
    await nextTick();
    await nextTick();

    wrapper.getComponent({ name: 'LogFilterBar' }).vm.$emit('update:value', createDataItem({ keyword: 'timeout' }));
    wrapper.getComponent({ name: 'LogFilterBar' }).vm.$emit('change', createDataItem({ keyword: 'timeout' }));
    await nextTick();
    await nextTick();

    expect(getLogsMock).toHaveBeenLastCalledWith({
      keyword: 'timeout',
      limit: 100,
      offset: 0
    });
  });

  it('restores pagination after reset and requests the next page on scroll', async () => {
    getLogsMock
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => createEntry(`entry-${index}`)))
      .mockResolvedValueOnce([createEntry('next-page')])
      .mockResolvedValueOnce([createEntry('refreshed')]);

    const wrapper = mountLoggerView();
    await nextTick();
    await nextTick();

    const scrollHost = wrapper.get('.scroll-stub').element as HTMLElement;
    Object.defineProperties(scrollHost, {
      scrollTop: { configurable: true, value: 60 },
      scrollHeight: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 20 }
    });

    await wrapper.get('.scroll-stub').trigger('scroll');
    await nextTick();
    await nextTick();

    expect(getLogsMock).toHaveBeenNthCalledWith(2, {
      limit: 100,
      offset: 100
    });

    wrapper.getComponent({ name: 'LogFilterBar' }).vm.$emit('update:value', createDataItem({ level: 'ERROR' }));
    wrapper.getComponent({ name: 'LogFilterBar' }).vm.$emit('change', createDataItem({ level: 'ERROR' }));
    await nextTick();
    await nextTick();

    expect(getLogsMock).toHaveBeenNthCalledWith(3, {
      level: 'ERROR',
      limit: 100,
      offset: 0
    });
  });
});
