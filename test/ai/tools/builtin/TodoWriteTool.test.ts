/**
 * @file TodoWriteTool.test.ts
 * @description TodoWriteTool 测试，验证输入校验、全量替换和统计输出。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('TodoWriteTool', () => {
  let sessionId: string;
  let getSessionId: () => string | undefined;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
    sessionId = 'test-session-1';
    getSessionId = () => sessionId;
  });

  it('fails when no active session', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId: () => undefined });

    const result = await tool.execute({ todos: [{ content: 'Task', status: 'pending', priority: 'high' }] });

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.code).toBe('EXECUTION_FAILED');
      expect(result.error.message).toContain('无活跃会话');
    }
  });

  it('fails when todos is not an array', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    const result = await tool.execute({ todos: 'not-array' as unknown as never[] });

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.code).toBe('INVALID_INPUT');
      expect(result.error.message).toContain('数组');
    }
  });

  it('fails when todos exceeds max limit', async () => {
    const { createBuiltinTodoWriteTool, MAX_TODO_ITEMS_EXPORT } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    const tooMany = Array.from({ length: MAX_TODO_ITEMS_EXPORT + 1 }, (_, i) => ({
      content: `Task ${i}`,
      status: 'pending' as const,
      priority: 'low' as const
    }));

    const result = await tool.execute({ todos: tooMany });

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.code).toBe('INVALID_INPUT');
      expect(result.error.message).toContain('超过上限');
    }
  });

  it('fails when content is blank', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    const result = await tool.execute({ todos: [{ content: '   ', status: 'pending', priority: 'high' }] });

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.code).toBe('INVALID_INPUT');
      expect(result.error.message).toContain('非空白字符串');
    }
  });

  it('fails when status is invalid', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    const result = await tool.execute({ todos: [{ content: 'Task', status: 'invalid' as unknown as 'pending', priority: 'high' }] });

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.code).toBe('INVALID_INPUT');
      expect(result.error.message).toContain('status');
    }
  });

  it('fails when priority is invalid', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    const result = await tool.execute({ todos: [{ content: 'Task', status: 'pending', priority: 'urgent' as unknown as 'low' }] });

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.code).toBe('INVALID_INPUT');
      expect(result.error.message).toContain('priority');
    }
  });

  it('succeeds with valid todos and returns stats', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    const result = await tool.execute({
      todos: [
        { content: 'Task A', status: 'pending', priority: 'high' },
        { content: 'Task B', status: 'in_progress', priority: 'medium' },
        { content: 'Task C', status: 'completed', priority: 'low' },
        { content: 'Task D', status: 'cancelled', priority: 'low' }
      ]
    });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.count).toBe(4);
      expect(result.data.stats.pending).toBe(1);
      expect(result.data.stats.in_progress).toBe(1);
      expect(result.data.stats.completed).toBe(1);
      expect(result.data.stats.cancelled).toBe(1);
    }
  });

  it('trims content whitespace', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const { useTodoStore } = await import('@/stores/chat/todo');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    await tool.execute({ todos: [{ content: '  Trimmed Task  ', status: 'pending', priority: 'high' }] });

    const store = useTodoStore();
    const todos = store.getTodos(sessionId);
    expect(todos[0].content).toBe('Trimmed Task');
  });

  it('clears todos when empty array is passed', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const { useTodoStore } = await import('@/stores/chat/todo');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    // 先添加任务
    await tool.execute({ todos: [{ content: 'Task A', status: 'pending', priority: 'high' }] });
    // 再清空
    const result = await tool.execute({ todos: [] });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.count).toBe(0);
    }

    const store = useTodoStore();
    expect(store.getTodos(sessionId)).toEqual([]);
  });

  it('tool definition has safeAutoApprove true', async () => {
    const { createBuiltinTodoWriteTool } = await import('@/ai/tools/builtin/TodoWriteTool');
    const tool = createBuiltinTodoWriteTool({ getSessionId });

    expect(tool.definition.safeAutoApprove).toBe(true);
    expect(tool.definition.riskLevel).toBe('read');
    expect(tool.definition.requiresActiveDocument).toBe(false);
  });
});
