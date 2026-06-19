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

/**
 * Todo 写入快照
 */
export interface TodoWriteSnapshot {
  /** 产生本次写入的 runtime ID */
  sourceRuntimeId: string;
  /** 写入前的待办列表 */
  beforeTodos: TodoItem[];
  /** 写入后的待办列表 */
  afterTodos: TodoItem[];
  /** 快照创建时间 */
  createdAt: string;
}

/**
 * 设置 Todo 列表的选项
 */
export interface SetTodosOptions {
  /** 产生本次写入的 runtime ID，用于回退时恢复快照 */
  sourceRuntimeId?: string;
}

const TODO_STORAGE_KEY = 'chat_session_todos';

/**
 * 持久化状态结构
 */
interface PersistedTodoState {
  /** 按 sessionId 存储的待办列表 */
  sessionTodos: Record<string, TodoItem[]>;
  /** 按 sessionId 存储的 Todo 写入快照 */
  sessionTodoSnapshots: Record<string, TodoWriteSnapshot[]>;
}

const DEFAULT_TODO_STATE: PersistedTodoState = {
  sessionTodos: {},
  sessionTodoSnapshots: {}
};

/**
 * 克隆待办列表，避免快照受外部引用后续修改影响。
 * @param todos - 待克隆的待办列表
 * @returns 克隆后的待办列表
 */
function cloneTodos(todos: TodoItem[]): TodoItem[] {
  return todos.map((todo) => ({ ...todo }));
}

/**
 * 克隆按会话分组的待办列表。
 * @param sessionTodos - 原始会话待办映射
 * @returns 克隆后的会话待办映射
 */
function cloneSessionTodos(sessionTodos: Record<string, TodoItem[]>): Record<string, TodoItem[]> {
  return Object.fromEntries(Object.entries(sessionTodos).map(([sessionId, todos]) => [sessionId, cloneTodos(todos)]));
}

/**
 * 克隆按会话分组的写入快照。
 * @param sessionTodoSnapshots - 原始会话快照映射
 * @returns 克隆后的会话快照映射
 */
function cloneSessionTodoSnapshots(sessionTodoSnapshots: Record<string, TodoWriteSnapshot[]>): Record<string, TodoWriteSnapshot[]> {
  return Object.fromEntries(
    Object.entries(sessionTodoSnapshots).map(([sessionId, snapshots]) => [
      sessionId,
      snapshots.map((snapshot) => ({
        sourceRuntimeId: snapshot.sourceRuntimeId,
        beforeTodos: cloneTodos(snapshot.beforeTodos),
        afterTodos: cloneTodos(snapshot.afterTodos),
        createdAt: snapshot.createdAt
      }))
    ])
  );
}

/**
 * 归一化待办列表。
 * @param value - 原始待办列表
 * @returns 合法待办列表，非法时返回 null
 */
function normalizeTodoItems(value: unknown): TodoItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is TodoItem => isPlainObject(item) && isString(item.content) && isString(item.status) && isString(item.priority));
}

/**
 * 判断值是否为合法 Todo 写入快照。
 * @param value - 原始快照值
 * @returns 是否为合法快照
 */
function isTodoWriteSnapshot(value: unknown): value is TodoWriteSnapshot {
  if (!isPlainObject(value)) {
    return false;
  }

  const snapshot = value as Partial<TodoWriteSnapshot>;
  return (
    isString(snapshot.sourceRuntimeId) &&
    isString(snapshot.createdAt) &&
    normalizeTodoItems(snapshot.beforeTodos) !== null &&
    normalizeTodoItems(snapshot.afterTodos) !== null
  );
}

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
      const normalizedTodos = normalizeTodoItems(todos);
      if (normalizedTodos) {
        validSessions[sessionId] = normalizedTodos;
      }
    }

    normalized.sessionTodos = validSessions;
  }

  if (isPlainObject(state.sessionTodoSnapshots)) {
    const sessions = state.sessionTodoSnapshots as Record<string, unknown>;
    const validSnapshots: Record<string, TodoWriteSnapshot[]> = {};

    for (const [sessionId, snapshots] of Object.entries(sessions)) {
      if (Array.isArray(snapshots)) {
        validSnapshots[sessionId] = snapshots.filter(isTodoWriteSnapshot).map((snapshot) => ({
          sourceRuntimeId: snapshot.sourceRuntimeId,
          beforeTodos: cloneTodos(snapshot.beforeTodos),
          afterTodos: cloneTodos(snapshot.afterTodos),
          createdAt: snapshot.createdAt
        }));
      }
    }

    normalized.sessionTodoSnapshots = validSnapshots;
  }

  return normalized;
}

const TODO_PERSIST_CONFIG: PersistConfig<PersistedTodoState> = {
  storageKey: TODO_STORAGE_KEY,
  defaults: DEFAULT_TODO_STATE,
  normalize: normalizeTodoState
};

export const useTodoStore = defineStore('todo', {
  state: (): PersistedTodoState => {
    const persisted = loadPersistedState(TODO_PERSIST_CONFIG);
    return {
      sessionTodos: cloneSessionTodos(persisted.sessionTodos),
      sessionTodoSnapshots: cloneSessionTodoSnapshots(persisted.sessionTodoSnapshots)
    };
  },

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
        sessionTodos: this.sessionTodos,
        sessionTodoSnapshots: this.sessionTodoSnapshots
      });
    },

    /**
     * 全量替换指定会话的待办列表。
     * 传入空数组时删除该会话的条目。
     * @param sessionId - 会话 ID
     * @param todos - 新的待办列表
     * @param options - 设置选项
     */
    setTodos(sessionId: string, todos: TodoItem[], options: SetTodosOptions = {}): void {
      if (options.sourceRuntimeId) {
        const snapshots = this.sessionTodoSnapshots[sessionId] ?? [];
        snapshots.push({
          sourceRuntimeId: options.sourceRuntimeId,
          beforeTodos: cloneTodos(this.sessionTodos[sessionId] ?? []),
          afterTodos: cloneTodos(todos),
          createdAt: new Date().toISOString()
        });
        this.sessionTodoSnapshots[sessionId] = snapshots;
      }

      if (todos.length === 0) {
        delete this.sessionTodos[sessionId];
      } else {
        this.sessionTodos[sessionId] = cloneTodos(todos);
      }
      this.persist();
    },

    /**
     * 按被回退消息的 runtime ID 恢复到最早匹配快照之前。
     * @param sessionId - 会话 ID
     * @param runtimeIds - 被回退消息区间包含的 runtime ID
     * @returns 是否执行了恢复
     */
    restoreBeforeRuntimeIds(sessionId: string, runtimeIds: string[]): boolean {
      const runtimeIdSet = new Set(runtimeIds);
      const snapshots = this.sessionTodoSnapshots[sessionId] ?? [];
      const snapshotIndex = snapshots.findIndex((snapshot) => runtimeIdSet.has(snapshot.sourceRuntimeId));

      if (snapshotIndex === -1) {
        return false;
      }

      const snapshot = snapshots[snapshotIndex];
      if (snapshot.beforeTodos.length === 0) {
        delete this.sessionTodos[sessionId];
      } else {
        this.sessionTodos[sessionId] = cloneTodos(snapshot.beforeTodos);
      }

      this.sessionTodoSnapshots[sessionId] = snapshots.slice(0, snapshotIndex);
      this.persist();
      return true;
    },

    /**
     * 清空指定会话的待办列表。
     * @param sessionId - 会话 ID
     */
    clearTodos(sessionId: string): void {
      if (this.sessionTodos[sessionId] || this.sessionTodoSnapshots[sessionId]) {
        delete this.sessionTodos[sessionId];
        delete this.sessionTodoSnapshots[sessionId];
        this.persist();
      }
    },

    /**
     * 清空全部会话的待办数据。
     */
    clearAllTodos(): void {
      this.sessionTodos = {};
      this.sessionTodoSnapshots = {};
      this.persist();
    }
  }
});
