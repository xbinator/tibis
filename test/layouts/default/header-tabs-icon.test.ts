/**
 * @file header-tabs-icon.test.ts
 * @description HeaderTabs 标签页图标优先级测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { PropType } from 'vue';
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
 * BDraggable 测试替身。
 */
const BDraggableStub = defineComponent({
  name: 'BDraggable',
  props: {
    list: { type: Array as PropType<Tab[]>, required: true },
    itemKey: { type: String, required: true },
    direction: { type: String, default: 'vertical' },
    itemClass: { type: String, default: '' }
  },
  emits: ['move', 'drag-end'],
  template: `
    <div
      class="b-draggable-stub"
      data-testid="tabs-draggable"
      :data-direction="direction"
      :data-item-key="itemKey"
    >
      <div v-for="(item, index) in list" :key="item.id" class="b-draggable-stub__item">
        <slot
          :item="item"
          :index="index"
          :item-key="item.id"
          :dragging="false"
          :drop-position="null"
        />
      </div>
    </div>
  `
});

/**
 * 创建标签页测试数据。
 * @param id - 标签 ID
 * @param path - 标签路径
 * @param title - 标签标题
 * @param extra - 额外标签字段
 * @returns 标签页数据
 */
function createTab(id: string, path: string, title: string, extra: Partial<Tab> = {}): Tab {
  return {
    id,
    path,
    title,
    cacheKey: id,
    ...extra
  } as Tab;
}

/**
 * 挂载 HeaderTabs。
 * @returns 组件 wrapper
 */
function mountHeaderTabs(): ReturnType<typeof mount> {
  return mount(HeaderTabs, {
    global: {
      stubs: {
        BDraggable: BDraggableStub,
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
    tabsStore.tabs = [createTab('settings', '/settings/provider', '设置', { icon: 'lucide:settings' })];

    const wrapper = mountHeaderTabs();
    const icon = wrapper.find('.b-recent-icon-stub');

    expect(icon.attributes('data-icon')).toBe('lucide:settings');
    expect(icon.attributes('data-file-name')).toBe('');
  });

  it('renders tabs through the shared horizontal BDraggable component', (): void => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('settings', '/settings/provider', '设置'), createTab('files', '/files', '文件')];

    const wrapper = mountHeaderTabs();
    const draggable = wrapper.find('[data-testid="tabs-draggable"]');

    expect(draggable.attributes('data-direction')).toBe('horizontal');
    expect(draggable.attributes('data-item-key')).toBe('id');
    expect(wrapper.findAll('.header-tab')).toHaveLength(2);
  });

  it('moves tabs when BDraggable emits a move event', (): void => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('settings', '/settings/provider', '设置'), createTab('files', '/files', '文件')];
    const moveTabSpy = vi.spyOn(tabsStore, 'moveTab');

    const wrapper = mountHeaderTabs();
    wrapper.findComponent(BDraggableStub).vm.$emit('move', {
      sourceKey: 'files',
      targetKey: 'settings',
      position: 'before'
    });

    expect(moveTabSpy).toHaveBeenCalledWith('files', 'settings', 'before');
  });

  it('suppresses route clicks immediately after a drag session ends', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('settings', '/settings/provider', '设置'), createTab('files', '/files', '文件')];

    const wrapper = mountHeaderTabs();
    wrapper.findComponent(BDraggableStub).vm.$emit('drag-end');
    await wrapper.find('[data-tab-id="files"]').trigger('click');

    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
