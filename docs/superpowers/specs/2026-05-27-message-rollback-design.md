# 用户消息回退功能设计

## 概述

在聊天侧边栏的用户消息底部工具栏新增"回退"按钮，点击后删除该用户消息及其后所有消息，并将该消息的文本内容恢复到输入框，用户可编辑后重新发送。

## 交互设计

- **按钮位置**：用户消息底部工具栏（hover 可见区域），复制按钮左侧
- **按钮图标**：`lucide:undo-2`
- **按钮 tooltip**：回退到此
- **显示条件**：仅当该用户消息后面还有消息（非最后一条）时显示
- **禁用条件**：流式输出中（`loading` 状态）、该消息为最后一条
- **点击行为**：
  1. 弹出二次确认弹窗（`Modal.confirm`），告知将删除的消息数量
  2. 确认后：删除该 user 消息及之后所有消息 → 文本内容恢复到输入框 → 聚焦输入框

## 数据流

```
用户点击回退按钮
  → Modal.confirm 确认弹窗
  → 确认
    → MessageBubble emit('rollback', message)
    → ConversationView 透传事件
    → index.vue handleRollback(message)
      → useRollback.rollback(message)
        → 1. 检测截断区间是否包含压缩边界消息，若有则级联无效化 CompressionRecord
        → 2. fetchAllPriorHistory 获取已加载的历史消息
        → 3. 截断 messages 数组 + 拼接完整历史消息列表
        → 4. 调用 chatStore.setSessionMessages 持久化
        → 5. 调用 confirmationController.expirePendingConfirmation()
        → 6. 调用 inputEvents.restoreFromMessage(message) 恢复输入框
        → 7. 聚焦输入框
```

## useRollback Hook

文件路径：`src/components/BChatSidebar/hooks/useRollback.ts`

### 接口定义

```typescript
interface UseRollbackOptions {
  /** 响应式消息列表 */
  messages: Ref<Message[]>;
  /** 获取当前会话 ID */
  getSessionId: () => string | undefined;
  /** 获取历史消息（已加载但不在当前 messages 数组中） */
  fetchAllPriorHistory: (sessionId: string) => Promise<Message[]>;
  /** 持久化消息列表 */
  persistMessages: (sessionId: string, messages: Message[]) => Promise<void>;
  /** 无效化压缩记录 */
  invalidateCompressionRecords: (messageIds: string[]) => Promise<void>;
  /** 恢复输入框内容 */
  restoreInput: (message: Message) => void;
  /** 使确认控制器过期 */
  expireConfirmation: () => void;
  /** 聚焦输入框 */
  focusInput: () => void;
}

interface UseRollbackReturns {
  /** 回退到指定用户消息 */
  rollback: (message: Message) => Promise<void>;
  /** 判断指定消息是否可回退（后面还有消息） */
  canRollback: (message: Message) => boolean;
}
```

### 核心逻辑

```typescript
function canRollback(message: Message): boolean {
  // 防御性校验：role === 'user'
  if (message.role !== 'user') return false;

  const index = messages.value.findIndex((m) => m.id === message.id);
  if (index === -1) return false;

  // 消息后还有消息才可回退
  return index < messages.value.length - 1;
}

async function rollback(message: Message): Promise<void> {
  const index = messages.value.findIndex((m) => m.id === message.id);
  if (index === -1) return;

  // 1. 检测并清理截断区间内的压缩边界消息
  const truncatedMessages = messages.value.slice(index);
  const compressionBoundaryIds = truncatedMessages
    .filter((m) => m.role === 'compression' && m.compression?.recordId)
    .map((m) => m.compression!.recordId!);
  if (compressionBoundaryIds.length) {
    await invalidateCompressionRecords(compressionBoundaryIds);
  }

  // 2. 获取已加载的历史消息
  const sessionId = getSessionId();
  const historyMessages = sessionId ? await fetchAllPriorHistory(sessionId) : [];

  // 3. 截断 + 拼接完整历史消息列表
  const retainedMessages = messages.value.slice(0, index);
  const fullMessages = [...historyMessages, ...retainedMessages];
  messages.value.splice(0, messages.value.length, ...fullMessages);

  // 4. 持久化
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
```

## 事件链路

### MessageBubble.vue

- 新增 emit：`(e: 'rollback', message: Message): void`
- 新增 Props：`canRollback: (message: Message) => boolean`
- 新增按钮渲染：在用户消息底部工具栏，复制按钮左侧
- 按钮样式：`type="text" size="small" square icon="lucide:undo-2" title="回退到此"`
- 显示条件：`isUserMessage && message.finished && canRollback(message)`

### ConversationView.vue

- 透传 `rollback` 事件（同 `edit`/`regenerate` 模式）
- 新增 emit：`(e: 'rollback', message: Message): void`
- 新增 Props：`canRollback: (message: Message) => boolean`（透传给 MessageBubble）

### index.vue

- 新增 `useRollback` hook 调用
- 新增 `handleRollback` 处理函数（含 Modal.confirm 确认弹窗）
- 将 `rollback` 事件绑定到 ConversationView

## 二次确认弹窗

使用项目现有 `Modal.confirm` 模式：

```typescript
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

## 压缩记录清理

回退时若截断区间包含压缩边界消息（`role: 'compression'` 且 `compression.status === 'success'`），
调用 `invalidateCompressionRecords` 将对应 `CompressionRecord` 的 `status` 更新为 `invalid`。

`invalidateCompressionRecords` 通过已有的 IPC 通道 `chat:compression:updateStatus` 实现，
调用 `electronAPI.compression.updateRecordStatus(id, 'invalid', reason)` 批量标记。

## 文件引用处理策略

当前 `restoreFromMessage` 只恢复 `content` 和图片文件，不恢复非图片文件引用。
本次实现沿用此行为，作为已知限制记录。后续可按需扩展 `restoreFromMessage` 支持 `references` 字段恢复。

## 限制与说明

- **工具副作用不可逆**：被回退的消息中可能包含已执行的文件写入、Shell 命令等工具调用，回退只删除消息记录，不撤销实际文件/系统副作用。这与 regenerate 行为一致。
- **文件引用不恢复**：回退后非图片文件引用不会恢复到输入框。
- **压缩记录**：回退越过压缩边界时自动清理对应 CompressionRecord，避免悬空引用。
