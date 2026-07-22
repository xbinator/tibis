/**
 * @file session-history.test.ts
 * @description 会话历史忙碌状态删除保护测试。
 * @vitest-environment jsdom
 */
import type { ChatSession } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionHistory from '@/components/BChat/components/SessionHistory.vue';
import { useChatTabStore } from '@/stores/chat/tab';

const chatStoreMock = vi.hoisted(() => ({
  sessions: [] as ChatSession[],
  sessionsLoading: false,
  sessionsHasMore: true,
  deleteSession: vi.fn<(sessionId: string) => Promise<void>>()
}));
const messageErrorMock = vi.hoisted(() => vi.fn());
const infiniteScrollState = vi.hoisted(() => ({ callback: undefined as (() => void) | undefined }));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: (): typeof chatStoreMock => chatStoreMock
}));

vi.mock('@vueuse/core', () => ({
  useInfiniteScroll: vi.fn((_target: unknown, callback: () => void): void => {
    infiniteScrollState.callback = callback;
  })
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: messageErrorMock
  }
}));

/**
 * 创建测试会话。
 * @param id - 会话 ID
 * @returns 测试会话
 */
function createSession(id: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title: `会话 ${id}`,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    lastMessageAt: '2026-07-21T00:00:00.000Z'
  };
}

/**
 * 挂载会话历史。
 * @returns 组件包装器
 */
function mountHistory(): ReturnType<typeof mount> {
  return mount(SessionHistory, {
    global: {
      stubs: {
        BDropdown: {
          template: '<div><slot /><slot name="overlay" /></div>'
        },
        BButton: {
          props: ['disabled'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
        },
        BIcon: true
      }
    }
  });
}

describe('SessionHistory busy deletion', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    chatStoreMock.sessions = [createSession('session-a')];
    chatStoreMock.sessionsLoading = false;
    chatStoreMock.sessionsHasMore = true;
    chatStoreMock.deleteSession.mockReset();
    chatStoreMock.deleteSession.mockResolvedValue();
    messageErrorMock.mockReset();
    infiniteScrollState.callback = undefined;
  });

  it('renders the shared Store collection without exposing a refresh method', (): void => {
    const wrapper = mountHistory();

    expect(wrapper.text()).toContain('会话 session-a');
    expect('refreshSessions' in wrapper.vm).toBe(false);
  });

  it('requests the next page through an event when more sessions are available', (): void => {
    const wrapper = mountHistory();

    infiniteScrollState.callback?.();

    expect(wrapper.emitted('load-more')).toEqual([[]]);
  });

  it('always delegates infinite-scroll requests to the Store owner', (): void => {
    chatStoreMock.sessionsHasMore = false;
    chatStoreMock.sessionsLoading = true;
    const wrapper = mountHistory();

    infiniteScrollState.callback?.();

    expect(wrapper.emitted('load-more')).toEqual([[]]);
  });

  it('disables deletion while the session is busy', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    runtimeStore.ensureTab('chat:session-a', 'session-a');
    runtimeStore.setStatus('chat:session-a', 'running');
    const wrapper = mountHistory();
    await flushPromises();

    const deleteButton = wrapper.find('.session-history__actions button');
    expect(deleteButton.attributes('disabled')).toBeDefined();
    await deleteButton.trigger('click');
    await flushPromises();

    expect(chatStoreMock.deleteSession).not.toHaveBeenCalled();
  });

  it('enables deletion when the runtime record is removed', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    runtimeStore.ensureTab('chat:session-a', 'session-a');
    runtimeStore.setStatus('chat:session-a', 'running');
    const wrapper = mountHistory();
    await flushPromises();
    runtimeStore.removeTab('chat:session-a');
    await flushPromises();

    const deleteButton = wrapper.find('.session-history__actions button');
    expect(deleteButton.attributes('disabled')).toBeUndefined();
    await deleteButton.trigger('click');
    await flushPromises();

    expect(chatStoreMock.deleteSession).toHaveBeenCalledWith('session-a');
    expect(wrapper.emitted('delete-session')).toEqual([['session-a']]);
  });

  it('treats waiting status as busy', async (): Promise<void> => {
    const runtimeStore = useChatTabStore();
    runtimeStore.ensureTab('chat:session-a', 'session-a');
    runtimeStore.setStatus('chat:session-a', 'waiting');
    const wrapper = mountHistory();
    await flushPromises();

    const deleteButton = wrapper.find('.session-history__actions button');
    expect(deleteButton.attributes('disabled')).toBeDefined();
  });

  it('deletes and emits when the session is idle', async (): Promise<void> => {
    const wrapper = mountHistory();
    await flushPromises();

    await wrapper.find('.session-history__actions button').trigger('click');
    await flushPromises();

    expect(chatStoreMock.deleteSession).toHaveBeenCalledWith('session-a');
    expect(wrapper.emitted('delete-session')).toEqual([['session-a']]);
  });
});
