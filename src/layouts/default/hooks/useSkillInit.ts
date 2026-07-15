/**
 * @file useSkillInit.ts
 * @description 默认布局的 Skill 目录索引初始化与直接子目录监听 hook。
 */
import { onMounted, onUnmounted } from 'vue';
import { joinPath } from '@/ai/skill';
import { native } from '@/shared/platform';
import { useSkillStore } from '@/stores/ai/skill';
import { storeEvents } from '@/stores/helpers/events';

/**
 * 统一资源路径分隔符并移除末尾斜杠。
 * @param resourcePath - 原始资源路径
 * @returns 规范化路径
 */
function normalizeResourcePath(resourcePath: string): string {
  return resourcePath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * 初始化 Skill Store 的目录索引与目录监听。
 */
export function useSkillInit(): void {
  const skillStore = useSkillStore();
  skillStore.prepareInitialization();

  /** 组件是否已经卸载。 */
  let disposed = false;
  /** 组件卸载时需要执行的监听清理函数。 */
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  // 通用编辑器成功写盘后直接同步 Store，避免已缓存内容在当前应用生命周期内过期。
  cleanupCallbacks.push(
    storeEvents.onFileSaved(({ filePath, content }): void => {
      skillStore.handleFileSaved(filePath, content);
    })
  );

  /**
   * 执行并清空当前注册的清理函数。
   */
  function runCleanups(): void {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      const result = cleanup();
      if (result instanceof Promise) {
        result.catch((error: unknown): void => {
          console.error('Skill cleanup failed:', error);
        });
      }
    }
  }

  onMounted(async (): Promise<void> => {
    try {
      const homeDir = await native.getHomeDir();
      const resourceRoot = normalizeResourcePath(joinPath(homeDir, '.agents', 'skills'));
      if (disposed) {
        return;
      }

      // 先订阅目录事件，再注册主进程 watcher，避免扫描窗口内遗漏目录增删。
      const removeDirectoryListener = native.onDirectoryChanged((event): void => {
        if (normalizeResourcePath(event.rootPath) === resourceRoot) {
          skillStore.handleSkillDirectory(event.type, normalizeResourcePath(event.dirPath));
        }
      });
      cleanupCallbacks.push(removeDirectoryListener);

      await native.watchResourceDirectory(resourceRoot);
      if (disposed) {
        await native.unwatchResourceDirectory(resourceRoot);
        return;
      }

      cleanupCallbacks.push((): Promise<void> => native.unwatchResourceDirectory(resourceRoot));
      await skillStore.init(homeDir, native);
    } catch (error: unknown) {
      console.error('Skill initialization failed:', error);
      skillStore.finishInitialization();
    }
  });

  onUnmounted((): void => {
    disposed = true;
    runCleanups();
  });
}
