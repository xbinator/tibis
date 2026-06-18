/**
 * @file search-recent-loading.test.ts
 * @description 欢迎页最近搜索弹窗首屏加载策略测试。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const welcomePageSource = readFileSync(new URL('../../../src/views/welcome/index.vue', import.meta.url), 'utf8');

describe('WelcomePage search recent loading', (): void => {
  it('loads BSearchRecent lazily only after the dialog becomes visible', (): void => {
    expect(welcomePageSource).toContain("defineAsyncComponent(() => import('@/components/BSearchRecent/index.vue'))");
    expect(welcomePageSource).toContain('<BSearchRecent v-if="visibleSearchRecent" v-model:visible="visibleSearchRecent" />');
    expect(welcomePageSource).not.toContain("import BSearchRecent from '@/components/BSearchRecent/index.vue'");
  });
});
