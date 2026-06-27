/**
 * @file header-tabs-structure.test.ts
 * @description HeaderTabs 标题栏拖拽区域结构测试，确保标签内容区域独立为 no-drag 容器。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headerTabsSource = readFileSync(new URL('../../../src/layouts/default/components/HeaderTabs.vue', import.meta.url), 'utf8');

/**
 * 从 HeaderTabs 源码中读取一个样式块内容。
 * @param selector - 样式选择器
 * @returns 样式块内容
 */
function getStyleBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector} \\{(?<body>[\\s\\S]*?)\\n\\}`, 'u').exec(headerTabsSource);

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
    expect(headerTabsSource).toContain('.header-tab {\n');
    expect(headerTabsSource).toContain('-webkit-app-region: no-drag;');
    expect(headerTabsSource).not.toContain('useTabDragger');
    expect(headerTabsSource).not.toContain('header-tabs__drop-indicator');
  });

  it('keeps the tab area blank while the chat sidebar is expanded', (): void => {
    expect(headerTabsSource).toContain(':list="visibleTabs"');
    expect(headerTabsSource).toMatch(/const visibleTabs = computed<Tab\[\]>/);
    expect(headerTabsSource).toContain('settingStore.chatSidebarExpanded ? [] : tabsStore.tabs');
    expect(headerTabsSource).not.toContain('header-tab--chat');
    expect(headerTabsSource).not.toContain('header-tab__title-text">聊天');
    expect(headerTabsSource).not.toContain('header-tabs__track--chat');
  });

  it('keeps the close button out of the drag handle pointer stream', (): void => {
    expect(headerTabsSource).not.toContain('handle-class="header-tab__drag-handle"');
    expect(headerTabsSource).not.toContain('handleClass');
    expect(headerTabsSource).toContain('@pointerdown.stop');
    expect(headerTabsSource).toContain(':class="getTabClassName(item, dragging)"');
  });

  it('keeps tab spacing on BDraggable item wrappers so the indicator can center between tabs', (): void => {
    expect(getStyleBlock('.header-tabs :deep(.header-tabs__item)')).toContain('margin-right: 4px;');
    expect(getStyleBlock('.header-tab')).not.toContain('margin-right: 4px;');
  });

  it('closes the expanded chat sidebar when the active route changes', (): void => {
    expect(headerTabsSource).toContain('() => route.fullPath');
    expect(headerTabsSource).toContain('settingStore.setChatSidebarExpanded(false)');
  });

  it('renders tab icons through the shared BRecentIcon component', (): void => {
    expect(headerTabsSource).toContain('<BRecentIcon');
    expect(headerTabsSource).toContain(':record="resolveTabIconRecentRecord(item)"');
    expect(headerTabsSource).toContain(':file-name="resolveTabIconFileName(item)"');
    expect(headerTabsSource).toContain(':icon="resolveTabIcon(item)"');
    expect(headerTabsSource).toContain('function resolveConfiguredTabIcon(tab: Tab): string');
    expect(headerTabsSource).toContain('function resolveWebviewUrlFromTabPath(path: string): string');
  });
});
