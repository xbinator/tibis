/**
 * @file tab-runtime.test.ts
 * @description 聊天标签运行时归属、状态与控制器测试。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isActiveRuntimeStatus, useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';

describe('chat tab runtime store', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('promotes draft ownership and controller to the persisted tab', async (): Promise<void> => {
    const store = useChatTabRuntimeStore();
    const abort = vi.fn<() => Promise<void>>().mockResolvedValue();
    store.ensureTab('chat:new');
    store.bindSession('chat:new', 'session-a');
    store.setStatus('chat:new', 'running');
    store.registerController('chat:new', { abort });

    store.promoteTab('chat:new', 'chat:session-a', 'session-a');

    expect(store.findOwner('session-a')?.tabId).toBe('chat:session-a');
    expect(store.records['chat:new']).toBeUndefined();
    await store.abortTabs(['chat:session-a']);
    expect(abort).toHaveBeenCalledOnce();
  });

  it('keeps completed unread until the tab is viewed', (): void => {
    const store = useChatTabRuntimeStore();
    store.ensureTab('chat:session-a', 'session-a');
    store.setStatus('chat:session-a', 'running');
    store.markCompleted('chat:session-a', false);
    store.setStatus('chat:session-a', 'idle');

    expect(store.getStatus('chat:session-a')).toBe('completed');
    store.markViewed('chat:session-a');
    expect(store.getStatus('chat:session-a')).toBe('idle');
  });

  it('does not mark an active completed tab as unread', (): void => {
    const store = useChatTabRuntimeStore();
    store.ensureTab('chat:session-a', 'session-a');
    store.setStatus('chat:session-a', 'running');

    store.markCompleted('chat:session-a', true);

    expect(store.getStatus('chat:session-a')).toBe('idle');
  });

  it('stores only runtime ownership and status for a waiting tab', (): void => {
    const store = useChatTabRuntimeStore();
    store.ensureTab('chat:session-a', 'session-a');
    store.setStatus('chat:session-a', 'waiting');

    expect(store.records['chat:session-a']).toEqual({ tabId: 'chat:session-a', sessionId: 'session-a', status: 'waiting' });
  });

  it('classifies only running and waiting as active runtime states', (): void => {
    expect(isActiveRuntimeStatus('running')).toBe(true);
    expect(isActiveRuntimeStatus('waiting')).toBe(true);
    expect(isActiveRuntimeStatus('idle')).toBe(false);
    expect(isActiveRuntimeStatus('error')).toBe(false);
    expect(isActiveRuntimeStatus('completed')).toBe(false);
  });

  it('aborts only running or waiting target tabs', async (): Promise<void> => {
    const store = useChatTabRuntimeStore();
    const runningAbort = vi.fn<() => Promise<void>>().mockResolvedValue();
    const idleAbort = vi.fn<() => Promise<void>>().mockResolvedValue();
    store.ensureTab('chat:running', 'running');
    store.ensureTab('chat:idle', 'idle');
    store.setStatus('chat:running', 'running');
    store.registerController('chat:running', { abort: runningAbort });
    store.registerController('chat:idle', { abort: idleAbort });

    await store.abortTabs(['chat:running', 'chat:idle']);

    expect(runningAbort).toHaveBeenCalledOnce();
    expect(idleAbort).not.toHaveBeenCalled();
  });

  it('rejects an active runtime without a registered controller', async (): Promise<void> => {
    const store = useChatTabRuntimeStore();
    store.ensureTab('chat:session-a', 'session-a');
    store.setStatus('chat:session-a', 'waiting');

    await expect(store.abortTabs(['chat:session-a'])).rejects.toThrow('chat:session-a');
  });

  it('rejects a partially failed batch after invoking every active controller', async (): Promise<void> => {
    const store = useChatTabRuntimeStore();
    const abortA = vi.fn<() => Promise<void>>().mockResolvedValue();
    const abortB = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('abort B failed'));
    store.setStatus('chat:session-a', 'running');
    store.setStatus('chat:session-b', 'waiting');
    store.registerController('chat:session-a', { abort: abortA });
    store.registerController('chat:session-b', { abort: abortB });

    await expect(store.abortTabs(['chat:session-a', 'chat:session-b'])).rejects.toThrow('abort B failed');
    expect(abortA).toHaveBeenCalledOnce();
    expect(abortB).toHaveBeenCalledOnce();
  });
});
