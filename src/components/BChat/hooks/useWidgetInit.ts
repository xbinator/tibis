/**
 * @file useWidgetInit.ts
 * @description 初始化 Widget Store，负责扫描小组件目录、监听目录变更及增量更新。
 */

import { onMounted, onUnmounted } from 'vue';
import { joinPath, parseWidgetJson } from '@/ai/widget';
import { native } from '@/shared/platform';
import type { ReadWorkspaceDirectoryOptions } from '@/shared/platform/native/types';
import { useWidgetStore } from '@/stores/ai/widget';

/**
 * 判断变更路径是否为用户小组件配置文件。
 * @param filePath - 原始文件路径
 * @returns 是否为 widget.json 路径
 */
function isWidgetJsonPath(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  return normalizedPath.includes('/.tibis/widgets/') && normalizedPath.endsWith('/widget.json');
}

/**
 * 初始化 Widget Store：扫描用户小组件目录并监听 widget.json 变化。
 */
export function useWidgetInit(): void {
  const widgetStore = useWidgetStore();

  /** 组件卸载时需要执行的小组件监听清理函数。 */
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  onMounted(async (): Promise<void> => {
    try {
      const homeDir = await native.getHomeDir();
      await widgetStore.init(homeDir, {
        readFile: (filePath: string) => native.readFile(filePath).then((result) => ({ content: result.content })),
        readWorkspaceDirectory: (options: ReadWorkspaceDirectoryOptions) => native.readWorkspaceDirectory(options),
        getPathStatus: (targetPath: string) => native.getPathStatus(targetPath)
      });

      const widgetDir = joinPath(homeDir, '.tibis', 'widgets');
      await native.watchDirectory(widgetDir, '**/widget.json');
      cleanupCallbacks.push(() => native.unwatchDirectory(widgetDir, '**/widget.json'));

      const removeWidgetChangedListener = native.onSkillChanged((data: { type: string; filePath: string; content?: string }): void => {
        const normalizedPath = data.filePath.replace(/\\/g, '/');
        if (!isWidgetJsonPath(normalizedPath)) {
          return;
        }

        if (data.type === 'unlink') {
          widgetStore.handleWidgetChange('unlink', parseWidgetJson('{}', normalizedPath));
          return;
        }

        if (!data.content) {
          return;
        }

        widgetStore.handleWidgetChange(data.type as 'change' | 'add', parseWidgetJson(data.content, normalizedPath));
      });
      cleanupCallbacks.push(removeWidgetChangedListener);
    } catch (error: unknown) {
      console.error('Widget initialization failed:', error);
    }
  });

  onUnmounted((): void => {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      const result = cleanup();
      if (result instanceof Promise) {
        result.catch((error: unknown): void => {
          console.error('Widget cleanup failed:', error);
        });
      }
    }
  });
}
