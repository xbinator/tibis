# TodoWriteTool 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Tibis AI 工具系统新增 `todowrite` 内置工具，让 LLM 在编码会话中创建和维护结构化任务清单，并在聊天侧边栏渲染 TodoPanel 面板。

**Architecture:** 全量替换策略（LLM 每次传入完整任务列表替换旧数据），Pinia store + localStorage 持久化按会话隔离，TodoPanel 在 floating-container 中条件渲染。

**Tech Stack:** TypeScript / Vue 3 Composition API / Pinia / UnoCSS

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| 新增 | `src/ai/tools/builtin/TodoWriteTool/index.ts` | 工具定义、输入类型、执行器工厂 |
| 新增 | `src/stores/chat/todo.ts` | Pinia store（含 localStorage 持久化） |
| 新增 | `src/components/BChatSidebar/components/TodoPanel.vue` | Todo 面板 UI 组件 |
| 新增 | `test/stores/chat/todo.test.ts` | Store 持久化与级联删除测试 |
| 修改 | `src/ai/tools/builtin/index.ts` | 注册工具、导出名称常量、扩展 Options |
| 修改 | `src/components/BChatSidebar/utils/toolLabels.ts` | 添加别名映射 |
| 修改 | `src/components/BChatSidebar/index.vue` | 引入 TodoPanel + 传入 getSessionId + watch 自动打开 |
| 修改 | `src/stores/chat/session.ts` | deleteSession 级联清理 todo 数据 |

---

### Task 1: Pinia Store — `src/stores/chat/todo.ts`

**Files:**
- Create: `src/stores/chat/todo.ts`
- Test: `test/stores/chat/todo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/stores/chat/todo.test.ts`
Expected: FAIL — module `@/stores/chat/todo` not found

- [ ] **Step 3: Write the store implementation**

```typescript
/**
 * @file todo.ts
 * @description 会话级待办任务 Store，管理全量替换式任务列表与 localStorage 持久化。
 */
import { defineStore } from 'pinia';
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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TODO_STATE };
  }

  const state = value as Partial<PersistedTodoState>;
  const normalized = { ...DEFAULT_TODO_STATE };

  if (state.sessionTodos && typeof state.sessionTodos === 'object' && !Array.isArray(state.sessionTodos)) {
    const sessions = state.sessionTodos as Record<string, unknown>;
    const validSessions: Record<string, TodoItem[]> = {};

    for (const [sessionId, todos] of Object.entries(sessions)) {
      if (Array.isArray(todos)) {
        validSessions[sessionId] = todos.filter(
          (item): item is TodoItem =>
            item &&
            typeof item === 'object' &&
            typeof item.content === 'string' &&
            typeof item.status === 'string' &&
            typeof item.priority === 'string'
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/stores/chat/todo.test.ts`
Expected: PASS — all 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/stores/chat/todo.ts test/stores/chat/todo.test.ts
git commit -m "feat: add TodoStore with localStorage persistence"
```

---

### Task 2: TodoWriteTool — `src/ai/tools/builtin/TodoWriteTool/index.ts`

**Files:**
- Create: `src/ai/tools/builtin/TodoWriteTool/index.ts`

- [ ] **Step 1: Write the tool implementation**

```typescript
/**
 * @file TodoWriteTool/index.ts
 * @description 内置待办任务写入工具，采用全量替换策略。
 */
import type { AIToolExecutor } from 'types/ai';
import { useTodoStore } from '@/stores/chat/todo';
import type { TodoItem } from '@/stores/chat/todo';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** todowrite 工具名称 */
export const TODO_WRITE_TOOL_NAME = 'todowrite';

/** 最大允许的任务数量 */
const MAX_TODO_ITEMS = 50;

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

      if (input.todos.length > MAX_TODO_ITEMS) {
        return createToolFailureResult(TODO_WRITE_TOOL_NAME, 'INVALID_INPUT', `任务数量超过上限（${MAX_TODO_ITEMS}）`);
      }

      // 逐项验证
      for (let i = 0; i < input.todos.length; i++) {
        const error = validateTodoItem(input.todos[i], i);
        if (error) {
          return createToolFailureResult(TODO_WRITE_TOOL_NAME, 'INVALID_INPUT', error);
        }
      }

      // 规范化：trim content
      const normalizedTodos: TodoItem[] = input.todos.map((item) => ({
        content: (item as Record<string, string>).content.trim(),
        status: (item as Record<string, string>).status as TodoItem['status'],
        priority: (item as Record<string, string>).priority as TodoItem['priority']
      }));

      const todoStore = useTodoStore();
      todoStore.setTodos(sessionId, normalizedTodos);

      // 计算统计
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
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm exec tsc --noEmit`
Expected: No errors related to TodoWriteTool

- [ ] **Step 3: Commit**

```bash
git add src/ai/tools/builtin/TodoWriteTool/index.ts
git commit -m "feat: add TodoWriteTool with full-replace strategy"
```

---

### Task 3: 注册工具 — `src/ai/tools/builtin/index.ts`

**Files:**
- Modify: `src/ai/tools/builtin/index.ts`

- [ ] **Step 1: Add import and export for TodoWriteTool**

在文件顶部 import 区域添加：

```typescript
import { TODO_WRITE_TOOL_NAME, createBuiltinTodoWriteTool, type CreateTodoWriteToolOptions } from './TodoWriteTool';
```

在重新导出区域添加：

```typescript
export { TODO_WRITE_TOOL_NAME } from './TodoWriteTool';
```

- [ ] **Step 2: Add to ALL_BUILTIN_TOOL_NAMES**

在 `CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES` 之后、`ALL_BUILTIN_TOOL_NAMES` 之前，添加新的条件只读工具列表：

```typescript
/**
 * 无条件注册的只读工具名称列表（类似 EnvironmentTool，不需要 confirm 适配器）。
 */
export const UNCONDITIONAL_READONLY_TOOL_NAMES = [TODO_WRITE_TOOL_NAME] as const;
```

修改 `ALL_BUILTIN_TOOL_NAMES`：

```typescript
export const ALL_BUILTIN_TOOL_NAMES = [
  ...DEFAULT_BUILTIN_READONLY_TOOL_NAMES,
  ...DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES,
  ...CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES,
  ...CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES,
  ...UNCONDITIONAL_READONLY_TOOL_NAMES
] as const;
```

- [ ] **Step 3: Extend CreateBuiltinToolsOptions**

在 `CreateBuiltinToolsOptions` 接口中添加：

```typescript
  /** 获取当前活跃会话 ID，用于 todowrite 工具 */
  getSessionId?: () => string | undefined;
```

- [ ] **Step 4: Create the tool in createBuiltinTools**

在 `createBuiltinTools` 函数中，`skillTool` 创建之后、`return` 之前，添加：

```typescript
  // todowrite 工具：无条件注册
  const todoWriteTool = createBuiltinTodoWriteTool({
    getSessionId: options.getSessionId ?? (() => undefined)
  });
```

在 `return` 数组末尾添加 `todoWriteTool`：

```typescript
  return [
    ...readonlyTools,
    ...(readDirectoryTool ? [readDirectoryTool] : []),
    ...(mcpReadTool ? [mcpReadTool] : []),
    ...writableTools,
    ...(mcpWriteTools ? [mcpWriteTools.addMcpServer, mcpWriteTools.updateMcpServer, mcpWriteTools.removeMcpServer, mcpWriteTools.refreshMcpDiscovery] : []),
    ...(skillTool ? [skillTool] : []),
    todoWriteTool
  ];
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/ai/tools/builtin/index.ts
git commit -m "feat: register TodoWriteTool in builtin tools"
```

---

### Task 4: 工具别名 — `src/components/BChatSidebar/utils/toolLabels.ts`

**Files:**
- Modify: `src/components/BChatSidebar/utils/toolLabels.ts`

- [ ] **Step 1: Add todowrite label**

在 `TOOL_ACTION_LABELS` 对象中，`question` 条目之后添加：

```typescript
  todowrite: { alias: '更新任务列表' },
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BChatSidebar/utils/toolLabels.ts
git commit -m "feat: add todowrite tool label"
```

---

### Task 5: 级联删除 — `src/stores/chat/session.ts`

**Files:**
- Modify: `src/stores/chat/session.ts`

- [ ] **Step 1: Add todo cascade cleanup in deleteSession**

在 `deleteSession` action 的 `unwrap(result)` 之后添加级联清理：

```typescript
    async deleteSession(sessionId: string): Promise<void> {
      const result = await getElectronAPI().chatSessionDelete(sessionId);
      unwrap(result);

      // 级联清理该会话的 todo 数据（在 unwrap 成功后执行，try-catch 防止中断删除流程）
      try {
        const { useTodoStore } = await import('@/stores/chat/todo');
        useTodoStore().clearTodos(sessionId);
      } catch {
        // todo 清理失败不影响会话删除结果
      }
    }
```

注意：使用动态 `import()` 避免循环依赖（`session.ts` → `todo.ts` → `pinia`），因为 `todo.ts` 可能在 `session.ts` 之前被初始化。

- [ ] **Step 2: Run store tests**

Run: `pnpm exec vitest run test/stores/chat/`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/stores/chat/session.ts
git commit -m "feat: cascade todo cleanup on session deletion"
```

---

### Task 6: TodoPanel UI — `src/components/BChatSidebar/components/TodoPanel.vue`

**Files:**
- Create: `src/components/BChatSidebar/components/TodoPanel.vue`

- [ ] **Step 1: Write the TodoPanel component**

```vue
<!--
  @file TodoPanel.vue
  @description 聊天侧边栏的待办任务面板，显示当前会话的 LLM 任务列表。
-->
<template>
  <section v-if="todos.length > 0" class="todo-panel">
    <div class="todo-panel__header">
      <span class="todo-panel__title">任务列表</span>
      <span class="todo-panel__progress">{{ completedCount }}/{{ todos.length }}</span>
      <BButton type="text" size="small" class="todo-panel__close" @click="onClose"> 关闭 </BButton>
    </div>

    <div class="todo-panel__progress-bar">
      <div class="todo-panel__progress-fill" :style="{ width: progressPercent + '%' }"></div>
    </div>

    <div class="todo-panel__body">
      <div v-for="(todo, index) in todos" :key="index" class="todo-panel__item" :class="'todo-panel__item--' + todo.status">
        <span class="todo-panel__status-icon">
          <Icon v-if="todo.status === 'completed'" icon="lucide:check-circle-2" width="14" height="14" />
          <Icon v-else-if="todo.status === 'in_progress'" icon="lucide:circle-dot" width="14" height="14" />
          <Icon v-else-if="todo.status === 'cancelled'" icon="lucide:x-circle" width="14" height="14" />
          <Icon v-else icon="lucide:circle" width="14" height="14" />
        </span>
        <span class="todo-panel__priority" :class="'todo-panel__priority--' + todo.priority"></span>
        <span class="todo-panel__content">{{ todo.content }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TodoItem } from '@/stores/chat/todo';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

/**
 * TodoPanel 属性
 */
interface TodoPanelProps {
  /** 当前会话的任务列表 */
  todos: TodoItem[];
  /** 关闭面板的回调 */
  onClose: () => void;
}

defineOptions({ name: 'TodoPanel' });

const props = defineProps<TodoPanelProps>();

/** 已完成任务数量 */
const completedCount = computed<number>(() => props.todos.filter((t) => t.status === 'completed').length);

/** 完成进度百分比 */
const progressPercent = computed<number>(() => {
  if (props.todos.length === 0) return 0;
  return (completedCount.value / props.todos.length) * 100;
});
</script>

<style scoped>
.todo-panel {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
}

.todo-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.todo-panel__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.todo-panel__progress {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}

.todo-panel__close {
  font-size: 12px;
  color: var(--text-tertiary);
}

.todo-panel__close:hover {
  color: var(--text-primary);
}

.todo-panel__progress-bar {
  height: 2px;
  background: var(--bg-disabled);
}

.todo-panel__progress-fill {
  height: 100%;
  background: var(--color-success);
  transition: width 0.3s ease;
}

.todo-panel__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  max-height: 240px;
  overflow-y: auto;
}

.todo-panel__item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 4px 12px;
  line-height: 1.5;
}

.todo-panel__item--completed {
  opacity: 0.5;
}

.todo-panel__item--cancelled {
  opacity: 0.4;
  text-decoration: line-through;
}

.todo-panel__status-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-top: 2px;
}

.todo-panel__item--pending .todo-panel__status-icon {
  color: var(--text-tertiary);
}

.todo-panel__item--in_progress .todo-panel__status-icon {
  color: var(--color-primary);
}

.todo-panel__item--completed .todo-panel__status-icon {
  color: var(--color-success);
}

.todo-panel__item--cancelled .todo-panel__status-icon {
  color: var(--text-tertiary);
}

.todo-panel__priority {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
}

.todo-panel__priority--high {
  background: var(--color-error);
}

.todo-panel__priority--medium {
  background: var(--color-warning);
}

.todo-panel__priority--low {
  background: var(--color-success);
}

.todo-panel__content {
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-word;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/BChatSidebar/components/TodoPanel.vue
git commit -m "feat: add TodoPanel component"
```

---

### Task 7: 集成到 BChatSidebar — `src/components/BChatSidebar/index.vue`

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: Add imports**

在 `<script setup>` 的 import 区域添加：

```typescript
import TodoPanel from './components/TodoPanel.vue';
import { useTodoStore } from '@/stores/chat/todo';
import { watch } from 'vue';
```

注意：`watch` 可能已经从 `vue` 导入，需检查并合并。

- [ ] **Step 2: Initialize todo store and visibility state**

在 `const toolSettingsStore = useToolSettingsStore();` 之后添加：

```typescript
/** Todo 存储 */
const todoStore = useTodoStore();
/** Todo 面板可见性 */
const todoPanelVisible = ref(true);
```

- [ ] **Step 3: Add computed for current session todos**

在 `todoPanelVisible` 之后添加：

```typescript
/** 当前会话的待办列表 */
const currentSessionTodos = computed(() => todoStore.getTodos(settingStore.chatSidebarActiveSessionId ?? ''));
```

- [ ] **Step 4: Add watch for auto-reopen**

在 `currentSessionTodos` 之后添加：

```typescript
/** LLM 调用 todowrite 时自动重新打开面板 */
watch(
  () => todoStore.getTodos(settingStore.chatSidebarActiveSessionId ?? ''),
  (newTodos) => {
    if (newTodos.length > 0 && !todoPanelVisible.value) {
      todoPanelVisible.value = true;
    }
  },
  { deep: true }
);
```

- [ ] **Step 5: Pass getSessionId to createBuiltinTools**

修改 `createBuiltinTools` 调用，在 `getPendingQuestion` 之后添加：

```typescript
  getSessionId: () => settingStore.chatSidebarActiveSessionId ?? undefined,
```

- [ ] **Step 6: Add TodoPanel to template**

在 `floating-container` 中，`UsagePanel` 之后、`InteractionContainer` 之前添加：

```html
          <TodoPanel
            v-if="todoPanelVisible"
            :todos="currentSessionTodos"
            :on-close="() => { todoPanelVisible = false }"
          />
```

- [ ] **Step 7: Verify TypeScript compilation**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/components/BChatSidebar/index.vue
git commit -m "feat: integrate TodoPanel into BChatSidebar"
```

---

### Task 8: 最终验证

- [ ] **Step 1: Run TypeScript type check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run ESLint**

Run: `pnpm lint`
Expected: No errors related to new files

- [ ] **Step 3: Run Stylelint**

Run: `pnpm lint:style`
Expected: No errors related to TodoPanel.vue

- [ ] **Step 4: Run all store tests**

Run: `pnpm exec vitest run test/stores/chat/`
Expected: All tests pass

- [ ] **Step 5: Write changelog**

在 `changelog/2026-05-28.md` 中添加（如不存在则创建）：

```markdown
# 2026-05-28

## Added
- 新增 `todowrite` 内置 AI 工具，支持 LLM 在编码会话中创建和维护结构化任务清单（全量替换策略）
- 新增 `TodoPanel` 面板组件，在聊天侧边栏 floating-container 中渲染当前会话的任务列表
- 新增 `useTodoStore` Pinia store，按会话隔离管理 todo 数据并持久化到 localStorage
- 删除会话时级联清理对应的 todo 数据
```

- [ ] **Step 6: Final commit**

```bash
git add changelog/2026-05-28.md
git commit -m "docs: add changelog for todowrite feature"
```
