/**
 * @file header-tabs-structure.test.ts
 * @description HeaderTabs 标题栏拖拽区域结构测试，确保标签内容区域独立为 no-drag 容器。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headerTabsSource = readFileSync(new URL('../../../src/layouts/default/components/HeaderTabs.vue', import.meta.url), 'utf8');
const headerTabSource = readFileSync(new URL('../../../src/layouts/default/components/HeaderTab.vue', import.meta.url), 'utf8');

/**
 * 从指定源码中读取一个样式块内容。
 * @param source - 源码文本
 * @param selector - 样式选择器
 * @returns 样式块内容
 */
function getStyleBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector} \\{(?<body>[\\s\\S]*?)\\n\\}`, 'u').exec(source);

  return match?.groups?.body ?? '';
}

describe('HeaderTabs drag region structure', (): void => {
  it('keeps the shared BDraggable container draggable and makes tabs no-drag', (): void => {
    expect(headerTabsSource).toContain('<BDraggable');
    expect(headerTabsSource).toContain('direction="horizontal"');
    expect(headerTabsSource).toContain('@move="handleDraggableMove"');
    expect(headerTabsSource).toContain('@drag-end="handleDragEnded"');
    expect(headerTabsSource).toContain('.header-tabs {\n');
    expect(headerTabsSource).toContain('-webkit-app-region: drag;');
    expect(headerTabSource).toContain('.header-tab {\n');
    expect(headerTabSource).toContain('-webkit-app-region: no-drag;');
    expect(headerTabsSource).not.toContain('useTabDragger');
    expect(headerTabsSource).not.toContain('header-tabs__drop-indicator');
  });

  it('keeps the close button out of the drag handle pointer stream', (): void => {
    expect(headerTabsSource).not.toContain('handle-class="header-tab__drag-handle"');
    expect(headerTabsSource).not.toContain('handleClass');
    expect(headerTabsSource).not.toContain('DragHandleComponent');
    // pointerdown.stop 和 getTabClassName 已迁移至 HeaderTab.vue
  });

  it('keeps tab spacing on BDraggable item wrappers so the indicator can center between tabs', (): void => {
    expect(getStyleBlock(headerTabsSource, '.header-tabs :deep(.header-tabs__item)')).toContain('margin-right: 4px;');
    expect(getStyleBlock(headerTabSource, '.header-tab')).not.toContain('margin-right: 4px;');
  });

  it('does not access the chat runtime store', (): void => {
    expect(headerTabsSource).not.toContain('useChatTabStore');
    expect(headerTabsSource).not.toContain('ChatTabRuntimeStatus');
    expect(headerTabsSource).not.toContain('resolveTabStatus');
  });
});
