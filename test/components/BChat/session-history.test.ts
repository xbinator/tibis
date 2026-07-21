/**
 * @file session-history.test.ts
 * @description 会话历史忙碌状态删除保护测试。
 * @vitest-environment jsdom
 */
import type { ChatSession, PaginatedSessionsResult } from 'types/chat';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionHistory from '@/components/BChat/components/SessionHistory.vue';

const chatStoreMock = vi.hoisted(() => ({
  getSessions: vi.fn<() => Promise<PaginatedSessionsResult>>(),
  deleteSession: vi.fn<(sessionId: string) => Promise<void>>()
}));
const messageErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: (): typeof chatStoreMock => chatStoreMock
}));

vi.mock('@vueuse/core', () => ({
  useInfiniteScroll: vi.fn()
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
 * @param busySessionIds - 禁止删除的忙碌会话 ID
 * @returns 组件包装器
 */
function mountHistory(busySessionIds: string[] = []): ReturnType<typeof mount> {
  return mount(SessionHistory, {
    props: { busySessionIds },
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
    chatStoreMock.getSessions.mockReset();
    chatStoreMock.deleteSession.mockReset();
    chatStoreMock.getSessions.mockResolvedValue({ items: [createSession('session-a')], hasMore: false });
    chatStoreMock.deleteSession.mockResolvedValue();
    messageErrorMock.mockReset();
  });

  it('disables deletion while the session is busy', async (): Promise<void> => {
    const wrapper = mountHistory(['session-a']);
    await flushPromises();

    const deleteButton = wrapper.find('.session-history__actions button');
    expect(deleteButton.attributes('disabled')).toBeDefined();
    await deleteButton.trigger('click');
    await flushPromises();

    expect(chatStoreMock.deleteSession).not.toHaveBeenCalled();
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
