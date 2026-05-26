# 中断消息设计

## 背景

用户在流式输出过程中点击"中断"按钮时，当前仅将 assistant 消息标记为 `finished=true`，视觉上没有明确的中断标记。需要新增一种消息类型，在中断时插入一条"已中断"分隔线消息，与 `BubblePartCompression` 样式一致。

## 方案

新增 `interrupt` 角色，复用 compression 消息的架构模式（独立消息 + 分隔线样式 + 不参与模型上下文）。

### 类型层

- `ChatMessageRole` 新增 `'interrupt'`
- interrupt 消息无需额外元数据，文案固定为"已中断"

### 消息创建

- `messageHelper.ts` 的 `create` 对象新增 `interruptMessage()` 工厂
- `is.persistableMessage` 条件新增 `message.role === 'interrupt'`
- `toModelMessagesForMessage` 中 interrupt 角色返回空数组

### 渲染层

- `MessageBubble.vue` 新增 `isInterruptMessage` 计算属性，复用 `BubblePartCompression` 组件
- `BubblePartCompression.vue` 新增 interrupt 分支：文案"已中断"，样式复用 `cancelled` 状态

### 中断插入流程

- `index.vue` 的 `handleAbort` 中，abort 之后向 messages 尾部追加 interrupt 消息并持久化

### 不涉及

- `ChatMessagePart` 无需新增类型
- 不影响模型上下文、上下文压缩、重新生成逻辑
