/**
 * @file use-help-active.test.ts
 * @description 验证默认布局帮助菜单的快捷键入口与主动检查更新入口。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolbarOption } from '@/components/BToolbar/types';
import { useHelpActive } from '@/layouts/default/hooks/useHelpActive';
import { emitter } from '@/utils/emitter';

const mocks = vi.hoisted(() => ({
  registerShortcuts: vi.fn<() => () => void>(() => vi.fn()),
  checkForUpdate: vi.fn(),
  openExternal: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn()
}));

vi.mock('@/components/BToolbar/hooks/useToolbarShortcuts', () => ({
  useToolbarShortcuts: () => ({
    register: mocks.registerShortcuts
  })
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    checkForUpdate: mocks.checkForUpdate,
    openExternal: mocks.openExternal
  })
}));

vi.mock('ant-design-vue', () => ({
  message: {
    success: mocks.messageSuccess,
    error: mocks.messageError
  }
}));

/**
 * 挂载使用帮助菜单 hook 的测试组件。
 * @returns 帮助菜单选项列表
 */
function mountHelpActive(): { options: ToolbarOption[]; wrapper: VueWrapper } {
  let options: ToolbarOption[] = [];

  const wrapper = mount(
    defineComponent({
      setup() {
        const visible = { searchRecent: false, shortcutsHelp: false };
        const { toolbarHelpOptions } = useHelpActive(visible);
        options = toolbarHelpOptions.value.filter((item): item is ToolbarOption => item.type !== 'divider');

        return () => null;
      }
    })
  );

  return { options, wrapper };
}

describe('useHelpActive', () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it('adds a help menu item that checks for updates and opens the release page', async (): Promise<void> => {
    mocks.checkForUpdate.mockResolvedValue({
      available: true,
      currentVersion: '0.1.14',
      latestVersion: '0.2.0',
      releaseUrl: 'https://github.com/xbinator/tibis/releases/tag/v0.2.0'
    });

    const { options, wrapper } = mountHelpActive();
    const updateOption = options.find((option) => option.value === 'check-update');

    expect(updateOption?.label).toBe('检查更新');

    await updateOption?.onClick?.();

    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/xbinator/tibis/releases/tag/v0.2.0');

    wrapper.unmount();
  });

  it('checks for updates when native menu action emits the help update event', async (): Promise<void> => {
    mocks.checkForUpdate.mockResolvedValue({
      available: false,
      currentVersion: '0.1.14',
      latestVersion: '0.1.14'
    });

    const { wrapper } = mountHelpActive();

    emitter.emit('help:checkUpdate');
    await Promise.resolve();

    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.messageSuccess).toHaveBeenCalledWith('当前已是最新版本');

    wrapper.unmount();
  });
});
