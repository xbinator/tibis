/**
 * @file index.test.ts
 * @description 记忆设置页加载 MEMORY.md 的组件测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemorySettingsPage from '@/views/settings/tools/memory/index.vue';

/** 原生平台方法 mock。 */
const nativeMock = vi.hoisted(() => ({
  getHomeDir: vi.fn<() => Promise<string>>(),
  getPathStatus: vi.fn<(path: string) => Promise<{ exists: boolean }>>(),
  readFile: vi.fn<(path: string) => Promise<{ content: string; name: string; ext: string }>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>()
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    ensureDir: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  })
}));

vi.mock('@/views/settings/tools/memory/components/MemoryContent.vue', () => ({
  default: {
    name: 'MemoryContent',
    props: {
      content: { type: String, required: true }
    },
    template: '<article class="memory-content-stub">{{ content }}</article>'
  }
}));

vi.mock('@/views/settings/tools/memory/components/MemoryInput.vue', () => ({
  default: {
    name: 'MemoryInput',
    template: '<div class="memory-input-stub"></div>'
  }
}));

/**
 * SettingsPage 测试替身。
 */
const SettingsPageStub = defineComponent({
  name: 'SettingsPage',
  props: {
    title: { type: String, required: true }
  },
  template: '<main><h1>{{ title }}</h1><slot /></main>'
});

/**
 * SettingsSection 测试替身。
 */
const SettingsSectionStub = defineComponent({
  name: 'SettingsSection',
  props: {
    title: { type: String, required: true }
  },
  template: '<section><h2>{{ title }}</h2><slot /><slot name="extra" /></section>'
});

/**
 * BButton 测试替身。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
});

/**
 * ASwitch 测试替身。
 */
const ASwitchStub = defineComponent({
  name: 'ASwitch',
  props: {
    checked: { type: Boolean, required: true }
  },
  emits: ['change'],
  template: '<button type="button" class="a-switch-stub" @click="$emit(\'change\', !checked)">{{ checked }}</button>'
});

/**
 * 挂载记忆设置页。
 * @returns 组件 wrapper
 */
function mountMemorySettingsPage(): VueWrapper {
  return mount(MemorySettingsPage, {
    global: {
      stubs: {
        SettingsPage: SettingsPageStub,
        SettingsSection: SettingsSectionStub,
        BButton: BButtonStub,
        ASwitch: ASwitchStub
      }
    }
  });
}

describe('MemorySettingsPage', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    nativeMock.getHomeDir.mockReset();
    nativeMock.getPathStatus.mockReset();
    nativeMock.readFile.mockReset();
    nativeMock.writeFile.mockReset();
    nativeMock.getHomeDir.mockResolvedValue('/Users/test');
    nativeMock.getPathStatus.mockResolvedValue({ exists: true });
    nativeMock.readFile.mockResolvedValue({
      content: '# MEMORY\n\n## Preferences\n- 喜欢 TypeScript',
      name: 'MEMORY',
      ext: 'md'
    });
    nativeMock.writeFile.mockResolvedValue(undefined);
  });

  it('loads persisted memory content when the page is mounted', async (): Promise<void> => {
    const wrapper = mountMemorySettingsPage();

    await flushPromises();

    expect(nativeMock.readFile).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('喜欢 TypeScript');
    expect(wrapper.text()).not.toContain('暂无记忆条目');
  });
});
