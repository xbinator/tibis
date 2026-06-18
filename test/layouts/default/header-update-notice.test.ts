/**
 * @file header-update-notice.test.ts
 * @description 标题栏更新提示延迟检查测试。
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderUpdateNotice from '@/layouts/default/components/HeaderUpdateNotice.vue';

/** 检查更新 mock。 */
const checkForUpdateMock = vi.hoisted(() => vi.fn());
/** 打开外部链接 mock。 */
const openExternalMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    checkForUpdate: checkForUpdateMock,
    openExternal: openExternalMock
  })
}));

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    template: '<span />'
  }
}));

describe('HeaderUpdateNotice', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
    window.localStorage.clear();
    checkForUpdateMock.mockReset();
    openExternalMock.mockReset();
    checkForUpdateMock.mockResolvedValue({ available: false });
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('checks for updates after the startup delay instead of during initial mount', async (): Promise<void> => {
    mount(HeaderUpdateNotice);

    expect(checkForUpdateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);
    await flushPromises();

    expect(checkForUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('cancels the delayed update check when unmounted before the delay ends', async (): Promise<void> => {
    const wrapper = mount(HeaderUpdateNotice);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(2500);
    await flushPromises();

    expect(checkForUpdateMock).not.toHaveBeenCalled();
  });
});
