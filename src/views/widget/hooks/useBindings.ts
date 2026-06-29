/**
 * @file useBindings.ts
 * @description 为Widget文件会话绑定全局文件菜单事件。
 */
import type { Ref } from 'vue';
import { onUnmounted } from 'vue';
import { emitter } from '@/utils/emitter';

/**
 * Widget文件菜单动作集合。
 */
interface WidgetFileActions {
  /** 保存文件 */
  onSave: () => Promise<void>;
  /** 另存文件 */
  onSaveAs: () => Promise<void>;
  /** 重命名文件 */
  onRename: () => Promise<void>;
  /** 删除文件 */
  onDelete: () => Promise<void>;
}

/**
 * Widget文件菜单绑定配置。
 */
interface UseWidgetBindingsOptions {
  /** 当前Widget文件是否处于活跃标签页 */
  isActive: Ref<boolean>;
  /** 文件菜单动作 */
  actions: WidgetFileActions;
}

/**
 * 为Widget页面注册全局文件菜单事件。
 * @param options - 绑定配置
 * @returns 解绑控制器
 */
export function useBindings(options: UseWidgetBindingsOptions): { unregister: () => void } {
  const { isActive, actions } = options;

  /**
   * 仅在当前 KeepAlive 实例活跃时执行动作。
   * @param action - 文件动作
   */
  async function runWhenActive(action: () => Promise<void>): Promise<void> {
    if (!isActive.value) {
      return;
    }

    await action();
  }

  const unregisters = [
    emitter.on('file:save', () => {
      runWhenActive(actions.onSave);
    }),
    emitter.on('file:saveAs', () => {
      runWhenActive(actions.onSaveAs);
    }),
    emitter.on('file:rename', () => {
      runWhenActive(actions.onRename);
    }),
    emitter.on('file:delete', () => {
      runWhenActive(actions.onDelete);
    })
  ];

  /**
   * 注销所有全局文件菜单事件。
   */
  function unregister(): void {
    unregisters.forEach((cleanup: () => void): void => {
      cleanup();
    });
  }

  onUnmounted(unregister);

  return {
    unregister
  };
}
