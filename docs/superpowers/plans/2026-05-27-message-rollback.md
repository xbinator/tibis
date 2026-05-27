# 用户消息回退功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在用户消息底部工具栏新增"回退到此"按钮，点击后删除该消息及其后所有消息，将内容恢复到输入框。

**Architecture:** 新增 `useRollback` hook 封装回退逻辑（截断、持久化、压缩记录清理），MessageBubble 新增 emit，ConversationView 透传，index.vue 集成 Modal.confirm 确认弹窗。

**Tech Stack:** Vue 3 Composition API, TypeScript, Modal.confirm (ant-design-vue 弹窗工具)

**Spec:** `docs/superpowers/specs/2026-05-27-message-rollback-design.md`

---

### Task 1: 创建 useRollback Hook

**Files:**
- Create: `src/components/BChatSidebar/hooks/useRollback.ts`

- [ ] **Step 1: 创建 useRollback.ts**

```typescript
/**
 * @file useRollback.ts
 * @description 用户消息回退 hook，支持截断消息列表、持久化、清理压缩记录及恢复输入框。
 */
import type { Message } from '../utils/types';
import type { Ref } from 'vue';
import { getElectronAPI, unwrap } from '@/shared/platform/electron-api';

/**
 * useRollback hook 依赖项
 */
export interface UseRollbackOptions {
  /** 响应式消息列表 */
  messages: Ref<Message[]>;
  /** 获取当前会话 ID */
  getSessionId: () => string | undefined;
  /** 获取已加载的所有历史消息 */
  fetchAllPriorHistory: (sessionId: string) => Promise<Message[]>;
  /** 持久化完整消息列表 */
  persistMessages: (sessionId: string, messages: Message[]) => Promise<void>;
  /** 恢复输入框内容 */
  restoreInput: (message: Message) => void;
  /** 使确认控制器过期 */
  expireConfirmation: () => void;
  /** 聚焦输入框 */
  focusInput: () => void;
}

/**
 * useRollback hook 返回值
 */
export interface UseRollbackReturns {
  /** 回退到指定用户消息 */
  rollback: (message: Message) => Promise<void>;
  /** 判断指定消息是否可回退 */
  canRollback: (message: Message) => boolean;
}

/**
 * 无效化截断区间内的压缩记录。
 * 被回退删除的边界压缩消息对应的 CompressionRecord 会悬空引用，需要标记为 invalid。
 * @param messages - 将被删除的消息列表
 */
async function invalidateCompressionRecords(messages: Message[]): Promise<void> {
  const compressionBoundaryIds = messages
    .filter((m) => m.role === 'compression' && m.compression?.recordId)
    .map((m) => m.compression!.recordId!);

  for (const recordId of compressionBoundaryIds) {
    const result = await getElectronAPI().chatCompressionUpdateStatus(recordId, 'invalid', 'rollback_truncation');
    unwrap(result);
  }
}

/**
 * 用户消息回退 hook
 * @param options - 依赖项配置
 * @returns 回退操作和判断方法
 */
export function useRollback(options: UseRollbackOptions): UseRollbackReturns {
  const { messages, getSessionId, fetchAllPriorHistory, persistMessages, restoreInput, expireConfirmation, focusInput } = options;

  /**
   * 判断指定消息是否可回退。
   * 条件：role === 'user'，且该消息后面还有消息。
   * @param message - 待判断的消息
   * @returns 是否可回退
   */
  function canRollback(message: Message): boolean {
    if (message.role !== 'user') return false;

    const index = messages.value.findIndex((m) => m.id === message.id);
    if (index === -1) return false;

    return index < messages.value.length - 1;
  }

  /**
   * 回退到指定用户消息。
   * 删除该消息及其后所有消息，恢复输入框内容。
   * @param message - 目标用户消息
   */
  async function rollback(message: Message): Promise<void> {
    const index = messages.value.findIndex((m) => m.id === message.id);
    if (index === -1) return;

    // 1. 获取将被删除的消息区间，清理其中的压缩记录
    const truncatedMessages = messages.value.slice(index);
    await invalidateCompressionRecords(truncatedMessages);

    // 2. 获取已加载但不在当前 messages 中的历史消息
    const sessionId = getSessionId();
    const historyMessages = sessionId ? await fetchAllPriorHistory(sessionId) : [];

    // 3. 截断：保留 index 之前的消息，拼接历史消息
    const retainedMessages = messages.value.slice(0, index);
    const fullMessages = [...historyMessages, ...retainedMessages];
    messages.value.splice(0, messages.value.length, ...fullMessages);

    // 4. 持久化截断后的消息列表（DELETE+INSERT 全量替换）
    if (sessionId) {
      await persistMessages(sessionId, fullMessages);
    }

    // 5. 过期确认控制器
    expireConfirmation();

    // 6. 恢复输入框内容
    restoreInput(message);

    // 7. 聚焦输入框
    focusInput();
  }

  return { rollback, canRollback };
}
```

---

### Task 2: 修改 MessageBubble.vue — 新增回退按钮

**Files:**
- Modify: `src/components/BChatSidebar/components/MessageBubble.vue`

- [ ] **Step 1: 更新 Props 和 Emits**

在 `<script setup>` 中，修改 props 和 emits 定义：

```typescript
const props = defineProps<{
  message: Message;
  /** 会话已结束时禁用交互（如 QuestionCard） */
  disabled?: boolean;
  /** 判断消息是否可回退 */
  canRollback: (message: Message) => boolean;
}>();

defineEmits<{
  (e: 'edit', message: Message): void;
  (e: 'regenerate', message: Message): void;
  (e: 'user-choice-submit', answer: AIUserChoiceAnswerData): void;
  (e: 'rollback', message: Message): void;
}>();
```

> **变更说明**: 新增 `canRollback` prop（接收来自 useRollback 的判断函数），新增 `rollback` emit。

- [ ] **Step 2: 新增计算属性判断是否显示回退按钮**

在 `<script setup>` 中，现有 `showAssistantToolbar` 附近新增：

```typescript
/** 是否显示回退按钮 */
const showRollback = computed(() => isUserMessage.value && message.finished === true && props.canRollback(props.message));
```

- [ ] **Step 3: 在用户消息底部工具栏新增回退按钮**

修改模板中用户消息底部工具栏部分（当前第 54-57 行）：

```html
<!-- 用户消息底部：时间戳 + 回退按钮 + 复制按钮（hover 可见） -->
<div v-if="isUserMessage && message.finished" :class="bem('toolbar', { right: isUserMessage })">
  <BButton v-if="showRollback" type="text" size="small" square icon="lucide:undo-2" title="回退到此" danger @click="$emit('rollback', message)" />
  <span :class="bem('time')">{{ formatMessageTime(message.createdAt) }}</span>
  <BButton v-if="showContainer" type="text" size="small" square icon="lucide:copy" @click="handleCopy(message)" />
</div>
```

> **变更说明**: 在时间戳前新增回退按钮（带 `danger` 样式以提示破坏性操作），hover 时与工具栏一起显示。使用 `showRollback` 计算属性控制显隐。

---

### Task 3: 修改 ConversationView.vue — 透传回退事件

**Files:**
- Modify: `src/components/BChatSidebar/components/ConversationView.vue`

- [ ] **Step 1: 更新 Props 和 Emits**

```typescript
interface Props {
  messages: Message[];
  loading?: boolean;
  onLoadHistory?: () => Promise<void> | void;
  disabled?: boolean;
  /** 判断消息是否可回退 */
  canRollback: (message: Message) => boolean;
}

// ...

defineEmits<{
  (e: 'edit', message: Message): void;
  (e: 'regenerate', message: Message): void;
  (e: 'load-history'): void;
  (e: 'user-choice-submit', answer: AIUserChoiceAnswerData): void;
  (e: 'rollback', message: Message): void;
}>();
```

- [ ] **Step 2: 透传 canRollback 和 rollback 事件到 MessageBubble**

修改模板中 MessageBubble 使用处：

```html
<MessageBubble
  v-for="item in messages"
  :key="item.id"
  :message="item"
  :disabled="disabled"
  :can-rollback="canRollback"
  @edit="$emit('edit', item)"
  @regenerate="$emit('regenerate', item)"
  @user-choice-submit="$emit('user-choice-submit', $event)"
  @rollback="$emit('rollback', item)"
/>
```

> **变更说明**: 新增 `:can-rollback` prop 透传和 `@rollback` 事件透传。

---

### Task 4: 修改 index.vue — 集成 useRollback + 确认弹窗 + handleRollback

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: 新增 import 语句**

在 `<script setup>` 顶部 import 区域，新增：

```typescript
import { Modal } from '@/utils/modal';
import { useRollback } from './hooks/useRollback';
```

- [ ] **Step 2: 新增 useRollback hook 实例化**

在现有 hooks 实例化区域（`useCompactContext` 附近，约第 556 行）新增：

```typescript
/** 回退 hook */
const rollbackController = useRollback({
  messages,
  getSessionId: () => settingStore.chatSidebarActiveSessionId ?? undefined,
  fetchAllPriorHistory,
  persistMessages: (sessionId, nextMessages) => chatStore.setSessionMessages(sessionId, nextMessages),
  restoreInput: (nextMessage) => inputEvents.restoreFromMessage(nextMessage),
  expireConfirmation: () => confirmationController.expirePendingConfirmation(),
  focusInput
});
```

> **变更说明**: `fetchAllPriorHistory` 来自 `useChatHistory`（已在作用域中）；`persistMessages` 复用 `chatStore.setSessionMessages`；`restoreInput` 复用 `inputEvents.restoreFromMessage`。

- [ ] **Step 3: 新增 handleRollback 函数**

在现有 `handleChatRegenerate` 函数附近（约第 527 行）新增：

```typescript
/**
 * 处理回退请求。
 * 弹出二次确认后执行截断、恢复输入框。
 * @param message - 目标用户消息
 */
async function handleRollback(message: Message): Promise<void> {
  const index = messages.value.findIndex((m) => m.id === message.id);
  if (index === -1) return;

  const deleteCount = messages.value.length - index;
  const [cancelled] = await Modal.confirm(
    '确认回退',
    `将删除该用户消息及其后的 ${deleteCount} 条消息。此操作不可撤销，是否继续？`,
    { confirmText: '确认回退', cancelText: '取消' }
  );
  if (cancelled) return;

  await rollbackController.rollback(message);
}
```

- [ ] **Step 4: 绑定 canRollback 和 rollback 到 ConversationView**

修改模板中 ConversationView 使用处（约第 28-39 行）：

```html
<ConversationView
  ref="conversationRef"
  v-model:messages="messages"
  :loading="loading"
  :disabled="!loading"
  :on-load-history="handleLoadHistory"
  :can-rollback="rollbackController.canRollback"
  @edit="handleChatEdit"
  @regenerate="handleChatRegenerate"
  @user-choice-submit="handleChatUserChoiceSubmit"
  @rollback="handleRollback"
>
  <ConfirmationSheet :request="confirmationController.currentConfirmationRequest.value" @action="handleConfirmationSheetAction" />
</ConversationView>
```

> **变更说明**: 新增 `:can-rollback="rollbackController.canRollback"` 和 `@rollback="handleRollback"`。

---

### Task 5: 创建 useRollback 单元测试

**Files:**
- Create: `test/components/BChatSidebar/hooks/useRollback.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
/**
 * @file useRollback.test.ts
 * @description useRollback hook 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Message } from '@/components/BChatSidebar/utils/types';
import { useRollback } from '@/components/BChatSidebar/hooks/useRollback';

// Mock getElectronAPI 和 unwrap
vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({
    chatCompressionUpdateStatus: vi.fn().mockResolvedValue({ ok: true, value: undefined })
  })),
  unwrap: vi.fn((result: { ok: boolean; value?: unknown }) => result.value ?? result)
}));

/** 创建测试用的 Message 对象 */
function createMessage(overrides: Partial<Message> & { id: string; role: Message['role'] }): Message {
  return {
    id: overrides.id,
    role: overrides.role,
    content: overrides.content ?? '',
    parts: overrides.parts ?? [],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    finished: overrides.finished ?? true,
    ...overrides
  } as Message;
}

describe('useRollback', () => {
  let messages: ReturnType<typeof ref<Message[]>>;
  let options: Parameters<typeof useRollback>[0];

  beforeEach(() => {
    messages = ref<Message[]>([
      createMessage({ id: 'msg-1', role: 'user', content: '第一条消息' }),
      createMessage({ id: 'msg-2', role: 'assistant', content: '回复第一条' }),
      createMessage({ id: 'msg-3', role: 'user', content: '第二条消息' }),
      createMessage({ id: 'msg-4', role: 'assistant', content: '回复第二条' })
    ]);

    options = {
      messages,
      getSessionId: vi.fn(() => 'session-1'),
      fetchAllPriorHistory: vi.fn().mockResolvedValue([]),
      persistMessages: vi.fn().mockResolvedValue(undefined),
      restoreInput: vi.fn(),
      expireConfirmation: vi.fn(),
      focusInput: vi.fn()
    };
  });

  describe('canRollback', () => {
    it('非 user 消息不可回退', () => {
      const { canRollback } = useRollback(options);
      expect(canRollback(messages.value[1])).toBe(false);
    });

    it('最后一条消息不可回退', () => {
      const { canRollback } = useRollback(options);
      expect(canRollback(messages.value[3])).toBe(false);
    });

    it('后面还有消息的 user 消息可回退', () => {
      const { canRollback } = useRollback(options);
      expect(canRollback(messages.value[0])).toBe(true);
      expect(canRollback(messages.value[2])).toBe(true);
    });

    it('消息不在列表中时不可回退', () => {
      const { canRollback } = useRollback(options);
      const ghostMessage = createMessage({ id: 'ghost', role: 'user', content: '' });
      expect(canRollback(ghostMessage)).toBe(false);
    });
  });

  describe('rollback', () => {
    it('截断目标消息及其后所有消息', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(messages.value).toHaveLength(2);
      expect(messages.value[0].id).toBe('msg-1');
      expect(messages.value[1].id).toBe('msg-2');
    });

    it('从第一条消息回退会清空所有消息', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[0]);

      expect(messages.value).toHaveLength(0);
    });

    it('回退后调用 persistMessages 持久化', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.persistMessages).toHaveBeenCalledWith('session-1', messages.value);
    });

    it('回退后调用 restoreInput 恢复输入框', async () => {
      const { rollback } = useRollback(options);
      const target = messages.value[2];
      await rollback(target);

      expect(options.restoreInput).toHaveBeenCalledWith(target);
    });

    it('回退后调用 expireConfirmation', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.expireConfirmation).toHaveBeenCalled();
    });

    it('回退后调用 focusInput', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.focusInput).toHaveBeenCalled();
    });

    it('回退时拼接 fetchAllPriorHistory 获取的历史消息', async () => {
      const historyMessages = [
        createMessage({ id: 'old-1', role: 'user', content: '历史消息', createdAt: '2024-01-01T00:00:00.000Z' }),
        createMessage({ id: 'old-2', role: 'assistant', content: '历史回复', createdAt: '2024-01-01T00:00:01.000Z' })
      ];
      options.fetchAllPriorHistory = vi.fn().mockResolvedValue(historyMessages);

      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(messages.value).toHaveLength(4);
      expect(messages.value[0].id).toBe('old-1');
      expect(messages.value[1].id).toBe('old-2');
      expect(messages.value[2].id).toBe('msg-1');
      expect(messages.value[3].id).toBe('msg-2');
    });

    it('不在列表中的消息不执行任何操作', async () => {
      const { rollback } = useRollback(options);
      const ghostMessage = createMessage({ id: 'ghost', role: 'user', content: '' });
      await rollback(ghostMessage);

      expect(messages.value).toHaveLength(4);
      expect(options.persistMessages).not.toHaveBeenCalled();
      expect(options.restoreInput).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
pnpm vitest run test/components/BChatSidebar/hooks/useRollback.test.ts
```

预期：所有测试通过。

---

### Task 6: 类型检查与 lint

**Files:**
- (无新建/修改，仅验证)

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
pnpm exec tsc --noEmit
```

预期：无类型错误。

- [ ] **Step 2: 运行 ESLint 检查**

```bash
pnpm lint
```

预期：通过，无错误。

- [ ] **Step 3: 运行完整测试套件确保无回归**

```bash
pnpm test
```

预期：所有现有测试通过。

