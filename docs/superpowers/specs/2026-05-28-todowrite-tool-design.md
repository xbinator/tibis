# TodoWriteTool 设计文档

**日期**: 2026-05-28
**状态**: 待实现

## 1. 概述

为 Tibis AI 工具系统新增 `todowrite` 内置工具，让 LLM 在编码会话中创建和维护结构化任务清单。采用全量替换策略——每次调用时 LLM 传入完整的任务列表，系统替换旧数据。任务列表在聊天侧边栏的 `floating-container` 中渲染为独立的 TodoPanel 面板。

## 2. 需求

### 2.1 功能需求

- LLM 可通过 `todowrite` 工具创建、更新、清空当前会话的任务列表
- 任务列表按会话隔离，切换会话后数据保留，删除会话时级联清理
- 任务数据持久化到 localStorage（通过 `loadPersistedState` / `persistState`），应用重启后可恢复
- 任务列表在聊天侧边栏 `floating-container` 中渲染为独立面板
- 工具调用无需用户确认（自动批准）

### 2.2 非功能需求

- 遵循现有内置工具的注册与执行模式（`AIToolExecutor` 接口）
- 遵循现有 Pinia store 持久化模式（`loadPersistedState` / `persistState`）
- 遵循现有 UI 组件模式（`floating-container` 内浮层面板）

## 3. 数据模型

### 3.1 TodoItem

```typescript
/** 单个待办任务 */
interface TodoItem {
  /** 任务内容描述 */
  content: string;
  /** 任务状态 */
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  /** 优先级 */
  priority: 'high' | 'medium' | 'low';
}
```

设计要点：
- **无 ID**：数组顺序即序号，LLM 通过索引引用任务，与 OpenCode 全量替换策略一致
- **四态 status**：`pending` → `in_progress` → `completed` / `cancelled`，覆盖 LLM 规划-执行-完成/取消的生命周期。与 OpenCode 原生四态一致，避免 LLM 传入 `cancelled` 时 enum 校验失败
- **三级 priority**：`high` / `medium` / `low`，与项目 TodoWrite 工具保持一致

### 3.2 TodoWriteResult

```typescript
/** todowrite 工具执行结果 */
interface TodoWriteResult {
  /** 更新后的任务数量 */
  count: number;
  /** 各状态计数 */
  stats: { pending: number; in_progress: number; completed: number; cancelled: number };
}
```

## 4. 工具定义

### 4.1 工具元数据

```typescript
const TODO_WRITE_TOOL_NAME = 'todowrite';

const definition: AIToolDefinition = {
  name: TODO_WRITE_TOOL_NAME,
  description: '创建或更新当前会话的任务列表。每次调用传入完整的任务列表，替换旧列表。',
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
        description: '完整的任务列表，将替换现有列表。',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '任务内容' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] }
          },
          required: ['content', 'status', 'priority'],
          additionalProperties: false
        }
      }
    },
    required: ['todos'],
    additionalProperties: false
  }
};
```

设计要点：
- **全量替换语义**：`todos` 数组是完整列表，每次调用覆盖旧数据
- **riskLevel: 'read'**：TodoWrite 不产生文件/系统副作用，只是内存状态更新
- **safeAutoApprove: true**：无需用户确认，LLM 可自由调用
- **requiresActiveDocument: false**：不依赖编辑器上下文

### 4.2 工具执行流程

```
LLM 调用 todowrite 工具
    ↓
TodoWriteTool.execute(input)
    ↓ 1. 验证输入（todos 必须为数组类型、每项有 content/status/priority）
    ↓ 2. 获取当前 sessionId（通过 getSessionId 回调）
    ↓ 3. 调用 useTodoStore().setTodos(sessionId, input.todos)
    ↓ 4. 返回 TodoWriteResult 给 LLM
```

### 4.3 工厂依赖

```typescript
interface CreateTodoWriteToolOptions {
  /** 获取当前活跃会话 ID */
  getSessionId: () => string | undefined;
}
```

通过 `getSessionId` 回调注入当前会话标识，与 `getWorkspaceRoot` 模式一致。

## 5. Pinia Store

### 5.1 Store 定义

文件路径：`src/stores/chat/todo.ts`

```typescript
const TODO_STORAGE_KEY = 'chat_session_todos';

interface PersistedTodoState {
  /** 按 sessionId 存储的待办列表 */
  sessionTodos: Record<string, TodoItem[]>;
}

const DEFAULT_STATE: PersistedTodoState = {
  sessionTodos: {}
};
```

### 5.2 核心 Actions

| Action | 说明 |
|--------|------|
| `setTodos(sessionId, todos)` | 全量替换指定会话的 todo 列表，并持久化 |
| `getTodos(sessionId)` | 读取指定会话的 todo 列表（getter） |
| `clearTodos(sessionId)` | 清空指定会话的 todo 列表，并持久化 |
| `clearAllTodos()` | 清空全部会话的 todo 数据 |

### 5.3 持久化策略

- 使用 `loadPersistedState` / `persistState` 模式（同 `toolPermission.ts`），底层为 localStorage
- 每次 `setTodos` / `clearTodos` 调用后立即 `persist()`
- store 初始化时 `loadPersistedState` 加载
- 数据量小（每会话几 KB），localStorage 完全够用

### 5.4 级联删除

在 `stores/chat/session.ts` 的 `deleteSession` action 中追加：

```typescript
async deleteSession(sessionId: string): Promise<void> {
  const result = await getElectronAPI().chatSessionDelete(sessionId);
  unwrap(result);
  // 级联清理该会话的 todo 数据（在 unwrap 成功后执行，try-catch 防止中断删除流程）
  try {
    useTodoStore().clearTodos(sessionId);
  } catch {
    // todo 清理失败不影响会话删除结果
  }
}
```

## 6. UI 渲染

### 6.1 渲染位置

在 `b-chat-sidebar__floating-container` 中渲染，与 UsagePanel 同级：

```
b-chat-sidebar__floating-container
  ├── UsagePanel        (已有)
  ├── TodoPanel         (新增) ← 仅当当前会话有 todo 时显示
  └── InteractionContainer (已有)
```

### 6.2 TodoPanel 组件

文件路径：`src/components/BChatSidebar/components/TodoPanel.vue`

```
TodoPanel
  ├── header（"任务列表" 标题 + 关闭按钮 + 进度条）
  └── body
      └── TodoItemRow × N
           ├── 状态图标（⬜ pending / 🔵 in_progress / ✅ completed / ⬛ cancelled）
           ├── 优先级标记（🔴 high / 🟡 medium / 🟢 low）
           └── 内容文本
```

设计要点：
- **条件显示**：仅当当前会话有 todo 数据时渲染，无数据时不占空间
- **紧凑布局**：每行一个任务，状态图标 + 优先级色点 + 文本
- **进度条**：header 中显示 `completed / total` 的进度
- **关闭按钮**：用户可手动关闭面板，但下次 LLM 调用 todowrite 时自动重新打开
- **自动滚动**：新增/更新任务时自动滚动到 `in_progress` 项

### 6.3 数据绑定

```typescript
// TodoPanel 内部
const todoStore = useTodoStore();
const settingStore = useSettingStore();
const currentTodos = computed(() =>
  todoStore.getTodos(settingStore.chatSidebarActiveSessionId)
);
```

### 6.4 面板可见性控制

```typescript
// BChatSidebar 中
const todoStore = useTodoStore();
const todoPanelVisible = ref(true);

// 有 todo 数据时自动显示
const shouldShowTodoPanel = computed(() =>
  todoPanelVisible.value && currentTodos.value.length > 0
);
```

**LLM 调用 todowrite 时自动重新打开面板**：

当 LLM 调用 `todowrite` 工具导致 todo 数据变更时，需自动将 `todoPanelVisible` 重置为 `true`。通过 watch todo store 的变化实现：

```typescript
// BChatSidebar 中
watch(
  () => todoStore.getTodos(settingStore.chatSidebarActiveSessionId),
  (newTodos, oldTodos) => {
    // 数据从无到有，或内容发生变化时，自动打开面板
    if (newTodos.length > 0 && !todoPanelVisible.value) {
      todoPanelVisible.value = true;
    }
  },
  { deep: true }
);
```

## 7. 工具注册

### 7.1 builtin/index.ts

- `createBuiltinTodoWriteTool` 在 `createBuiltinTools` 中无条件创建（不需要 confirm 适配器，类似 `EnvironmentTool`）
- 不加入 `DEFAULT_BUILTIN_READONLY_TOOL_NAMES`——虽然 `riskLevel: 'read'`，但 todowrite 本质是写入操作，应独立注册
- 在 `CreateBuiltinToolsOptions` 中新增 `getSessionId` 回调
- 在 `ALL_BUILTIN_TOOL_NAMES` 中添加 `TODO_WRITE_TOOL_NAME`

### 7.2 toolLabels.ts

```typescript
todowrite: { alias: '更新任务列表' }
```

### 7.3 BChatSidebar/index.vue

- 在 `createBuiltinTools` 调用中传入 `getSessionId: () => settingStore.chatSidebarActiveSessionId ?? undefined`
- 在 `floating-container` 中引入 TodoPanel 组件

## 8. 数据流

```
LLM 调用 todowrite 工具
    ↓
TodoWriteTool.execute(input)
    ↓ 验证输入
    ↓ getSessionId() → sessionId
    ↓ useTodoStore().setTodos(sessionId, input.todos)
    ↓   └─ persist() → localStorage
    ↓
TodoPanel 响应式更新（Pinia → computed → template）
    ↓
返回 TodoWriteResult 给 LLM
```

## 9. 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新增 | `src/ai/tools/builtin/TodoWriteTool/index.ts` | 工具定义与执行器 |
| 新增 | `src/stores/chat/todo.ts` | Pinia store（含持久化） |
| 新增 | `src/components/BChatSidebar/components/TodoPanel.vue` | Todo 面板 UI |
| 修改 | `src/ai/tools/builtin/index.ts` | 注册工具 + 导出名称常量 + 扩展 CreateBuiltinToolsOptions |
| 修改 | `src/components/BChatSidebar/utils/toolLabels.ts` | 添加别名映射 |
| 修改 | `src/components/BChatSidebar/index.vue` | 引入 TodoPanel + 传入 getSessionId |
| 修改 | `src/stores/chat/session.ts` | deleteSession 级联清理 |

## 10. 输入验证规则

| 规则 | 说明 |
|------|------|
| `todos` 必须为数组 | 非数组时返回 `INVALID_INPUT` |
| `todos` 允许为空数组 | 空数组表示清空任务列表 |
| 每项必须有 `content` | trim 后非空字符串（排除纯空白） |
| 每项必须有 `status` | 必须为 `pending` / `in_progress` / `completed` / `cancelled` 之一 |
| 每项必须有 `priority` | 必须为 `high` / `medium` / `low` 之一 |
| 最大 50 项 | 超过时返回 `INVALID_INPUT`，防止上下文膨胀 |
| 无活跃会话时 | `getSessionId()` 返回 `undefined` 时返回 `EXECUTION_FAILED`，提示"无活跃会话" |
