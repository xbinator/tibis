/**
 * @file chat-sider.test.ts
 * @description 默认布局 ChatSider 组件测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { ChatSession, PaginatedSessionsResult } from 'types/chat';
import { defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatSider from '@/layouts/default/components/ChatSider.vue';
import { useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import { useSettingStore } from '@/stores/ui/setting';
import { useTabsStore } from '@/stores/workspace/tabs';

const chatStoreMock = vi.hoisted(() => ({
  getSessions: vi.fn<() => Promise<PaginatedSessionsResult>>(),
  updateSessionTitle: vi.fn<(sessionId: string, title: string) => Promise<void>>()
}));

const sessionHistoryRefreshMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const bChatResetDraftMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const routerPushMock = vi.hoisted(() => vi.fn<(path: string) => Promise<unknown>>());
const routeFailureMock = vi.hoisted(() => ({ type: 'aborted' }));
const routeMock = vi.hoisted(() => ({ fullPath: '/welcome' }));

vi.mock('vue-router', () => ({
  useRoute: (): typeof routeMock => routeMock,
  useRouter: (): { push: typeof routerPushMock } => ({ push: routerPushMock })
}));

vi.mock('@/router/navigation', () => ({
  isBlockingNavigationFailure: (result: unknown): boolean => result === routeFailureMock
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: vi.fn(() => chatStoreMock)
}));

vi.mock('@/components/BButton/index.vue', () => ({
  default: {
    name: 'BButton',
    props: ['disabled', 'tooltip'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }
}));

vi.mock('@/components/BChat/index.vue', () => ({
  __esModule: true,
  __isKeepAlive: false,
  __isTeleport: false,
  default: {
    name: 'BChat',
    props: ['sessionId'],
    emits: ['session-created', 'session-title-persisted', 'new-session', 'loading-change'],
    setup(_props: unknown, { expose }: { expose: (exposed: { focusInput: () => void; resetDraft: () => Promise<void> }) => void }) {
      expose({
        focusInput: (): void => undefined,
        resetDraft: bChatResetDraftMock
      });
      return {};
    },
    template: '<div class="b-chat-stub" :data-session-id="sessionId || \'\'"></div>'
  }
}));

vi.mock('@/components/BChat/components/SessionHistory.vue', () => ({
  default: {
    name: 'SessionHistory',
    props: ['activeSessionId', 'busySessionIds', 'disabled', 'currentSession'],
    emits: ['switch-session', 'delete-session', 'update:currentSession'],
    setup(_props: unknown, { expose }: { expose: (exposed: { refreshSessions: () => Promise<void> }) => void }) {
      expose({
        refreshSessions: sessionHistoryRefreshMock
      });
      return {};
    },
    template: '<button class="session-history-stub" :disabled="disabled"></button>'
  }
}));

/**
 * 创建测试会话。
 * @param id - 会话 ID
 * @param title - 会话标题
 * @returns 测试会话
 */
function createSession(id: string, title: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    lastMessageAt: '2026-06-15T00:00:00.000Z'
  };
}

/**
 * 创建分页会话结果。
 * @param items - 会话列表
 * @returns 分页结果
 */
function createSessionPage(items: ChatSession[]): PaginatedSessionsResult {
  return {
    items,
    hasMore: false
  };
}

const BPanelSplitterStub = defineComponent({
  name: 'BPanelSplitter',
  props: {
    disabled: Boolean
  },
  emits: ['close'],
  setup(_props, { attrs, slots }) {
    return () =>
      h(
        'div',
        {
          class: ['b-panel-splitter', attrs.class]
        },
        slots.default?.()
      );
  }
});

/** AInput 测试替身，保留 v-model、blur、keydown 与原生聚焦节点。 */
const AInputStub = defineComponent({
  name: 'AInput',
  inheritAttrs: false,
  props: {
    value: {
      type: String,
      default: ''
    }
  },
  emits: ['update:value', 'blur', 'keydown'],
  setup(props, { attrs, emit }) {
    /** 将原生输入值转发为 AInput 的受控值事件。 */
    function handleInput(event: Event): void {
      emit('update:value', (event.target as HTMLInputElement).value);
    }

    return () =>
      h('input', {
        class: attrs.class,
        'aria-label': attrs['aria-label'],
        value: props.value,
        onInput: handleInput,
        onBlur: (event: FocusEvent): void => emit('blur', event),
        onKeydown: (event: KeyboardEvent): void => emit('keydown', event)
      });
  }
});

/**
 * 挂载 ChatSider。
 * @returns 组件包装器
 */
function mountChatSider(): ReturnType<typeof mount> {
  return mount(ChatSider, {
    global: {
      stubs: {
        AInput: AInputStub,
        BIcon: true,
        BPanelSplitter: BPanelSplitterStub
      }
    }
  });
}

describe('ChatSider', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  beforeEach((): void => {
    setActivePinia(createPinia());
    localStorage.clear();
    chatStoreMock.getSessions.mockReset();
    chatStoreMock.updateSessionTitle.mockReset();
    chatStoreMock.updateSessionTitle.mockResolvedValue();
    sessionHistoryRefreshMock.mockReset();
    bChatResetDraftMock.mockReset();
    bChatResetDraftMock.mockResolvedValue();
    routerPushMock.mockReset();
    routerPushMock.mockResolvedValue(undefined);
    routeMock.fullPath = '/welcome';
  });

  it('renders BChat with the active session id and displays the SessionHistory current session', async (): Promise<void> => {
    const latestSession = createSession('session-latest', '最近会话');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-latest');

    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();
    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('update:currentSession', latestSession);
    await nextTick();

    expect(wrapper.find('.b-chat-stub').attributes('data-session-id')).toBe('session-latest');
    expect(wrapper.text()).toContain('最近会话');
  });

  it('toggles expanded state from the header button', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    const expandButton = wrapper.findAllComponents({ name: 'BButton' }).find((button) => button.props('tooltip') === '展开聊天侧栏');
    await expandButton?.trigger('click');

    expect(settingStore.chatSidebarExpanded).toBe(true);
    expect(wrapper.find('.b-panel-splitter').classes()).toContain('chat-sider--expanded');
  });

  it('closes sidebar and clears expanded state', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarExpanded(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    const closeButton = wrapper
      .findAllComponents({ name: 'BButton' })
      .find((button) => button.findComponent({ name: 'BIcon' }).attributes('icon') === 'lucide:x');
    expect(closeButton?.props('tooltip')).toBeUndefined();
    await closeButton?.trigger('click');

    expect(settingStore.sidebarVisible).toBe(false);
    expect(settingStore.chatSidebarExpanded).toBe(false);
  });

  it('syncs internally created sessions and refreshes session history', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();
    const createdSession = createSession('session-created', '首条消息');

    wrapper.findComponent({ name: 'BChat' }).vm.$emit('session-created', createdSession);
    await nextTick();

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-created');
    expect(wrapper.text()).toContain('首条消息');
    expect(sessionHistoryRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('updates current title and refreshes history after BChat persists generated title', async (): Promise<void> => {
    const latestSession = createSession('session-latest', '首条消息');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-latest');
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();
    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('update:currentSession', latestSession);
    await nextTick();

    wrapper.findComponent({ name: 'BChat' }).vm.$emit('session-title-persisted', 'session-latest', '生成标题');
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).toContain('生成标题');
    expect(sessionHistoryRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('focuses and selects the title input before saving with Enter', async (): Promise<void> => {
    const latestSession = createSession('session-latest', '原标题');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-latest');
    const wrapper = mountChatSider();
    await flushPromises();
    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('update:currentSession', latestSession);
    await nextTick();

    vi.useFakeTimers();
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus');
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');
    await wrapper.find('.chat-sider__title').trigger('dblclick');
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    const input = wrapper.find<HTMLInputElement>('.chat-sider__title-input');
    expect(focusSpy).toHaveBeenCalledOnce();
    expect(selectSpy).toHaveBeenCalledOnce();
    focusSpy.mockRestore();
    selectSpy.mockRestore();

    const titleInput = wrapper.findComponent({ name: 'AInput' });
    titleInput.vm.$emit('update:value', '  手动标题  ');
    await nextTick();
    expect(titleInput.props('value')).toBe('  手动标题  ');
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(chatStoreMock.updateSessionTitle).toHaveBeenCalledWith('session-latest', '手动标题');
    expect(wrapper.text()).toContain('手动标题');
    expect(sessionHistoryRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('saves the edited title when the input loses focus', async (): Promise<void> => {
    const latestSession = createSession('session-latest', '原标题');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-latest');
    const wrapper = mountChatSider();
    await flushPromises();
    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('update:currentSession', latestSession);
    await nextTick();

    await wrapper.find('.chat-sider__title').trigger('dblclick');
    const titleInput = wrapper.findComponent({ name: 'AInput' });
    titleInput.vm.$emit('update:value', '失焦标题');
    await nextTick();
    expect(titleInput.props('value')).toBe('失焦标题');
    titleInput.vm.$emit('blur', new FocusEvent('blur'));
    await flushPromises();

    expect(chatStoreMock.updateSessionTitle).toHaveBeenCalledWith('session-latest', '失焦标题');
    expect(wrapper.text()).toContain('失焦标题');
  });

  it('clears active session when BChat requests a new draft session', async (): Promise<void> => {
    const latestSession = createSession('session-old', '旧会话');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    wrapper.findComponent({ name: 'BChat' }).vm.$emit('new-session');
    await flushPromises();

    expect(settingStore.chatSidebarActiveSessionId).toBeNull();
    expect(wrapper.text()).toContain('新会话');
    expect(bChatResetDraftMock).toHaveBeenCalledOnce();
  });

  it('disables session controls while chat is loading', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    useSettingStore().setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    wrapper.findComponent({ name: 'BChat' }).vm.$emit('loading-change', true);
    await nextTick();

    expect(wrapper.findAllComponents({ name: 'BButton' })[0].attributes('disabled')).toBeDefined();
    expect(wrapper.findAllComponents({ name: 'BButton' })[0].props('tooltip')).toBeUndefined();
    expect(wrapper.find('.session-history-stub').attributes('disabled')).toBeDefined();
    const openButton = wrapper.findAllComponents({ name: 'BButton' }).find((button) => button.props('tooltip') === '在聊天页中打开');
    expect(openButton?.attributes('disabled')).toBeDefined();
  });

  it('opens the side session in a chat tab and resets the side to draft', async (): Promise<void> => {
    const sideSession = createSession('session-a', '会话 A');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([sideSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    const openButton = wrapper.findAllComponents({ name: 'BButton' }).find((button) => button.props('tooltip') === '在聊天页中打开');
    expect(openButton?.findComponent({ name: 'BIcon' }).attributes('icon')).toBe('lucide:panel-top-open');
    await openButton?.trigger('click');
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith('/chat/session-a');
    expect(settingStore.chatSidebarActiveSessionId).toBeNull();
    expect(bChatResetDraftMock).toHaveBeenCalledTimes(1);
  });

  it('opens or reuses the unique draft tab from an empty ChatSider', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    useTabsStore().tabs = [{ id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' }];
    const wrapper = mountChatSider();
    await flushPromises();

    const openButton = wrapper.findAllComponents({ name: 'BButton' }).find((button) => button.props('tooltip') === '在聊天页中打开');
    await openButton?.trigger('click');
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith('/chat');
    expect(settingStore.chatSidebarActiveSessionId).toBeNull();
    expect(bChatResetDraftMock).toHaveBeenCalledOnce();
  });

  it('preserves the side session when opening the page route fails', async (): Promise<void> => {
    const sideSession = createSession('session-a', '会话 A');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([sideSession]));
    routerPushMock.mockRejectedValue(new Error('navigation failed'));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    const openButton = wrapper.findAllComponents({ name: 'BButton' }).find((button) => button.props('tooltip') === '在聊天页中打开');
    await openButton?.trigger('click');
    await flushPromises();

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-a');
    expect(bChatResetDraftMock).not.toHaveBeenCalled();
  });

  it('preserves the side session when the page route resolves with a navigation failure', async (): Promise<void> => {
    const sideSession = createSession('session-a', '会话 A');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([sideSession]));
    routerPushMock.mockResolvedValue(routeFailureMock);
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    const openButton = wrapper.findAllComponents({ name: 'BButton' }).find((button) => button.props('tooltip') === '在聊天页中打开');
    await openButton?.trigger('click');
    await flushPromises();

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-a');
    expect(bChatResetDraftMock).not.toHaveBeenCalled();
  });

  it('navigates to an owned history session without replacing the side session', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-b');
    const tabsStore = useTabsStore();
    tabsStore.tabs = [{ id: 'chat:session-a', path: '/chat/session-a', title: '会话 A', cacheKey: 'chat:session-a' }];
    useChatTabRuntimeStore().ensureTab('chat:session-a', 'session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('switch-session', 'session-a');
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith('/chat/session-a');
    expect(settingStore.chatSidebarActiveSessionId).toBe('session-b');
  });

  it('navigates to chat:new when it temporarily owns a history session', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-b');
    useTabsStore().tabs = [{ id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' }];
    useChatTabRuntimeStore().ensureTab('chat:new', 'session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('switch-session', 'session-a');
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith('/chat');
    expect(settingStore.chatSidebarActiveSessionId).toBe('session-b');
  });

  it('keeps the ordinary history switch behavior when no page owns the session', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarActiveSessionId('session-b');
    const wrapper = mountChatSider();
    await flushPromises();

    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('switch-session', 'session-a');
    await flushPromises();

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(settingStore.chatSidebarActiveSessionId).toBe('session-a');
  });

  it('removes the owning chat tab after successful session deletion', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const tabsStore = useTabsStore();
    tabsStore.tabs = [{ id: 'chat:session-a', path: '/chat/session-a', title: '会话 A', cacheKey: 'chat:session-a' }];
    useChatTabRuntimeStore().ensureTab('chat:session-a', 'session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('delete-session', 'session-a');
    await flushPromises();

    expect(tabsStore.tabs).toEqual([]);
    expect(useChatTabRuntimeStore().records['chat:session-a']).toBeUndefined();
  });

  it('removes chat:new when the deleted session is its temporary owner', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const tabsStore = useTabsStore();
    tabsStore.tabs = [{ id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' }];
    useChatTabRuntimeStore().ensureTab('chat:new', 'session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('delete-session', 'session-a');
    await flushPromises();

    expect(tabsStore.tabs).toEqual([]);
    expect(useChatTabRuntimeStore().records['chat:new']).toBeUndefined();
  });

  it('navigates to a surviving tab when the deleted chat page is active', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    routeMock.fullPath = '/chat/session-a';
    const tabsStore = useTabsStore();
    tabsStore.tabs = [
      { id: 'chat:session-a', path: '/chat/session-a', title: '会话 A', cacheKey: 'chat:session-a' },
      { id: 'welcome', path: '/welcome', title: '欢迎', cacheKey: 'welcome' }
    ];
    useChatTabRuntimeStore().ensureTab('chat:session-a', 'session-a');
    const wrapper = mountChatSider();
    await flushPromises();

    wrapper.findComponent({ name: 'SessionHistory' }).vm.$emit('delete-session', 'session-a');
    await flushPromises();

    expect(tabsStore.tabs.map((tab) => tab.id)).toEqual(['welcome']);
    expect(routerPushMock).toHaveBeenCalledWith('/welcome');
  });

  it('passes running and waiting owner sessions to the history delete policy', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const runtimeStore = useChatTabRuntimeStore();
    runtimeStore.ensureTab('chat:session-a', 'session-a');
    runtimeStore.ensureTab('chat:session-b', 'session-b');
    runtimeStore.ensureTab('chat:session-c', 'session-c');
    runtimeStore.setStatus('chat:session-a', 'running');
    runtimeStore.setStatus('chat:session-b', 'waiting');
    runtimeStore.setStatus('chat:session-c', 'error');
    const wrapper = mountChatSider();
    await flushPromises();

    expect(wrapper.findComponent({ name: 'SessionHistory' }).props('busySessionIds')).toEqual(['session-a', 'session-b']);
  });
});
