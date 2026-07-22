/**
 * @file index.test.ts
 * @description 独立聊天页的标签归属、草稿晋升与后台状态测试。
 * @vitest-environment jsdom
 */
import type { ChatSession } from 'types/chat';
import type { ComponentPublicInstance } from 'vue';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import { useTabsStore } from '@/stores/workspace/tabs';
import ChatPage from '@/views/chat/index.vue';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn<(path: string) => Promise<unknown>>(),
  replace: vi.fn<(path: string) => Promise<unknown>>(),
  route: {
    path: '/chat',
    fullPath: '/chat',
    params: {} as Record<string, string | string[] | undefined>
  }
}));

const routeFailureMock = vi.hoisted(() => ({ type: 'aborted' }));
const abortRuntimeMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const resetDraftMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const ensureSessionsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const messageErrorMock = vi.hoisted(() => vi.fn());

vi.mock('ant-design-vue', () => ({
  message: {
    error: messageErrorMock
  }
}));

vi.mock('vue-router', () => ({
  useRoute: (): typeof routerMocks.route => routerMocks.route,
  useRouter: (): Pick<typeof routerMocks, 'push' | 'replace'> => routerMocks
}));

vi.mock('@/router/navigation', () => ({
  isBlockingNavigationFailure: (result: unknown): boolean => result === routeFailureMock
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: (): { ensureSessions: typeof ensureSessionsMock } => ({
    ensureSessions: ensureSessionsMock
  })
}));

vi.mock('@/components/BChat/index.vue', () => ({
  default: {
    name: 'BChat',
    props: {
      sessionId: {
        type: String,
        default: null
      }
    },
    emits: ['session-created', 'session-title-persisted', 'new-session', 'runtime-status-change', 'runtime-completed', 'navigate-to-provider'],
    setup(_props: unknown, { expose }: { expose: (value: { abortRuntime: () => Promise<void>; resetDraft: () => Promise<void> }) => void }) {
      expose({ abortRuntime: abortRuntimeMock, resetDraft: resetDraftMock });
      return {};
    },
    template: '<div class="b-chat-page-stub"></div>'
  }
}));

/**
 * 创建测试聊天会话。
 * @param id - 会话 ID
 * @param title - 会话标题
 * @returns 会话数据
 */
function createSession(id: string, title: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    lastMessageAt: '2026-07-21T00:00:00.000Z'
  };
}

/**
 * 挂载独立聊天页。
 * @param sessionId - 当前路由会话 ID
 * @returns 页面包装器
 */
function mountPage(sessionId: string | null): ReturnType<typeof mount> {
  routerMocks.route.params = sessionId ? { sessionId } : {};
  return mount(ChatPage);
}

/** 读取页面中的 BChat 实例。 */
function findBChat(wrapper: ReturnType<typeof mount>): ComponentPublicInstance {
  return wrapper.findComponent({ name: 'BChat' }).vm;
}

describe('chat page', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    localStorage.clear();
    routerMocks.push.mockReset();
    routerMocks.replace.mockReset();
    routerMocks.push.mockResolvedValue(undefined);
    routerMocks.replace.mockResolvedValue(undefined);
    routerMocks.route.path = '/chat';
    routerMocks.route.fullPath = '/chat';
    routerMocks.route.params = {};
    abortRuntimeMock.mockReset();
    abortRuntimeMock.mockResolvedValue();
    resetDraftMock.mockReset();
    resetDraftMock.mockResolvedValue();
    ensureSessionsMock.mockReset();
    ensureSessionsMock.mockResolvedValue();
    messageErrorMock.mockReset();
  });

  it('ensures the shared session collection on mount', async (): Promise<void> => {
    mountPage('session-a');
    await flushPromises();

    expect(ensureSessionsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps shared session initialization silent when loading fails', async (): Promise<void> => {
    ensureSessionsMock.mockRejectedValue(new Error('load failed'));

    mountPage('session-a');
    await flushPromises();

    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('captures the route session for draft and persisted pages', (): void => {
    const draftWrapper = mountPage(null);
    const persistedWrapper = mountPage('session-a');

    expect(draftWrapper.findComponent({ name: 'BChat' }).props()).toEqual({ sessionId: null });
    expect(persistedWrapper.findComponent({ name: 'BChat' }).props()).toEqual({ sessionId: 'session-a' });
  });

  it('keeps the captured session when the global route changes', async (): Promise<void> => {
    const wrapper = mountPage('session-a');

    routerMocks.route.params.sessionId = 'session-b';
    await nextTick();

    expect(wrapper.findComponent({ name: 'BChat' }).props('sessionId')).toBe('session-a');
  });

  it('binds a draft session immediately but promotes only after runtime becomes idle', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    const runtimeStore = useChatTabRuntimeStore();
    tabsStore.tabs = [{ id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' }];
    const wrapper = mountPage(null);

    findBChat(wrapper).$emit('runtime-status-change', 'running');
    findBChat(wrapper).$emit('session-created', createSession('session-a', '会话 A'));
    await flushPromises();

    expect(runtimeStore.findOwner('session-a')?.tabId).toBe('chat:new');
    expect(tabsStore.tabs[0]?.id).toBe('chat:new');
    expect(routerMocks.replace).not.toHaveBeenCalled();

    findBChat(wrapper).$emit('runtime-status-change', 'idle');
    await flushPromises();

    expect(tabsStore.tabs[0]).toMatchObject({ id: 'chat:session-a', path: '/chat/session-a', title: '会话 A' });
    expect(runtimeStore.findOwner('session-a')?.tabId).toBe('chat:session-a');
    expect(routerMocks.replace).toHaveBeenCalledWith('/chat/session-a');
  });

  it('promotes an inactive draft without replacing the unrelated active route', async (): Promise<void> => {
    routerMocks.route.path = '/welcome';
    routerMocks.route.fullPath = '/welcome';
    const tabsStore = useTabsStore();
    tabsStore.tabs = [
      { id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' },
      { id: 'welcome', path: '/welcome', title: '欢迎', cacheKey: 'welcome' }
    ];
    const wrapper = mountPage(null);

    findBChat(wrapper).$emit('session-created', createSession('session-a', '会话 A'));
    findBChat(wrapper).$emit('runtime-status-change', 'idle');
    await flushPromises();

    expect(tabsStore.tabs[0]).toMatchObject({ id: 'chat:session-a', path: '/chat/session-a' });
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it('rolls back draft promotion when route replacement resolves with a navigation failure', async (): Promise<void> => {
    const tabsStore = useTabsStore();
    const runtimeStore = useChatTabRuntimeStore();
    tabsStore.tabs = [{ id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' }];
    routerMocks.replace.mockResolvedValue(routeFailureMock);
    const wrapper = mountPage(null);

    findBChat(wrapper).$emit('session-created', createSession('session-a', '会话 A'));
    findBChat(wrapper).$emit('runtime-status-change', 'idle');
    await flushPromises();

    expect(tabsStore.tabs[0]).toMatchObject({ id: 'chat:new', path: '/chat' });
    expect(runtimeStore.findOwner('session-a')?.tabId).toBe('chat:new');
  });

  it('opens a branch as a separate persisted chat tab', async (): Promise<void> => {
    routerMocks.route.path = '/chat/session-a';
    routerMocks.route.fullPath = '/chat/session-a';
    const wrapper = mountPage('session-a');

    findBChat(wrapper).$emit('session-created', createSession('session-c', '分支 C'));
    await flushPromises();

    expect(routerMocks.push).toHaveBeenCalledWith('/chat/session-c');
  });

  it('opens or reuses the unique draft route for a new-session request', async (): Promise<void> => {
    routerMocks.route.path = '/chat/session-a';
    routerMocks.route.fullPath = '/chat/session-a';
    const tabsStore = useTabsStore();
    tabsStore.tabs = [{ id: 'chat:new', path: '/chat', title: '新会话', cacheKey: 'chat:new' }];
    const wrapper = mountPage('session-a');

    findBChat(wrapper).$emit('new-session');
    await flushPromises();

    expect(routerMocks.push).toHaveBeenCalledWith('/chat');
  });

  it('resets the active draft without navigating', async (): Promise<void> => {
    const wrapper = mountPage(null);

    findBChat(wrapper).$emit('new-session');
    await flushPromises();

    expect(resetDraftMock).toHaveBeenCalledTimes(1);
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it('updates only the inactive owner status when chat waits for user input', async (): Promise<void> => {
    routerMocks.route.path = '/welcome';
    routerMocks.route.fullPath = '/welcome';
    const runtimeStore = useChatTabRuntimeStore();
    const wrapper = mountPage('session-a');

    findBChat(wrapper).$emit('runtime-status-change', 'waiting');
    await flushPromises();

    expect(runtimeStore.getStatus('chat:session-a')).toBe('waiting');
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it('marks a background completion unread and clears it when mounted as active', async (): Promise<void> => {
    routerMocks.route.path = '/welcome';
    routerMocks.route.fullPath = '/welcome';
    const runtimeStore = useChatTabRuntimeStore();
    const wrapper = mountPage('session-a');

    findBChat(wrapper).$emit('runtime-completed', 'session-a');
    await flushPromises();
    expect(runtimeStore.getStatus('chat:session-a')).toBe('completed');
    wrapper.unmount();

    routerMocks.route.path = '/chat/session-a';
    routerMocks.route.fullPath = '/chat/session-a';
    const activeWrapper = mountPage('session-a');
    await flushPromises();

    expect(runtimeStore.getStatus('chat:session-a')).toBe('idle');
    activeWrapper.unmount();
  });

  it('registers a controller that aborts through the mounted BChat instance', async (): Promise<void> => {
    const runtimeStore = useChatTabRuntimeStore();
    mountPage('session-a');
    runtimeStore.setStatus('chat:session-a', 'running');

    await runtimeStore.abortTabs(['chat:session-a']);

    expect(abortRuntimeMock).toHaveBeenCalledTimes(1);
  });
});
