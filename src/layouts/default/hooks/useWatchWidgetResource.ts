/**
 * @file useWatchWidgetResource.ts
 * @description 默认布局的 Widget 资源监听 hook，委托给通用 useWatchResource。
 */

import { parseWidgetJson } from '@/ai/widget';
import type { WidgetDefinition } from '@/ai/widget/types';
import { useWatchResource, createResourceMatcher } from '@/hooks/useWatchResource';
import { native } from '@/shared/platform';
import { useWidgetStore } from '@/stores/ai/widget';

/**
 * 判断变更路径是否为用户小组件配置文件。
 * @param normalizedPath - 已使用 / 统一分隔符的文件路径
 * @returns 是否为正式 widget.json 路径
 */
const isManagedWidgetFile = createResourceMatcher(
  '.tibis',
  'widgets',
  (normalizedPath: string): boolean => normalizedPath.includes('/.tibis/widgets/') && normalizedPath.endsWith('/widget.json')
);

/**
 * 监听用户小组件目录并同步到 Widget Store：扫描 widget.json、订阅变更、增量更新。
 */
export function useWatchWidgetResource(): void {
  const widgetStore = useWidgetStore();

  useWatchResource<WidgetDefinition>({
    rootDir: '.tibis',
    subDir: 'widgets',
    watchGlob: '**/widget.json',
    logLabel: 'Widget',
    prepareInitialization: (): void => widgetStore.prepareInitialization(),
    finishInitialization: (): void => widgetStore.finishInitialization(),
    init: (homeDir: string): Promise<void> => widgetStore.init(homeDir, native),
    handleChange: (type, definition): void => widgetStore.handleWidgetChange(type, definition),
    parseFile: (content: string, filePath: string): WidgetDefinition => parseWidgetJson(content, filePath),
    // 走一遍 parser，从路径推断 id，便于 Store 在 unlink 路径命中失败时仍可按 id 兜底
    createUnlinkPayload: (filePath: string): WidgetDefinition => parseWidgetJson('{}', filePath),
    isTargetFile: isManagedWidgetFile
  });
}
