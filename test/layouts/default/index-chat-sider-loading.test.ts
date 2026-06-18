/**
 * @file index-chat-sider-loading.test.ts
 * @description 默认布局聊天侧栏首屏加载策略测试。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const defaultLayoutSource = readFileSync(new URL('../../../src/layouts/default/index.vue', import.meta.url), 'utf8');

describe('Default layout chat sidebar loading', (): void => {
  it('loads ChatSider lazily only after the sidebar becomes visible', (): void => {
    expect(defaultLayoutSource).toContain("defineAsyncComponent(() => import('./components/ChatSider.vue'))");
    expect(defaultLayoutSource).toContain('<ChatSider v-if="settingStore.sidebarVisible" />');
    expect(defaultLayoutSource).not.toContain("import ChatSider from './components/ChatSider.vue'");
  });
});
