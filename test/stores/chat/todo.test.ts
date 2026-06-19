/**
 * @file todo.test.ts
 * @description 会话级 todo store 快照回滚测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTodoStore, type TodoItem } from '@/stores/chat/todo';

/**
 * 创建测试 todo。
 * @param content - 任务内容
 * @param status - 任务状态
 * @returns 测试 todo
 */
function createTodo(content: string, status: TodoItem['status'] = 'pending'): TodoItem {
  return {
    content,
    status,
    priority: 'medium'
  };
}

describe('useTodoStore', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('restores todos to the snapshot before a rolled-back runtime', (): void => {
    const todoStore = useTodoStore();
    const firstRoundTodos = [createTodo('阅读需求'), createTodo('实现功能')];
    const secondRoundTodos = [createTodo('阅读需求', 'completed'), createTodo('实现功能'), createTodo('补充测试')];

    todoStore.setTodos('session-1', firstRoundTodos);
    todoStore.setTodos('session-1', secondRoundTodos, { sourceRuntimeId: 'runtime-2' });

    const restored = todoStore.restoreBeforeRuntimeIds('session-1', ['runtime-2']);

    expect(restored).toBe(true);
    expect(todoStore.getTodos('session-1')).toEqual(firstRoundTodos);
  });

  it('clears todos when restoring to an empty pre-runtime snapshot', (): void => {
    const todoStore = useTodoStore();
    const generatedTodos = [createTodo('生成任务')];

    todoStore.setTodos('session-1', generatedTodos, { sourceRuntimeId: 'runtime-1' });

    const restored = todoStore.restoreBeforeRuntimeIds('session-1', ['runtime-1']);

    expect(restored).toBe(true);
    expect(todoStore.getTodos('session-1')).toEqual([]);
  });

  it('keeps current todos when rolled-back runtimes have no snapshots', (): void => {
    const todoStore = useTodoStore();
    const currentTodos = [createTodo('保留任务')];

    todoStore.setTodos('session-1', currentTodos);

    const restored = todoStore.restoreBeforeRuntimeIds('session-1', ['runtime-missing']);

    expect(restored).toBe(false);
    expect(todoStore.getTodos('session-1')).toEqual(currentTodos);
  });
});
