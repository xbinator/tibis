/**
 * @file header-tabs-menu.test.ts
 * @description HeaderTabs 单例右键菜单集成测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { PropType } from 'vue';
import { defineComponent, onMounted, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderTabs from '@/layouts/default/components/HeaderTabs.vue';
import type { RecentRecord } from '@/shared/storage';
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

/** 最近记录列表 mock。 */
const recentRecordsMock = vi.hoisted<{ value: RecentRecord[] }>(() => ({ value: [] }));

/** 剪贴板 mock。 */
const clipboardMock = vi.hoisted(() => vi.fn<(content: string, options?: { successMessage?: string; trim?: boolean }) => Promise<boolean>>().mockResolvedValue(true));

/** HeaderTabMenu 测试替身挂载次数。 */
let menuMountCount = 0;

/** HeaderTabMenu open 变化历史。 */
let menuOpenHistory: boolean[] = [];

vi.mock('vue-router', () => ({
  NavigationFailureType: {
    duplicated: 16
  },
  isNavigationFailure: (_result: unknown, _type?: number): boolean => false,
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

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    get recentRecords() {
      return recentRecordsMock.value;
    },
    ensureLoaded: ensureLoadedMock
  })
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: clipboardMock
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

vi.mock('ant-design-vue', () => ({
  message: {
    error: vi.fn()
  }
}));

/**
 * 测试菜单项。
 */
interface MenuItem {
  /** 菜单项类型。 */
  type?: 'item';
  /** 菜单命令。 */
  key: string;
  /** 展示文案。 */
  label: string;
  /** 旧版图标字段，不应继续出现。 */
  icon?: string;
  /** 是否禁用。 */
  disabled?: boolean;
}

/**
 * 测试菜单分割线。
 */
interface MenuDivider {
  /** 菜单项类型。 */
  type: 'divider';
  /** 分割线唯一标识。 */
  key: string;
}

/** 测试菜单条目。 */
type MenuEntry = MenuItem | MenuDivider;

/**
 * 判断菜单条目是否为普通菜单项。
 * @param entry - 菜单条目
 * @returns 是否为普通菜单项
 */
function isMenuItem(entry: MenuEntry): entry is MenuItem {
  return entry.type !== 'divider';
}

/**
 * BRecentIcon 测试替身。
 */
const BRecentIconStub = defineComponent({
  name: 'BRecentIcon',
  template: '<span class="b-recent-icon-stub"></span>'
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
    <div class="b-draggable-stub">
      <div v-for="item in list" :key="item.id" class="b-draggable-stub__item">
        <slot :item="item" :item-key="item.id" :dragging="false" />
      </div>
    </div>
  `
});

/**
 * HeaderTabMenu 测试替身。
 */
const HeaderTabMenuStub = defineComponent({
  name: 'HeaderTabMenu',
  props: {
    open: { type: Boolean, required: true },
    position: { type: Object as PropType<{ x: number; y: number }>, required: true },
    items: { type: Array as PropType<MenuEntry[]>, required: true }
  },
  emits: ['select', 'close'],
  setup(props) {
    onMounted((): void => {
      menuMountCount += 1;
      if (props.open) {
        menuOpenHistory.push(true);
      }
    });
    watch(
      () => props.open,
      (open: boolean): void => {
        menuOpenHistory.push(open);
      }
    );

    return { isMenuItem };
  },
  template: `
    <div class="header-tab-menu-stub" :data-open="String(open)" :data-x="position.x" :data-y="position.y">
      <button
        v-for="item in items.filter(isMenuItem)"
        :key="item.key"
        type="button"
        class="header-tab-menu-stub__item"
        :data-key="item.key"
        :disabled="item.disabled"
        @click="$emit('select', item.key)"
      >
        {{ item.label }}
      </button>
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
  };
}

/**
 * 创建文件最近记录。
 * @param path - 文件真实路径
 * @returns 文件最近记录
 */
function createFileRecord(path: string): Extract<RecentRecord, { type: 'file' }> {
  return {
    type: 'file',
    id: 'file-a',
    url: '/editor/file-a',
    title: '复杂路径.md',
    description: path,
    path,
    content: '',
    savedContent: '',
    name: '复杂路径',
    ext: 'md'
  };
}

/**
 * 挂载 HeaderTabs。
 * @returns 组件包装器
 */
function mountHeaderTabs(): ReturnType<typeof mount> {
  return mount(HeaderTabs, {
    global: {
      stubs: {
        BDraggable: BDraggableStub,
        BRecentIcon: BRecentIconStub,
        HeaderTabMenu: HeaderTabMenuStub
      }
    }
  });
}

/**
 * 读取菜单测试替身。
 * @param wrapper - HeaderTabs 包装器
 * @returns 菜单组件包装器
 */
function getMenu(wrapper: ReturnType<typeof mountHeaderTabs>) {
  return wrapper.findComponent(HeaderTabMenuStub);
}

/**
 * 读取菜单项配置。
 * @param wrapper - HeaderTabs 包装器
 * @returns 菜单项配置
 */
function getMenuItems(wrapper: ReturnType<typeof mountHeaderTabs>): MenuEntry[] {
  return getMenu(wrapper).props('items') as MenuEntry[];
}

/**
 * 打开指定标签的右键菜单。
 * @param wrapper - HeaderTabs 包装器
 * @param tabId - 标签 ID
 */
async function openMenuForTab(wrapper: ReturnType<typeof mountHeaderTabs>, tabId: string, position: { x: number; y: number } = { x: 220, y: 64 }): Promise<void> {
  await wrapper.get(`[data-tab-id="${tabId}"]`).trigger('contextmenu', { clientX: position.x, clientY: position.y });
}

/**
 * 准备三标签测试状态。
 */
function prepareTabs(): void {
  useTabsStore().tabs = [
    createTab('settings', '/settings/provider', '设置'),
    createTab('file-a', '/editor/file-a', '复杂路径.md', { recentKey: 'file:file-a' }),
    createTab('web-a', `/webview/web?url=${encodeURIComponent('https://example.com')}`, 'Example')
  ];
}

describe('HeaderTabs menu integration', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    routeMock.fullPath = '/settings/provider';
    routerPushMock.mockClear();
    ensureLoadedMock.mockClear();
    recentRecordsMock.value = [];
    clipboardMock.mockClear();
    clipboardMock.mockResolvedValue(true);
    menuMountCount = 0;
    menuOpenHistory = [];
  });

  it('renders a single HeaderTabMenu for multiple tabs', (): void => {
    prepareTabs();

    const wrapper = mountHeaderTabs();

    expect(wrapper.findAllComponents(HeaderTabMenuStub)).toHaveLength(1);
    expect(getMenu(wrapper).props('open')).toBe(false);
  });

  it('opens the single menu for the right-clicked file tab', async (): Promise<void> => {
    prepareTabs();
    recentRecordsMock.value = [createFileRecord('/Users/demo/复杂 path/notes?#.md')];
    const wrapper = mountHeaderTabs();

    await openMenuForTab(wrapper, 'file-a');

    const menu = getMenu(wrapper);
    const menuItems = getMenuItems(wrapper).filter(isMenuItem);
    const menuKeys = menuItems.map((item: MenuItem): string => item.key);
    expect(menu.props('open')).toBe(true);
    expect(menu.props('position')).toEqual({ x: 220, y: 64 });
    expect(menuKeys).toEqual(['close', 'closeOthers', 'closeRight', 'closeAll', 'copyPath']);
    expect(menuItems.some((item: MenuItem): boolean => item.icon !== undefined)).toBe(false);
  });

  it('closes the previous menu before showing a new right-click target', async (): Promise<void> => {
    prepareTabs();
    const wrapper = mountHeaderTabs();

    await openMenuForTab(wrapper, 'settings', { x: 120, y: 44 });
    await openMenuForTab(wrapper, 'file-a', { x: 360, y: 72 });
    await flushPromises();

    expect(menuOpenHistory).toEqual([true, false, true]);
    expect(menuMountCount).toBeGreaterThan(1);
    expect(getMenu(wrapper).props('position')).toEqual({ x: 360, y: 72 });
  });

  it.each(['closeOthers', 'closeRight', 'closeAll'] as const)('executes %s through the tabs close plan', async (command: string): Promise<void> => {
    prepareTabs();
    const tabsStore = useTabsStore();
    const getClosePlanSpy = vi.spyOn(tabsStore, 'getClosePlan');
    const applyClosePlanSpy = vi.spyOn(tabsStore, 'applyClosePlan');
    const wrapper = mountHeaderTabs();

    await openMenuForTab(wrapper, 'file-a');
    getMenu(wrapper).vm.$emit('select', command);
    await flushPromises();

    expect(getClosePlanSpy).toHaveBeenCalledWith(command, {
      anchorTabId: 'file-a',
      activeTabId: 'settings',
      allowCloseLastTab: true
    });
    expect(applyClosePlanSpy).toHaveBeenCalledTimes(1);
  });

  it('copies the real document path for file tabs', async (): Promise<void> => {
    const complexPath = '/Users/demo/资料/space name/notes?# 草稿.md';
    prepareTabs();
    recentRecordsMock.value = [createFileRecord(complexPath)];
    const wrapper = mountHeaderTabs();

    await openMenuForTab(wrapper, 'file-a');
    expect(getMenuItems(wrapper).filter(isMenuItem).map((item: MenuItem): string => item.key)).toContain('copyPath');
    getMenu(wrapper).vm.$emit('select', 'copyPath');
    await flushPromises();

    expect(clipboardMock).toHaveBeenCalledWith(complexPath, {
      successMessage: '已复制路径',
      trim: false
    });
  });

  it('copies the decoded address for WebView tabs', async (): Promise<void> => {
    const url = 'https://example.test/a path/?q=中文#section';
    useTabsStore().tabs = [createTab('web-a', `/webview/web?url=${encodeURIComponent(url)}`, 'Example')];
    const wrapper = mountHeaderTabs();

    await openMenuForTab(wrapper, 'web-a');
    expect(getMenuItems(wrapper).filter(isMenuItem).map((item: MenuItem): string => item.key)).toContain('copyAddress');
    getMenu(wrapper).vm.$emit('select', 'copyAddress');
    await flushPromises();

    expect(clipboardMock).toHaveBeenCalledWith(url, {
      successMessage: '已复制地址',
      trim: false
    });
  });
});
