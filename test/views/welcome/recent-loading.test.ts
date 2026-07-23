/**
 * @file recent-loading.test.ts
 * @description 欢迎页最近搜索弹窗首屏加载策略测试。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const welcomePageSource = readFileSync(new URL('../../../src/views/welcome/index.vue', import.meta.url), 'utf8');

describe('WelcomePage search recent loading', (): void => {
  it('delegates recent search to the global command panel store', (): void => {
    expect(welcomePageSource).toContain("import { useCommandPanelStore } from '@/stores/ui/commandPanel';");
    expect(welcomePageSource).toContain('const commandPanelStore = useCommandPanelStore();');
    expect(welcomePageSource).toContain('commandPanelStore.openRecent()');
    expect(welcomePageSource).not.toContain('<BCommandPanel');
    expect(welcomePageSource).not.toContain('visibleSearchRecent');
    expect(welcomePageSource).not.toContain("import BCommandPanel from '@/components/BCommandPanel/index.vue'");
    expect(welcomePageSource).not.toContain("defineAsyncComponent(() => import('@/components/BCommandPanel/index.vue'))");
    expect(welcomePageSource).not.toContain("defineAsyncComponent(() => import('@/components/BRecent/index.vue'))");
  });

  it('uses the recent record stable key for mixed record rendering', (): void => {
    expect(welcomePageSource).toContain('v-for="record in topRecentRecords" :key="createRecentKey(record)"');
  });
});
