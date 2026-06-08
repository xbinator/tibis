/**
 * @file useHelpActive.ts
 * @description 收口顶部帮助菜单的快捷键说明与更新检查行为。
 */
import { computed, onUnmounted } from 'vue';
import type { ComputedRef } from 'vue';
import { message } from 'ant-design-vue';
import { useToolbarShortcuts } from '@/components/BToolbar/hooks/useToolbarShortcuts';
import type { ToolbarOptions } from '@/components/BToolbar/types';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { emitter } from '@/utils/emitter';

/**
 * 帮助菜单依赖的可见状态。
 */
interface UseHelpOptions {
  /** 快捷键帮助弹窗是否可见。 */
  shortcutsHelp: boolean;
}

/**
 * 帮助菜单 hook 返回值。
 */
interface UseHelpActiveResult {
  /** 帮助菜单选项。 */
  toolbarHelpOptions: ComputedRef<ToolbarOptions>;
}

/**
 * 主动检查 GitHub Release 新版本，并在发现更新时打开下载页。
 */
async function handleCheckUpdate(): Promise<void> {
  try {
    const result = await getElectronAPI().checkForUpdate();

    if (!result.available) {
      message.success('当前已是最新版本');
      return;
    }

    await getElectronAPI().openExternal(result.releaseUrl);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '检查更新失败';

    message.error(errorMessage);
  }
}

/**
 * 绑定帮助菜单和全局帮助事件。
 * @param options - 帮助菜单依赖的可见状态
 * @returns 工具栏帮助菜单配置
 */
export function useHelpActive(options: UseHelpOptions): UseHelpActiveResult {
  const { register: registerShortcuts } = useToolbarShortcuts();

  const toolbarHelpOptions = computed<ToolbarOptions>(() => [
    {
      value: 'check-update',
      label: '检查更新',
      onClick: async () => {
        await handleCheckUpdate();
      }
    },
    { type: 'divider' },
    {
      value: 'shortcuts',
      label: '快捷键',
      shortcut: 'Ctrl+/',
      onClick: () => {
        options.shortcutsHelp = true;
      }
    }
  ]);

  const cleanup = registerShortcuts(toolbarHelpOptions.value);
  const unregisterShortcuts = emitter.on('help:shortcuts', () => {
    options.shortcutsHelp = true;
  });
  const unregisterCheckUpdate = emitter.on('help:checkUpdate', () => {
    handleCheckUpdate();
  });

  onUnmounted(() => {
    cleanup();
    unregisterShortcuts();
    unregisterCheckUpdate();
  });

  return {
    toolbarHelpOptions
  };
}
