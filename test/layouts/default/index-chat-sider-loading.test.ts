/**
 * @file index-chat-sider-loading.test.ts
 * @description 默认布局聊天侧栏挂载与加载策略测试。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const defaultLayoutSource = readFileSync(new URL('../../../src/layouts/default/index.vue', import.meta.url), 'utf8');

describe('Default layout chat sidebar mounting', (): void => {
  it('imports ChatSider directly and toggles visibility with v-show', (): void => {
    expect(defaultLayoutSource).toContain("import ChatSider from './components/ChatSider.vue';");
    expect(defaultLayoutSource).toContain('<ChatSider v-show="settingStore.sidebarVisible" />');
    expect(defaultLayoutSource).not.toContain('<ChatSider v-if="settingStore.sidebarVisible" />');
    expect(defaultLayoutSource).not.toContain("defineAsyncComponent(() => import('./components/ChatSider.vue'))");
  });

  it('loads optional dialogs lazily only after they become visible', (): void => {
    expect(defaultLayoutSource).toContain("defineAsyncComponent(() => import('@/components/BRecent/index.vue'))");
    expect(defaultLayoutSource).toContain("defineAsyncComponent(() => import('./components/ShortcutsHelp.vue'))");
    expect(defaultLayoutSource).toContain('<BRecent v-if="visible.searchRecent" v-model:visible="visible.searchRecent" />');
    expect(defaultLayoutSource).toContain('<ShortcutsHelp v-if="visible.shortcutsHelp" v-model:visible="visible.shortcutsHelp" />');
    expect(defaultLayoutSource).not.toContain("import BRecent from '@/components/BRecent/index.vue'");
    expect(defaultLayoutSource).not.toContain("import ShortcutsHelp from './components/ShortcutsHelp.vue'");
  });
});
