/**
 * @file header-tabs-icon.test.ts
 * @description HeaderTabs 标签页图标优先级测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderTabs from '@/layouts/default/components/HeaderTabs.vue';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';

/** 当前路由 mock。 */
const routeMock = vi.hoisted(() => ({
  fullPath: '/settings/provider'
}));

/** router.push mock。 */
const routerPushMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined));

/** 最近记录加载 mock。 */
const ensureLoadedMock = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: ['icon', 'width', 'height'],
    template: '<i class="icon-stub" :data-icon="icon"></i>'
  }
}));

vi.mock('ant-design-vue', () => ({
  Dropdown: {
    name: 'Dropdown',
    props: ['open', 'trigger', 'placement'],
    emits: ['open-change'],
    template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>'
  }
}));

vi.mock('@/layouts/default/hooks/useTabDragger', () => ({
  useTabDragger: () => ({
    state: {
      draggingTabId: { value: null },
      dropIndicatorOffset: { value: null }
    },
    registerTabElement: vi.fn<(tabId: string, element: HTMLElement) => void>(),
    unregisterTabElement: vi.fn<(tabId: string) => void>(),
    cleanup: vi.fn<() => void>()
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    recentRecords: [],
    ensureLoaded: ensureLoadedMock
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    setWindowTitle: vi.fn<(title: string) => Promise<void>>().mockResolvedValue(undefined)
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn()
  }
}));

/**
 * BRecentIcon 测试替身。
 */
const BRecentIconStub = defineComponent({
  name: 'BRecentIcon',
  props: {
    record: { type: Object, default: undefined },
    fileName: { type: String, default: '' },
    icon: { type: String, default: '' },
    size: { type: [Number, String], default: 14 }
  },
  template: '<span class="b-recent-icon-stub" :data-icon="icon" :data-file-name="fileName"></span>'
});

/**
 * 挂载 HeaderTabs。
 * @returns 组件 wrapper
 */
function mountHeaderTabs(): ReturnType<typeof mount> {
  return mount(HeaderTabs, {
    global: {
      stubs: {
        BRecentIcon: BRecentIconStub,
        BDropdownMenu: true
      }
    }
  });
}

describe('HeaderTabs icon rendering', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    routerPushMock.mockClear();
    ensureLoadedMock.mockClear();
  });

  it('uses the configured tab icon before file name based icon inference', (): void => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [
      {
        id: 'settings',
        path: '/settings/provider',
        title: '设置',
        cacheKey: 'settings',
        icon: 'lucide:settings'
      } as unknown as Tab
    ];

    const wrapper = mountHeaderTabs();
    const icon = wrapper.find('.b-recent-icon-stub');

    expect(icon.attributes('data-icon')).toBe('lucide:settings');
    expect(icon.attributes('data-file-name')).toBe('');
  });
});
