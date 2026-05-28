/**
 * @file todo.ts
 * @description 会话级待办任务 Store，管理全量替换式任务列表与 localStorage 持久化。
 */
import { defineStore } from 'pinia';
import { isPlainObject, isString } from 'lodash-es';
import { loadPersistedState, persistState } from '@/stores/helpers/persist';
import type { PersistConfig } from '@/stores/helpers/types';

/**
 * 单个待办任务
 */
export interface TodoItem {
  /** 任务内容描述 */
  content: string;
  /** 任务状态 */
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
}

const TODO_STORAGE_KEY = 'chat_session_todos';

/**
 * 持久化状态结构
 */
interface PersistedTodoState {
  /** 按 sessionId 存储的待办列表 */
  sessionTodos: Record<string, TodoItem[]>;
}

const DEFAULT_TODO_STATE: PersistedTodoState = {
  sessionTodos: {}
};

/**
 * 归一化持久化数据，确保结构合法
 * @param value - 原始持久化数据
 * @returns 归一化后的状态
 */
function normalizeTodoState(value: unknown): PersistedTodoState {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_TODO_STATE };
  }

  const state = value as Partial<PersistedTodoState>;
  const normalized = { ...DEFAULT_TODO_STATE };

  if (isPlainObject(state.sessionTodos)) {
    const sessions = state.sessionTodos as Record<string, unknown>;
    const validSessions: Record<string, TodoItem[]> = {};

    for (const [sessionId, todos] of Object.entries(sessions)) {
      if (Array.isArray(todos)) {
        validSessions[sessionId] = todos.filter(
          (item): item is TodoItem => isPlainObject(item) && isString(item.content) && isString(item.status) && isString(item.priority)
        );
      }
    }

    normalized.sessionTodos = validSessions;
  }

  return normalized;
}

const TODO_PERSIST_CONFIG: PersistConfig<PersistedTodoState> = {
  storageKey: TODO_STORAGE_KEY,
  defaults: DEFAULT_TODO_STATE,
  normalize: normalizeTodoState
};

export const useTodoStore = defineStore('todo', {
  state: (): PersistedTodoState => ({
    ...loadPersistedState(TODO_PERSIST_CONFIG)
  }),

  getters: {
    /**
     * 读取指定会话的待办列表。
     * @param state - Store 状态
     * @returns 获取待办列表的函数
     */
    getTodos: (state) => {
      return (sessionId: string): TodoItem[] => state.sessionTodos[sessionId] ?? [];
    }
  },

  actions: {
    /**
     * 持久化当前状态到 localStorage。
     */
    persist(): void {
      persistState(TODO_PERSIST_CONFIG.storageKey, {
        sessionTodos: this.sessionTodos
      });
    },

    /**
     * 全量替换指定会话的待办列表。
     * 传入空数组时删除该会话的条目。
     * @param sessionId - 会话 ID
     * @param todos - 新的待办列表
     */
    setTodos(sessionId: string, todos: TodoItem[]): void {
      if (todos.length === 0) {
        delete this.sessionTodos[sessionId];
      } else {
        this.sessionTodos[sessionId] = todos;
      }
      this.persist();
    },

    /**
     * 清空指定会话的待办列表。
     * @param sessionId - 会话 ID
     */
    clearTodos(sessionId: string): void {
      if (this.sessionTodos[sessionId]) {
        delete this.sessionTodos[sessionId];
        this.persist();
      }
    },

    /**
     * 清空全部会话的待办数据。
     */
    clearAllTodos(): void {
      this.sessionTodos = {};
      this.persist();
    }
  }
});
