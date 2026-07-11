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
 * 获取 `.tibis/widgets` 下的目录片段。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns Widget 根目录之后、文件名之前的路径片段
 */
function getWidgetDirectorySegments(normalizedPath: string): string[] {
  const segments = normalizedPath.split('/');
  const tibisIndex = segments.lastIndexOf('.tibis');

  if (tibisIndex === -1 || segments[tibisIndex + 1] !== 'widgets') {
    return [];
  }

  return segments.slice(tibisIndex + 2, -1);
}

/**
 * 判断路径是否位于 Widget 隐藏目录。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns 隐藏目录下的文件返回 true
 */
function isHiddenWidgetPath(normalizedPath: string): boolean {
  return getWidgetDirectorySegments(normalizedPath).some((segment: string): boolean => segment.startsWith('.'));
}

/**
 * 判断变更路径是否为用户小组件配置文件。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns 是否为正式 widget.json 路径
 */
function isWidgetJsonPath(normalizedPath: string): boolean {
  return normalizedPath.includes('/.tibis/widgets/') && normalizedPath.endsWith('/widget.json') && !isHiddenWidgetPath(normalizedPath);
}

/**
 * 初始化 Widget Store：扫描用户小组件目录并监听 widget.json 变化。
 */
export function useWidgetInit(): void {
  const widgetStore = useWidgetStore();
  // setup 阶段先建立屏障，避免布局 onMounted 前聊天绕过资源初始化。
  widgetStore.prepareInitialization();

  /** 组件卸载时需要执行的小组件监听清理函数。 */
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  onMounted(async (): Promise<void> => {
    try {
      // 先订阅事件，避免异步扫描与 watcher 注册期间丢失磁盘变化。
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

      const homeDir = await native.getHomeDir();
      const widgetDir = joinPath(homeDir, '.tibis', 'widgets');
      await native.watchDirectory(widgetDir, '**/widget.json');
      cleanupCallbacks.push(() => native.unwatchDirectory(widgetDir, '**/widget.json'));

      await widgetStore.init(homeDir, {
        readFile: (filePath: string) => native.readFile(filePath).then((result) => ({ content: result.content })),
        readWorkspaceDirectory: (options: ReadWorkspaceDirectoryOptions) => native.readWorkspaceDirectory(options),
        getPathStatus: (targetPath: string) => native.getPathStatus(targetPath)
      });
    } catch (error: unknown) {
      console.error('Widget initialization failed:', error);
      widgetStore.finishInitialization();
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
