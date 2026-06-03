/**
 * @file index.test.ts
 * @description 验证搜索工具设置页渲染 Tavily 配置项。
 */
/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import SearchToolsSettingsView from '@/views/settings/tools/search/index.vue';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

describe('SearchToolsSettingsView', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('renders Tavily base config', async () => {
    const store = useToolSettingsStore();
    await store.setTavilyEnabled(true);

    const wrapper = mount(SearchToolsSettingsView, {
      global: {
        stubs: {
          BSettingsPage: { template: '<div><h1>{{ title }}</h1><slot /></div>', props: ['title'] },
          BSettingsSection: { template: '<section><h2>{{ title }}</h2><slot /></section>', props: ['title'] },
          BSelect: { template: '<div class="b-select-stub"></div>' },
          BButton: { template: '<button><slot /></button>' },
          AInput: { template: '<input />', props: ['value'] },
          AInputPassword: { template: '<input />', props: ['value'] },
          AInputNumber: { template: '<input type="number" />', props: ['value'] },
          ASwitch: { template: '<input type="checkbox" />', props: ['checked'] },
          ACheckbox: { template: '<input type="checkbox" />', props: ['checked'] },
          AAlert: { template: '<div>{{ message }}<slot /></div>', props: ['message', 'type', 'showIcon'] }
        }
      }
    });

    expect(wrapper.text()).toContain('基础配置');
    expect(wrapper.text()).toContain('启用 Tavily 工具');
    expect(wrapper.text()).toContain('启用后，聊天工具链才会向模型暴露 Tavily 搜索与正文提取工具。');
    expect(wrapper.text()).toContain('Tavily API Key');
  });
});
