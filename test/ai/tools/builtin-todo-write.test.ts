/**
 * @file builtin-todo-write.test.ts
 * @description todowrite 工具写入快照测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBuiltinTodoWriteTool, TODO_WRITE_TOOL_NAME } from '@/ai/tools/builtin/TodoWriteTool';
import { executeToolCall } from '@/ai/tools/stream';
import { useTodoStore, type TodoItem } from '@/stores/chat/todo';

/**
 * 创建测试 todo。
 * @param content - 任务内容
 * @returns 测试 todo
 */
function createTodo(content: string): TodoItem {
  return {
    content,
    status: 'pending',
    priority: 'medium'
  };
}

describe('todowrite tool', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('records a runtime snapshot when executed from a runtime tool request', async (): Promise<void> => {
    const todoStore = useTodoStore();
    const tool = createBuiltinTodoWriteTool({ getSessionId: () => 'session-1' });

    await executeToolCall(
      {
        toolCallId: 'tool-call-1',
        toolName: TODO_WRITE_TOOL_NAME,
        input: { todos: [createTodo('生成任务')] }
      },
      [tool],
      undefined,
      { runtimeId: 'runtime-1' }
    );

    const restored = todoStore.restoreBeforeRuntimeIds('session-1', ['runtime-1']);

    expect(restored).toBe(true);
    expect(todoStore.getTodos('session-1')).toEqual([]);
  });
});
