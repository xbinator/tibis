/**
 * @file header-tabs-structure.test.ts
 * @description HeaderTabs 标题栏拖拽区域结构测试，确保标签内容区域独立为 no-drag 容器。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headerTabsSource = readFileSync(new URL('../../../src/layouts/default/components/HeaderTabs.vue', import.meta.url), 'utf8');

describe('HeaderTabs drag region structure', (): void => {
  it('keeps the outer scroll container draggable and makes the content track no-drag', (): void => {
    expect(headerTabsSource).toContain('class="header-tabs__track"');
    expect(headerTabsSource).toContain('.header-tabs {\n');
    expect(headerTabsSource).toContain('-webkit-app-region: drag;');
    expect(headerTabsSource).toContain('.header-tabs__track {\n');
    expect(headerTabsSource).toContain('-webkit-app-region: no-drag;');
  });

  it('replaces real tabs with a chat tab while the chat sidebar is expanded', (): void => {
    expect(headerTabsSource).toContain('v-if="settingStore.chatSidebarExpanded"');
    expect(headerTabsSource).toContain('header-tab--chat');
    expect(headerTabsSource).toContain('聊天');
    expect(headerTabsSource).toContain('v-else class="header-tabs__track"');
  });

  it('keeps the chat tab horizontally symmetrical', (): void => {
    expect(headerTabsSource).toContain('.header-tab--chat {\n  padding: 0 10px;');
  });

  it('closes the expanded chat sidebar when the active route changes', (): void => {
    expect(headerTabsSource).toContain('() => route.fullPath');
    expect(headerTabsSource).toContain('settingStore.setChatSidebarExpanded(false)');
  });
});
