/**
 * @file header-tabs-chat-status.test.ts
 * @description HeaderTabs 聊天运行状态、标题同步与安全关闭测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { PropType } from 'vue';
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HeaderTabs from '@/layouts/default/components/HeaderTabs.vue';
import { useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import { storeEvents } from '@/stores/helpers/events';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';

const routeMock = vi.hoisted(() => ({ fullPath: '/welcome' }));
const routerPushMock = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>());
const modalConfirmMock = vi.hoisted(() => vi.fn<() => Promise<[boolean, boolean]>>());
const messageErrorMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRoute: (): typeof routeMock => routeMock,
  useRouter: (): { push: typeof routerPushMock } => ({ push: routerPushMock })
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
    template: '<div><slot /><slot name="overlay" /></div>'
  },
  message: {
    error: messageErrorMock
  }
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: (): { recentRecords: []; ensureLoaded: () => Promise<void> } => ({
    recentRecords: [],
    ensureLoaded: async (): Promise<void> => undefined
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    setWindowTitle: vi.fn<(title: string) => Promise<void>>().mockResolvedValue(undefined)
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: modalConfirmMock
  }
}));

/** HeaderTabs 拖拽容器测试替身。 */
const BDraggableStub = defineComponent({
  name: 'BDraggable',
  props: {
    list: { type: Array as PropType<Tab[]>, required: true }
  },
  emits: ['move', 'drag-end'],
  template: '<div><div v-for="item in list" :key="item.id"><slot :item="item" :dragging="false" /></div></div>'
});

/** 标签普通图标测试替身。 */
const BRecentIconStub = defineComponent({
  name: 'BRecentIcon',
  template: '<span class="recent-icon-stub"></span>'
});

/** 右键菜单测试替身。 */
const BDropdownMenuStub = defineComponent({
  name: 'BDropdownMenu',
  props: {
    options: { type: Array as PropType<Array<{ value: string; onClick?: () => Promise<void> | void }>>, required: true }
  },
  template: '<div class="menu-stub"></div>'
});

/**
 * 创建测试标签。
 * @param id - 标签 ID
 * @param path - 标签路径
 * @returns 标签数据
 */
function createTab(id: string, path: string): Tab {
  return { id, path, title: id, cacheKey: id, icon: id.startsWith('chat:') ? 'lucide:message-circle' : undefined };
}

/** 挂载 HeaderTabs。 */
function mountTabs(): ReturnType<typeof mount> {
  return mount(HeaderTabs, {
    global: {
      stubs: {
        BDraggable: BDraggableStub,
        BRecentIcon: BRecentIconStub,
        BDropdownMenu: BDropdownMenuStub
      }
    }
  });
}

/**
 * 调用指定标签右键菜单动作。
 * @param wrapper - HeaderTabs 包装器
 * @param tabIndex - 标签索引
 * @param action - 菜单动作值
 */
async function invokeMenu(wrapper: ReturnType<typeof mount>, tabIndex: number, action: string): Promise<void> {
  const menu = wrapper.findAllComponents(BDropdownMenuStub)[tabIndex];
  const options = menu.props('options') as Array<{ value: string; onClick?: () => Promise<void> | void }>;
  await options.find((option) => option.value === action)?.onClick?.();
  await flushPromises();
}

describe('HeaderTabs chat status', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    routeMock.fullPath = '/welcome';
    routerPushMock.mockReset();
    routerPushMock.mockResolvedValue();
    modalConfirmMock.mockReset();
    modalConfirmMock.mockResolvedValue([false, true]);
    messageErrorMock.mockReset();
  });

  it('renders running, waiting, error and completed chat states', (): void => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [
      createTab('chat:running', '/chat/running'),
      createTab('chat:waiting', '/chat/waiting'),
      createTab('chat:error', '/chat/error'),
      createTab('chat:completed', '/chat/completed'),
      createTab('welcome', '/welcome')
    ];
    const runtimeStore = useChatTabRuntimeStore();
    runtimeStore.setStatus('chat:running', 'running');
    runtimeStore.setStatus('chat:waiting', 'waiting');
    runtimeStore.setStatus('chat:error', 'error');
    runtimeStore.markCompleted('chat:completed', false);

    const wrapper = mountTabs();

    const runningStatus = wrapper.find('[data-tab-id="chat:running"] [data-chat-status="running"]');
    expect(runningStatus.find('[data-icon]').attributes('data-icon')).toBe('lucide:loader-circle');
    expect(runningStatus.classes()).toContain('is-spinning');
    expect(wrapper.find('[data-tab-id="chat:waiting"] [data-chat-status="waiting"] [data-icon]').attributes('data-icon')).toBe('lucide:circle-alert');
    expect(wrapper.find('[data-tab-id="chat:error"] [data-chat-status="error"] [data-icon]').attributes('data-icon')).toBe('lucide:circle-x');
    expect(wrapper.find('[data-tab-id="chat:completed"] [data-chat-status="completed"]').exists()).toBe(true);
    expect(wrapper.find('[data-tab-id="welcome"] [data-chat-status]').exists()).toBe(false);
  });

  it('clears a completed marker when its chat tab is active', (): void => {
    routeMock.fullPath = '/chat/session-a';
    useTabsStore().tabs = [createTab('chat:session-a', '/chat/session-a')];
    const runtimeStore = useChatTabRuntimeStore();
    runtimeStore.markCompleted('chat:session-a', false);

    mountTabs();

    expect(runtimeStore.getStatus('chat:session-a')).toBe('idle');
  });

  it('updates the persisted or draft owner title from the global title event', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('chat:new', '/chat')];
    useChatTabRuntimeStore().ensureTab('chat:new', 'session-a');
    const wrapper = mountTabs();

    storeEvents.emitChatSessionTitleUpdated('session-a', '新的标题');
    await flushPromises();

    expect(tabsStore.tabs[0]?.title).toBe('新的标题');
    wrapper.unmount();
  });

  it('confirms and aborts a running chat before closing it', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('chat:session-a', '/chat/session-a')];
    const abort = vi.fn<() => Promise<void>>().mockResolvedValue();
    const runtimeStore = useChatTabRuntimeStore();
    runtimeStore.registerController('chat:session-a', { abort });
    runtimeStore.setStatus('chat:session-a', 'running');
    const wrapper = mountTabs();

    await wrapper.find('[data-tab-id="chat:session-a"] .header-tab__close').trigger('click');
    await flushPromises();

    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(tabsStore.tabs).toEqual([]);
  });

  it('keeps a running chat when close is cancelled or abort fails', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('chat:session-a', '/chat/session-a')];
    const abort = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('abort failed'));
    const runtimeStore = useChatTabRuntimeStore();
    runtimeStore.registerController('chat:session-a', { abort });
    runtimeStore.setStatus('chat:session-a', 'running');
    const cancelledWrapper = mountTabs();
    modalConfirmMock.mockResolvedValueOnce([true, false]);

    await cancelledWrapper.find('.header-tab__close').trigger('click');
    await flushPromises();
    expect(abort).not.toHaveBeenCalled();
    expect(tabsStore.tabs).toHaveLength(1);

    await cancelledWrapper.find('.header-tab__close').trigger('click');
    await flushPromises();
    expect(abort).toHaveBeenCalledTimes(1);
    expect(tabsStore.tabs).toHaveLength(1);
    expect(messageErrorMock).toHaveBeenCalledWith('终止聊天失败：abort failed');
  });

  it('confirms once and aborts every active chat before a batch close', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('chat:session-a', '/chat/session-a'), createTab('chat:session-b', '/chat/session-b')];
    const abortA = vi.fn<() => Promise<void>>().mockResolvedValue();
    const abortB = vi.fn<() => Promise<void>>().mockResolvedValue();
    const runtimeStore = useChatTabRuntimeStore();
    runtimeStore.registerController('chat:session-a', { abort: abortA });
    runtimeStore.registerController('chat:session-b', { abort: abortB });
    runtimeStore.setStatus('chat:session-a', 'running');
    runtimeStore.setStatus('chat:session-b', 'waiting');
    const wrapper = mountTabs();

    await invokeMenu(wrapper, 0, 'closeAll');

    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(abortA).toHaveBeenCalledTimes(1);
    expect(abortB).toHaveBeenCalledTimes(1);
    expect(tabsStore.tabs).toEqual([]);
  });

  it('keeps the entire batch plan when one runtime abort fails', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('chat:session-a', '/chat/session-a'), createTab('chat:session-b', '/chat/session-b')];
    const runtimeStore = useChatTabRuntimeStore();
    const abortA = vi.fn<() => Promise<void>>().mockImplementation(async (): Promise<void> => runtimeStore.setStatus('chat:session-a', 'idle'));
    const abortB = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('abort B failed'));
    runtimeStore.registerController('chat:session-a', { abort: abortA });
    runtimeStore.registerController('chat:session-b', { abort: abortB });
    runtimeStore.setStatus('chat:session-a', 'running');
    runtimeStore.setStatus('chat:session-b', 'waiting');
    const wrapper = mountTabs();

    await invokeMenu(wrapper, 0, 'closeAll');

    expect(abortA).toHaveBeenCalledOnce();
    expect(abortB).toHaveBeenCalledOnce();
    expect(tabsStore.tabs).toHaveLength(2);
    expect(runtimeStore.getStatus('chat:session-a')).toBe('idle');
    expect(runtimeStore.getStatus('chat:session-b')).toBe('waiting');
    expect(messageErrorMock).toHaveBeenCalledWith('终止聊天失败：abort B failed');
  });

  it('retains the existing dirty confirmation for ordinary tabs', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    tabsStore.tabs = [createTab('editor-a', '/editor/a')];
    tabsStore.dirtyById['editor-a'] = true;
    const wrapper = mountTabs();

    await wrapper.find('.header-tab__close').trigger('click');
    await flushPromises();

    expect(modalConfirmMock).toHaveBeenCalledTimes(1);
    expect(useChatTabRuntimeStore().controllers.size).toBe(0);
    expect(tabsStore.tabs).toEqual([]);
  });
});
