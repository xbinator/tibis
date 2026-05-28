/**
 * @file todo.test.ts
 * @description Todo Store 测试，验证全量替换、持久化和级联清理行为。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TODO_STORAGE_KEY = 'chat_session_todos';
const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

describe('useTodoStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('returns empty sessionTodos when no persisted data exists', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    expect(store.sessionTodos).toEqual({});
  });

  it('setTodos replaces todos for a session and persists', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    store.setTodos('session-1', [
      { content: 'Task A', status: 'pending', priority: 'high' },
      { content: 'Task B', status: 'in_progress', priority: 'medium' }
    ]);

    expect(store.getTodos('session-1')).toHaveLength(2);
    expect(store.getTodos('session-1')[0].content).toBe('Task A');
    expect(localStorage.getItem(TODO_STORAGE_KEY)).toContain('session-1');
  });

  it('setTodos with empty array clears session todos', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    store.setTodos('session-1', [{ content: 'Task A', status: 'pending', priority: 'high' }]);
    store.setTodos('session-1', []);

    expect(store.getTodos('session-1')).toEqual([]);
    expect(store.sessionTodos['session-1']).toBeUndefined();
  });

  it('clearTodos removes a specific session and persists', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    store.setTodos('session-1', [{ content: 'Task A', status: 'pending', priority: 'high' }]);
    store.setTodos('session-2', [{ content: 'Task B', status: 'completed', priority: 'low' }]);
    store.clearTodos('session-1');

    expect(store.getTodos('session-1')).toEqual([]);
    expect(store.getTodos('session-2')).toHaveLength(1);
  });

  it('clearAllTodos removes all session todos', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    store.setTodos('session-1', [{ content: 'Task A', status: 'pending', priority: 'high' }]);
    store.setTodos('session-2', [{ content: 'Task B', status: 'completed', priority: 'low' }]);
    store.clearAllTodos();

    expect(store.sessionTodos).toEqual({});
  });

  it('restores persisted data after re-initialization', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    store.setTodos('session-1', [{ content: 'Persisted Task', status: 'pending', priority: 'high' }]);

    vi.resetModules();
    setActivePinia(createPinia());

    const { useTodoStore: useReloaded } = await import('@/stores/chat/todo');
    const reloaded = useReloaded();

    expect(reloaded.getTodos('session-1')).toHaveLength(1);
    expect(reloaded.getTodos('session-1')[0].content).toBe('Persisted Task');
  });

  it('getTodos returns empty array for unknown session', async () => {
    const { useTodoStore } = await import('@/stores/chat/todo');
    const store = useTodoStore();

    expect(store.getTodos('unknown-session')).toEqual([]);
  });
});
