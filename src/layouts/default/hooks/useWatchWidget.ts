/**
 * @file useWatchWidget.ts
 * @description 默认布局的 Widget 资源监听 hook，委托给通用 useWatchResource。
 */

import { parseWidgetJson } from '@/ai/widget/parser';
import type { WidgetDefinition } from '@/ai/widget/types';
import { useWatchResource } from '@/hooks/useWatchResource';
import { native } from '@/shared/platform';
import { useWidgetStore } from '@/stores/ai/widget';

/**
 * 监听用户小组件目录并同步到 Widget Store：扫描 widget.json、订阅变更、增量更新。
 */
export function useWatchWidget(): void {
  const widgetStore = useWidgetStore();

  useWatchResource<WidgetDefinition>({
    rootDir: '.tibis',
    subDir: 'widgets',
    watchGlob: '**/widget.json',
    logLabel: 'Widget',
    onBeforeInitialize: (): void => widgetStore.beforeInitialize(),
    onAfterInitialize: (): void => widgetStore.afterInitialize(),
    onInitialize: (homeDir: string): Promise<void> => widgetStore.initialize(homeDir, native),
    onChange: (type, definition): void => widgetStore.handleWidgetChange(type, definition),
    onParseFile: (content: string, filePath: string): WidgetDefinition => parseWidgetJson(content, filePath),
    // 走一遍 parser，从路径推断 id，便于 Store 在 unlink 路径命中失败时仍可按 id 兜底
    onCreateUnlinkPayload: (filePath: string): WidgetDefinition => parseWidgetJson('{}', filePath),
    // 匹配 .tibis/widgets/<name>/widget.json 结构；隐藏目录过滤已由 useWatchResource 内部处理
    onIsTargetFile: (normalizedPath: string): boolean => /\/\.tibis\/widgets\/[^/]+\/widget\.json$/.test(normalizedPath)
  });
}
