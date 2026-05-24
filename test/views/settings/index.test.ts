/**
 * @file index.test.ts
 * @description 验证设置页侧边栏折叠态 Tooltip 展示行为。
 */
/* @vitest-environment jsdom */

import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingStore } from '@/stores/ui/setting';
import SettingsView from '@/views/settings/index.vue';

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

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/settings/provider'
  })
}));

/**
 * 挂载设置页并提供路由与 Tooltip 的轻量替身。
 * @returns 设置页包装器
 */
function mountSettingsView(): VueWrapper {
  return mount(SettingsView, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a class="router-link-stub" :href="to"><slot /></a>'
        },
        RouterView: {
          template: '<main class="router-view-stub"></main>'
        },
        Icon: {
          props: ['icon'],
          template: '<i class="icon-stub" :data-icon="icon"></i>'
        },
        ATooltip: {
          props: ['title', 'placement'],
          template: '<span class="tooltip-stub" :data-title="title" :data-placement="placement"><slot /></span>'
        }
      },
      mocks: {
        $route: {
          path: '/settings/provider'
        }
      }
    }
  });
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows menu item tooltips only when the settings sidebar is collapsed', async () => {
    const settingStore = useSettingStore();
    const wrapper = mountSettingsView();

    expect(wrapper.findAll('.tooltip-stub').map((tooltip) => tooltip.attributes('data-title'))).toContain('模型服务');

    settingStore.setSettingsSidebarCollapsed(false);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.tooltip-stub').map((tooltip) => tooltip.attributes('data-title'))).not.toContain('模型服务');
  });
});
