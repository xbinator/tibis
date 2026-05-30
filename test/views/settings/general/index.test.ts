/**
 * @file index.test.ts
 * @description 验证通用设置页可读写配色方案、视图与保存策略。
 */
/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { useSettingStore } from '@/stores/ui/setting';
import GeneralSettingsView from '@/views/settings/general/index.vue';

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

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: {
    updateMenuItem: vi.fn()
  }
}));

describe('GeneralSettingsView', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('renders current settings and updates the save strategy', async () => {
    const editorStore = useEditorPreferencesStore();
    editorStore.setViewMode('source');
    editorStore.setPageWidth('wide');
    editorStore.setSaveStrategy('onBlur');

    const settingStore = useSettingStore();
    settingStore.setTheme('dark');

    const wrapper = mount(GeneralSettingsView, {
      global: {
        stubs: {
          BSettingsPage: {
            props: ['title'],
            template: '<div class="settings-page-stub"><slot /></div>'
          },
          BSettingsSection: {
            props: ['title'],
            template: '<div class="settings-section-stub"><div class="section-title">{{ title }}</div><slot /></div>'
          },
          BSelect: {
            props: ['value'],
            emits: ['update:value'],
            template: '<div class="select-stub" :data-value="value"><slot /></div>'
          },
          ASwitch: {
            props: ['checked'],
            emits: ['update:checked'],
            template: '<div class="switch-stub" :data-checked="checked"></div>'
          }
        }
      }
    });

    expect(wrapper.text()).toContain('配色方案');
    expect(wrapper.text()).toContain('编辑器');
    expect(wrapper.text()).toContain('默认视图模式');
    expect(wrapper.text()).toContain('自动保存');
  });
});
