/**
 * @file TodoWriteTool/index.ts
 * @description 内置待办任务写入工具，采用全量替换策略。
 */
import type { AIToolExecutionResult, AIToolExecutor } from 'types/ai';
import { useTodoStore } from '@/stores/chat/todo';
import type { TodoItem } from '@/stores/chat/todo';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** todowrite 工具名称 */
export const TODO_WRITE_TOOL_NAME = 'todowrite';

/** 最大允许的任务数量 */
export const MAX_TODO_ITEMS_EXPORT = 50;

/** 合法的任务状态值 */
const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

/** 合法的优先级值 */
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);

/**
 * todowrite 工具输入参数
 */
export interface TodoWriteInput {
  /** 完整的任务列表，将替换现有列表 */
  todos: TodoItem[];
  /** 内部注入的 runtime ID，不暴露给模型 schema */
  sourceRuntimeId?: string;
}

/**
 * todowrite 工具执行结果
 */
export interface TodoWriteResult {
  /** 更新后的任务数量 */
  count: number;
  /** 各状态计数 */
  stats: { pending: number; in_progress: number; completed: number; cancelled: number };
}

/**
 * 创建 todowrite 工具的选项
 */
export interface CreateTodoWriteToolOptions {
  /** 获取当前活跃会话 ID */
  getSessionId: () => string | undefined;
}

/**
 * 验证单个 TodoItem 的字段合法性
 * @param item - 待验证的任务项
 * @param index - 在数组中的索引（用于错误提示）
 * @returns 错误消息，合法时返回 null
 */
function validateTodoItem(item: unknown, index: number): string | null {
  if (!item || typeof item !== 'object') {
    return `todos[${index}] 必须为对象`;
  }

  const record = item as Record<string, unknown>;

  if (typeof record.content !== 'string' || record.content.trim().length === 0) {
    return `todos[${index}].content 必须为非空白字符串`;
  }

  if (typeof record.status !== 'string' || !VALID_STATUSES.has(record.status)) {
    return `todos[${index}].status 必须为 pending/in_progress/completed/cancelled 之一`;
  }

  if (typeof record.priority !== 'string' || !VALID_PRIORITIES.has(record.priority)) {
    return `todos[${index}].priority 必须为 high/medium/low 之一`;
  }

  return null;
}

/**
 * 创建内置 todowrite 工具。
 * @param options - 工厂依赖
 * @returns 工具执行器
 */
export function createBuiltinTodoWriteTool(options: CreateTodoWriteToolOptions): AIToolExecutor<TodoWriteInput, TodoWriteResult> {
  return {
    definition: {
      name: TODO_WRITE_TOOL_NAME,
      description: '创建或更新当前会话的任务列表。每次调用传入完整的任务列表，替换旧列表。空数组表示清空任务列表。',
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      safeAutoApprove: true,
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: '完整的任务列表，将替换现有列表。空数组表示清空。',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: '任务内容' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'], description: '任务状态' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' }
              },
              required: ['content', 'status', 'priority'],
              additionalProperties: false
            }
          }
        },
        required: ['todos'],
        additionalProperties: false
      }
    },

    async execute(input: TodoWriteInput): Promise<AIToolExecutionResult<TodoWriteResult>> {
      const sessionId = options.getSessionId();

      if (!sessionId) {
        return createToolFailureResult(TODO_WRITE_TOOL_NAME, 'EXECUTION_FAILED', '无活跃会话，无法更新任务列表');
      }

      if (!Array.isArray(input.todos)) {
        return createToolFailureResult(TODO_WRITE_TOOL_NAME, 'INVALID_INPUT', 'todos 必须为数组');
      }

      if (input.todos.length > MAX_TODO_ITEMS_EXPORT) {
        return createToolFailureResult(TODO_WRITE_TOOL_NAME, 'INVALID_INPUT', `任务数量超过上限（${MAX_TODO_ITEMS_EXPORT}）`);
      }

      for (let i = 0; i < input.todos.length; i++) {
        const error = validateTodoItem(input.todos[i], i);
        if (error) {
          return createToolFailureResult(TODO_WRITE_TOOL_NAME, 'INVALID_INPUT', error);
        }
      }

      const normalizedTodos: TodoItem[] = input.todos.map((item) => {
        const raw = item as unknown as Record<string, string>;
        return {
          content: raw.content.trim(),
          status: raw.status as TodoItem['status'],
          priority: raw.priority as TodoItem['priority']
        };
      });

      const todoStore = useTodoStore();
      todoStore.setTodos(sessionId, normalizedTodos, input.sourceRuntimeId ? { sourceRuntimeId: input.sourceRuntimeId } : undefined);

      const stats = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
      for (const todo of normalizedTodos) {
        stats[todo.status] += 1;
      }

      return createToolSuccessResult(TODO_WRITE_TOOL_NAME, {
        count: normalizedTodos.length,
        stats
      });
    }
  };
}
