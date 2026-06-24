/**
 * @file chat-sider.test.ts
 * @description 默认布局 ChatSider 组件测试。
 * @vitest-environment jsdom
 */
import type { ChatSession, PaginatedSessionsResult } from 'types/chat';
import { defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatSider from '@/layouts/default/components/ChatSider.vue';
import { useSettingStore } from '@/stores/ui/setting';

const chatStoreMock = vi.hoisted(() => ({
  getSessions: vi.fn<() => Promise<PaginatedSessionsResult>>()
}));

const sessionHistoryRefreshMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: vi.fn(() => chatStoreMock)
}));

vi.mock('@/components/BButton/index.vue', () => ({
  default: {
    name: 'BButton',
    props: ['disabled'],
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
    emits: ['session-created', 'session-title-persisted', 'draft-session-created', 'loading-change'],
    setup(_props: unknown, { expose }: { expose: (exposed: { focusInput: () => void }) => void }) {
      expose({
        focusInput: (): void => undefined
      });
      return {};
    },
    template: '<div data-testid="b-chat" :data-session-id="sessionId || \'\'"></div>'
  }
}));

vi.mock('@/components/BChat/components/SessionHistory.vue', () => ({
  default: {
    name: 'SessionHistory',
    props: ['activeSessionId', 'disabled', 'currentSession'],
    emits: ['switch-session', 'delete-session', 'update:currentSession'],
    setup(_props: unknown, { expose }: { expose: (exposed: { refreshSessions: () => Promise<void> }) => void }) {
      expose({
        refreshSessions: sessionHistoryRefreshMock
      });
      return {};
    },
    template: '<button data-testid="session-history" :disabled="disabled"></button>'
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
          class: ['b-panel-splitter', attrs.class],
          'data-testid': 'panel-splitter'
        },
        slots.default?.()
      );
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
        BIcon: true,
        BPanelSplitter: BPanelSplitterStub
      }
    }
  });
}

describe('ChatSider', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    localStorage.clear();
    chatStoreMock.getSessions.mockReset();
    sessionHistoryRefreshMock.mockReset();
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

    expect(wrapper.find('[data-testid="b-chat"]').attributes('data-session-id')).toBe('session-latest');
    expect(wrapper.text()).toContain('最近会话');
  });

  it('toggles expanded state from the header button', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    await wrapper.find('[data-testid="chat-expand-button"]').trigger('click');

    expect(settingStore.chatSidebarExpanded).toBe(true);
    expect(wrapper.find('[data-testid="panel-splitter"]').classes()).toContain('chat-sider--expanded');
  });

  it('closes sidebar and clears expanded state', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    settingStore.setChatSidebarExpanded(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    await wrapper.find('[data-testid="chat-close-button"]').trigger('click');

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

  it('clears active session when BChat requests a new draft session', async (): Promise<void> => {
    const latestSession = createSession('session-old', '旧会话');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    wrapper.findComponent({ name: 'BChat' }).vm.$emit('draft-session-created');
    await nextTick();

    expect(settingStore.chatSidebarActiveSessionId).toBeNull();
    expect(wrapper.text()).toContain('新会话');
  });

  it('disables session controls while chat is loading', async (): Promise<void> => {
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([]));
    useSettingStore().setSidebarVisible(true);
    const wrapper = mountChatSider();
    await flushPromises();
    await nextTick();

    wrapper.findComponent({ name: 'BChat' }).vm.$emit('loading-change', true);
    await nextTick();

    expect(wrapper.find('[data-testid="chat-new-session-button"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="session-history"]').attributes('disabled')).toBeDefined();
  });
});
