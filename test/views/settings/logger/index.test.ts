/**
 * @file index.test.ts
 * @description 运行日志设置页主动刷新行为测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoggerSettings from '@/views/settings/logger/index.vue';

/** Logger API mock。 */
const loggerMock = vi.hoisted(() => ({
  getLogFiles: vi.fn<() => Promise<Array<{ name: string; size: number; createdAt: string }>>>(),
  getLogs: vi.fn<() => Promise<unknown[]>>()
}));

/** 可由测试控制完成时机的 Promise。 */
interface Deferred<T> {
  /** 延迟 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

vi.mock('@/shared/logger', () => ({
  logger: loggerMock
}));

/** 设置页面测试替身，保留操作区插槽。 */
const SettingsPageStub = defineComponent({
  name: 'SettingsPage',
  template: '<section><header><slot name="extra" /></header><main><slot /></main></section>'
});

/** 日志筛选栏测试替身。 */
const LogFilterBarStub = defineComponent({
  name: 'LogFilterBar',
  props: {
    value: { type: Object, required: true },
    availableDates: { type: Array, default: () => [] }
  },
  emits: ['update:value', 'change'],
  template: '<div class="log-filter-bar-stub"></div>'
});

/** 滚动容器测试替身。 */
const BScrollbarStub = defineComponent({
  name: 'BScrollbar',
  emits: ['scroll'],
  template: '<div><slot /></div>'
});

/** 按钮测试替身。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    loading: { type: Boolean, default: false }
  },
  emits: ['click'],
  template: '<button type="button" :disabled="loading" @click="$emit(\'click\')"><slot /></button>'
});

/**
 * 挂载运行日志设置页。
 * @returns 页面组件包装器
 */
function mountLoggerSettings(): VueWrapper {
  return mount(LoggerSettings, {
    global: {
      stubs: {
        ASpin: true,
        BButton: BButtonStub,
        BScrollbar: BScrollbarStub,
        LogFilterBar: LogFilterBarStub,
        LogTimeline: true,
        SettingsPage: SettingsPageStub
      }
    }
  });
}

/**
 * 按稳定的用户可见文案查找刷新按钮。
 * @param wrapper - 页面组件包装器
 * @returns 刷新按钮包装器
 */
function findRefreshButton(wrapper: VueWrapper): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll<HTMLButtonElement>('button').find((item: DOMWrapper<HTMLButtonElement>): boolean => item.text().trim() === '刷新');
  if (!button) throw new Error('未找到刷新按钮');
  return button;
}

describe('LoggerSettings', (): void => {
  beforeEach((): void => {
    loggerMock.getLogFiles.mockReset();
    loggerMock.getLogs.mockReset();
    loggerMock.getLogFiles.mockResolvedValue([]);
    loggerMock.getLogs.mockResolvedValue([]);
  });

  it('reloads log files and current logs when refresh is clicked', async (): Promise<void> => {
    const wrapper = mountLoggerSettings();
    await flushPromises();
    loggerMock.getLogFiles.mockClear();
    loggerMock.getLogs.mockClear();

    await findRefreshButton(wrapper).trigger('click');
    await flushPromises();

    expect(loggerMock.getLogFiles).toHaveBeenCalledTimes(1);
    expect(loggerMock.getLogs).toHaveBeenCalledTimes(1);
    expect(loggerMock.getLogs).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });

  it('disables the refresh button and prevents repeated requests while loading', async (): Promise<void> => {
    const wrapper = mountLoggerSettings();
    await flushPromises();
    const deferredLogs = createDeferred<unknown[]>();
    loggerMock.getLogs.mockClear();
    loggerMock.getLogs.mockReturnValue(deferredLogs.promise);

    const refreshButton = findRefreshButton(wrapper);
    await refreshButton.trigger('click');
    await wrapper.vm.$nextTick();

    expect(refreshButton.attributes('disabled')).toBeDefined();
    await refreshButton.trigger('click');
    expect(loggerMock.getLogs).toHaveBeenCalledTimes(1);

    deferredLogs.resolve([]);
    await flushPromises();
  });
});
