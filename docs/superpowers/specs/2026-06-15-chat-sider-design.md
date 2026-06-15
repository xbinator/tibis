# ChatSider 与 BChat 职责拆分设计

## 背景

当前 `src/components/BChat/index.vue` 同时承担聊天业务和默认布局右侧栏容器两类职责：

- 聊天业务：消息加载、流式生成、输入框、模型选择、工具调用、上下文压缩、回退、用量面板、待办面板。
- 侧栏容器：`BPanelSplitter`、侧栏显示隐藏、宽度持久化、放大覆盖态、标题、新会话、历史会话入口、关闭按钮。

这会让 `BChat` 与 `src/layouts/default/index.vue` 和 `src/stores/ui/setting.ts` 的布局状态深度耦合，也让后续复用“指定会话的聊天内容区”变困难。

本次设计新增 `src/layouts/default/components/ChatSider.vue`，将侧栏会话壳抽离到默认布局组件中；`BChat` 调整为根据 `sessionId` 运行的聊天主体组件。

## 目标

- `ChatSider` 接管标题、新会话、历史、放大、关闭、拖拽宽度和显示隐藏。
- `BChat` 接收 `sessionId`，根据会话 ID 加载和持久化消息。
- 当 `sessionId` 为空时，`BChat` 在用户首次发送消息时内部创建新会话。
- 新会话创建后，`BChat` 通过事件通知 `ChatSider` 同步激活会话。
- 保持现有聊天行为不变，包括流式生成、工具调用、确认弹窗、回退、自动命名、上下文压缩、待办和用量面板。
- 降低单文件职责复杂度，为后续继续拆分聊天运行时和展示层留出边界。

## 非目标

- 不重写聊天流式生成协议。
- 不改变会话存储结构。
- 不改造 `SessionHistory` 的内部数据加载方式。
- 不实现多会话并行聊天 UI。
- 不调整侧栏视觉风格，只迁移现有结构和样式归属。

## 目标架构

### 组件边界

```text
src/layouts/default/index.vue
  └── src/layouts/default/components/ChatSider.vue
        ├── BPanelSplitter
        ├── header: title / new session / SessionHistory / expand / close
        └── src/components/BChat/index.vue
              ├── ConversationView
              ├── ConfirmationSheet
              ├── UsagePanel
              ├── InteractionContainer
              ├── TodoPanel
              ├── ImagePreview
              ├── BPromptEditor
              ├── InputToolbar
              └── BModelSelect: model modal controlled by BChat
```

`ChatSider` 是默认布局的一部分，依赖 `useSettingStore()` 管理侧栏状态。`BChat` 是聊天内容主体，依赖 `sessionId` 处理会话数据。

### ChatSider 职责

`src/layouts/default/components/ChatSider.vue` 负责：

- 使用 `BPanelSplitter` 包裹右侧栏。
- 通过 `settingStore.sidebarVisible` 控制显示隐藏。
- 通过 `settingStore.sidebarWidth` 持久化宽度。
- 通过 `settingStore.chatSidebarExpanded` 控制放大覆盖态。
- 通过 `useChatSiderSession()` 获取当前会话对象并展示标题，空会话显示 `新会话`。
- 点击新会话按钮时清空当前激活会话 ID，并让内部 `BChat` 进入新会话草稿态。
- 渲染 `SessionHistory`，处理会话切换和删除。
- 关闭侧栏时同步隐藏状态。
- 通过 `watch(settingStore.sidebarVisible)` 在侧栏隐藏时退出放大态。
- 通过 `onUnmounted()` 在组件销毁时退出放大态。
- 在 `onMounted()` 中初始化上次激活会话，`BChat` 只消费 `sessionId` prop。

### BChat 职责

`src/components/BChat/index.vue` 负责：

- 接收 `sessionId`，加载对应会话消息。
- `sessionId` 为空时展示空会话输入态。
- 首次发送消息时，如果没有有效会话 ID，创建新会话并继续发送流程。
- 通过 `session-created` 事件通知外层同步新会话 ID。
- 所有聊天运行时逻辑继续留在内部，包括工具、输入、流式、确认、压缩、回退、自动命名和用量刷新。
- 不再直接渲染 `BPanelSplitter`。
- 不再直接处理侧栏显示隐藏、宽度、放大和关闭。

## 组件接口

### BChat Props

```ts
/**
 * BChat 组件属性。
 */
interface BChatProps {
  /** 当前聊天会话 ID，空值表示新会话草稿态。 */
  sessionId: string | null;
}
```

### BChat Emits

```ts
/**
 * BChat 组件事件。
 */
interface BChatEmits {
  /**
   * 内部创建新会话后触发。
   * @param session - 新创建的会话对象
   */
  (event: 'session-created', session: ChatSession): void;

  /**
   * 聊天运行状态变化时触发，供 ChatSider 禁用会话切换、新会话和删除操作。
   * `loading = taskRuntime.loading || streamLoading`，覆盖 chat、compact 和底层 stream 三类运行状态。
   * @param loading - 是否存在正在运行的聊天、压缩或流式任务
   */
  (event: 'loading-change', loading: boolean): void;
}
```

### ChatSider 使用方式

```vue
<BChat
  :session-id="settingStore.chatSidebarActiveSessionId"
  @session-created="handleSessionCreated"
  @loading-change="handleChatLoadingChange"
/>
```

`handleSessionCreated` 只做外层状态同步：

```ts
/**
 * 同步 BChat 内部创建的新会话。
 * @param session - 新创建的会话对象
 */
function handleSessionCreated(session: ChatSession): void {
  settingStore.setChatSidebarActiveSessionId(session.id);
  setCurrentSession(session);
  sessionHistoryRef.value?.refreshSessions();
}

/**
 * 同步 BChat 运行状态，用于禁用侧栏会话操作。
 * @param loading - 是否存在正在运行的聊天或压缩任务
 */
function handleChatLoadingChange(loading: boolean): void {
  chatLoading.value = loading;
}
```

## 会话 ID 管理

`BChat` 内部需要区分外部传入会话和内部刚创建的会话。推荐使用本地 ref 保存内部创建结果：

```ts
/** BChat 内部为新会话草稿创建出的会话 ID。 */
const createdSessionId = ref<string | null>(null);

/** 当前聊天运行时使用的有效会话 ID。 */
const activeSessionId = computed<string | null>(() => props.sessionId ?? createdSessionId.value);
```

监听外部 `sessionId` 时需要遵循以下规则：

- 外部 `sessionId` 与 `createdSessionId` 相同：说明这是内部创建会话后的外层状态回写，不重新加载历史消息，只清空 `createdSessionId`。
- 外部 `sessionId` 变为非空：清空 `createdSessionId`，加载外部会话消息。
- 外部 `sessionId` 变为空：清空 `createdSessionId` 并重置聊天内部状态，进入新会话草稿态。
- 内部创建新会话成功后：写入 `createdSessionId`，触发 `session-created`，后续由外层更新 `settingStore.chatSidebarActiveSessionId`。

这样可以避免两个问题：

- “新会话刚创建但外层状态尚未同步”的短暂窗口影响持久化。
- 外层收到 `session-created` 后把同一个 ID 回写到 prop，触发 `BChat` 重新加载历史并覆盖正在流式更新的 `messages`。

推荐 watch 结构如下：

```ts
watch(
  () => props.sessionId,
  async (nextSessionId) => {
    if (nextSessionId && nextSessionId === createdSessionId.value) {
      createdSessionId.value = null;
      return;
    }

    if (!nextSessionId) {
      createdSessionId.value = null;
      resetDraftSessionState();
      return;
    }

    createdSessionId.value = null;
    await loadSessionMessages(nextSessionId);
  }
);
```

`createdSessionId` 只能在 `chatStore.createSession()` 成功返回后写入。创建失败时保持 `createdSessionId = null`，不触发 `session-created`，不清空输入框，不启动 stream。

```ts
/**
 * 确保当前发送动作有可持久化的会话。
 * @param title - 新会话标题
 * @returns 有效会话 ID，创建失败时向上抛错
 */
async function ensureActiveSession(title: string): Promise<string> {
  if (activeSessionId.value) {
    return activeSessionId.value;
  }

  const session = await chatStore.createSession('assistant', { title });
  createdSessionId.value = session.id;
  emit('session-created', session);
  return session.id;
}
```

等值跳过重载依赖一个明确前提：`createdSessionId` 只表示当前 `BChat` 实例刚创建、尚待外层回写的会话 ID；外层只有 `handleSessionCreated(session)` 会把同一个 ID 写回 `settingStore.chatSidebarActiveSessionId`。如果后续出现其他外部路径写入同一 ID，需要改为显式来源标记。

### BChat 新会话重置清单

当 `sessionId` 变为 `null` 时，`BChat` 必须在内部完成以下清理，`ChatSider` 不参与聊天运行时细节：

| 状态 | 重置行为 |
|------|----------|
| `messages` | 清空已加载消息 |
| UsagePanel | 调用 `usagePanel.reset()` |
| ConfirmationSheet / controller | 过期或销毁待确认请求 |
| 历史分页状态 | 将 `hasMoreHistory` 重置为 `false` |
| `createdSessionId` | 清空内部新会话 ID |
| 输入框焦点 | `nextTick` 后聚焦输入框 |
| Context compact 运行态 | 保持当前 hook 的空消息状态，不携带旧会话压缩结果 |

`currentSession` 不属于迁移后的 `BChat` 状态；它由 `ChatSider` 的 `useChatSiderSession()` 管理。删除当前会话或进入新会话草稿态时，`useChatSiderSession()` 负责将 `currentSession` 清空。

### 初始化时序

`ChatSider` 负责恢复上次激活会话，`BChat` 只消费已确定的 `sessionId`。为避免挂载时 `BChat` 先收到临时 `null` 并清空状态，`useChatSiderSession()` 需要暴露 `initialized`：

```ts
/**
 * ChatSider 等会话初始化完成后再渲染 BChat。
 */
<BChat
  v-if="sessionInitialized"
  :session-id="settingStore.chatSidebarActiveSessionId"
  @session-created="handleSessionCreated"
  @loading-change="handleChatLoadingChange"
/>
```

如果没有可恢复会话，初始化完成后 `settingStore.chatSidebarActiveSessionId` 保持 `null`，此时才渲染 `BChat` 的新会话草稿态。

## 数据流

### 打开侧栏

```text
Header toggle button
  -> settingStore.toggleSidebar()
  -> ChatSider v-show 生效
  -> BChat 接收当前 active sessionId
```

如果侧栏宽度被拖拽关闭为 `0`，`src/layouts/default/index.vue` 继续负责在重新打开时恢复默认宽度。

### 切换历史会话

```text
SessionHistory emit switch-session(sessionId)
  -> ChatSider.handleSwitchSession(sessionId)
  -> settingStore.setChatSidebarActiveSessionId(sessionId)
  -> BChat watch sessionId
  -> loadHistory(sessionId)
```

切换时如果当前会话正在生成，`ChatSider` 根据 `BChat` 的 `loading-change` 状态禁用 `SessionHistory`，`useChatSiderSession` 也要在 `chatLoading` 为 `true` 时拒绝切换，避免生成中切换造成状态错乱。

### 新会话

```text
ChatSider new session button
  -> settingStore.setChatSidebarActiveSessionId(null)
  -> BChat watch sessionId = null
  -> BChat 执行新会话重置清单
  -> 用户输入第一条消息
  -> BChat 内部 createSession()
  -> emit session-created(session)
  -> ChatSider 同步 active sessionId、currentSession 并刷新历史
  -> BChat 按新 sessionId 持久化消息并开始 stream
```

新会话按钮不提前创建空会话，避免历史列表出现没有消息的会话。

### 删除当前会话

```text
SessionHistory emit delete-session(sessionId)
  -> ChatSider 判断是否删除当前 active session
  -> 如果是当前会话，settingStore.setChatSidebarActiveSessionId(null)
  -> BChat 执行新会话重置清单
```

`SessionHistory` 已负责删除存储中的会话记录和从已加载列表中移除会话，但不会清理 `settingStore.chatSidebarActiveSessionId`。因此 `ChatSider` 必须在收到 `delete-session` 后判断删除的是否为当前激活会话；如果是，则将 active session 清空。

### 放大态与 HeaderTabs

`HeaderTabs` 继续通过 `settingStore.chatSidebarExpanded` 控制标签区空白显示，不迁移到 `ChatSider` 内部。`ChatSider` 只负责写入 expanded 状态，布局层其他组件继续消费同一个 store 字段。

## 关键迁移点

### 从 BChat 移到 ChatSider

- `BPanelSplitter` 结构。
- `.b-chat--expanded` 相关样式，可重命名为 `.chat-sider--expanded`。
- 侧栏内容外壳 `.b-chat__content`、header、title、divider 样式。
- `isSidebarExpanded`、`toggleSidebarExpanded`。
- 监听 `settingStore.sidebarVisible`，隐藏时退出放大态。
- `currentSession`、`createNewSession`、`switchSession`、`initializeActiveSession` 的外层会话选择部分。
- `SessionHistory` ref 与刷新逻辑。
- 删除当前会话后的 active session 清理逻辑。

### 留在 BChat

- `ConversationView` 及消息事件。
- `ConfirmationSheet`。
- `UsagePanel` 和 `InteractionContainer`。
- `TodoPanel`。
- `ImagePreview`、`BPromptEditor`、`InputToolbar`、`BModelSelect`。
- `useChatHistory`、`useChatInput`、`useChatStream`、`useChatTaskRuntime`、`useCompactContext`、`useContextUsage`、`useFileReference`、`useImageUpload`、`useInteractionState`、`useModelSelection`、`useRollback`、`useSkillInit`、`useSlashCommands`、`useUsagePanel`。
- 发送、完成、中止、回退、压缩、工具上下文构建。

### 样式迁移清单

迁移时按职责拆分现有 `.b-chat*` 选择器：

| 选择器 | 归属 | 说明 |
|--------|------|------|
| `.b-chat--expanded` | `ChatSider` | 重命名为 `.chat-sider--expanded`，控制覆盖主内容 |
| `.b-chat__content` | `ChatSider` | 侧栏内容壳，包含 header 和 BChat 主体 |
| `.b-chat__header` | `ChatSider` | 侧栏标题栏 |
| `.b-chat__title` | `ChatSider` | 当前会话标题 |
| `.divider` | `ChatSider` | 改为 `.chat-sider__divider`，避免通用类名污染 |
| `.b-chat__container` | `BChat` | 聊天主体布局 |
| `.b-chat__conversation-container` | `BChat` | 消息区域 |
| `.b-chat__floating-container` | `BChat` | 用量面板和 toast 浮层 |
| `.b-chat__toolbar` | `BChat` | Todo 面板容器 |
| `.b-chat__input` | `BChat` | 输入区外层 |
| `.b-chat__input-container` | `BChat` | 输入框卡片 |
| `.b-chat__input-container .b-prompt-editor` | `BChat` | 输入编辑器局部覆盖 |

Less 中继续写完整类名，避免使用 `&__xxx` 省略 BEM 子类名。

### 需要调整的 Hook

`useSession` 目前同时承担当前会话对象、创建、切换和初始化。第一版明确采用轻量拆分：新增 `src/layouts/default/hooks/useChatSiderSession.ts`，不要让 `ChatSider` 复用当前 `useSession`。

原因是 `src/components/BChat/hooks/useSession.ts` 的 `SessionOptions` 依赖 `resetUsagePanel`、`setLoadedMessages`、`focusInput`、`isStreamLoading`、`disposeConfirmationController` 和 `resetHistoryState`，这些都是 `BChat` 内部运行时能力。`ChatSider` 如果复用它，需要传入大量空函数或跨层回调，会让职责重新耦合。

`useChatSiderSession` 只负责侧栏会话选择和标题：

```ts
/**
 * ChatSider 会话选择状态。
 */
interface ChatSiderSessionApi {
  /** 是否已完成初始 active session 恢复。 */
  initialized: Ref<boolean>;
  /** 当前激活会话对象，用于标题展示。 */
  currentSession: Ref<ChatSession | undefined>;
  /** 会话选择加载状态。 */
  loading: Ref<boolean>;
  /** 初始化上次激活会话，没有 active ID 时恢复最近会话。 */
  initializeActiveSession: () => Promise<void>;
  /** 切换当前激活会话。 */
  switchSession: (sessionId: string) => Promise<void>;
  /** 进入新会话草稿态。 */
  createDraftSession: () => Promise<void>;
  /** 当前会话被删除后的外层状态同步。 */
  handleDeletedSession: (sessionId: string) => void;
  /** 同步由 BChat 内部创建出的会话对象。 */
  setCurrentSession: (session: ChatSession | undefined) => void;
}
```

`useChatSiderSession` 接收 `isChatLoading: () => boolean` 作为选项。`createDraftSession()`、`switchSession()` 和当前会话删除处理都必须在聊天运行中拒绝执行，行为与现有侧栏 header 的禁用逻辑保持一致。

`currentSession` 更新规则：

- `initializeActiveSession()`：如果 store 中已有 active ID，优先等待 `SessionHistory` 的 `update:currentSession` 回填；如果没有 active ID，则查询最近一条 assistant 会话，写入 active ID 和 `currentSession`。无历史会话时保持 `currentSession = undefined`。
- `switchSession(sessionId)`：写入 `settingStore.chatSidebarActiveSessionId`，标题对象由 `SessionHistory` 的 `v-model:current-session` / `update:currentSession` 回填；回填前可短暂保持旧标题，不能伪造标题。
- `createDraftSession()`：写入 `settingStore.chatSidebarActiveSessionId(null)`，并清空 `currentSession`。
- `handleDeletedSession(sessionId)`：如果删除的是当前 active session，写入 `null` 并清空 `currentSession`；如果不是当前 active session，只保持当前会话不变。
- `setCurrentSession(session)`：由 `BChat` 的 `session-created` 和 `SessionHistory` 的 `update:currentSession` 调用，确保标题能在新会话创建后立即更新。

`BChat` 不再使用 `useSession` 做会话选择。它通过 `props.sessionId` watch 加载消息，通过首次发送时的 `chatStore.createSession()` 创建真实会话，并通过 `session-created` 通知外层。

## 错误处理

- 首次发送创建会话失败时，不写入 `createdSessionId`，不触发 `session-created`，不清空输入框，不启动 stream，并通过现有 toast 显示错误。
- 外部 `sessionId` 对应会话加载失败时，清空消息并保留侧栏可用，避免旧消息误显示到错误会话。
- 删除当前会话时，如果正处于生成中，应复用现有忙碌保护，先拒绝删除或先中止再删除；第一版保持现有 `SessionHistory` 禁用逻辑。
- 侧栏隐藏时退出 expanded，防止再次打开直接覆盖主视图。

## 测试计划

- 移除 `test/components/BChat/sidebar-expand.test.ts`：放大按钮行为迁移到 `ChatSider` 测试。
- 新增或更新 `ChatSider` 测试，覆盖：
  - 放大按钮切换 `settingStore.chatSidebarExpanded`。
  - 关闭按钮调用 `settingStore.setSidebarVisible(false)`。
  - 新会话按钮将 `chatSidebarActiveSessionId` 置空。
  - `session-created` 事件同步 active session、currentSession 并刷新历史。
  - `loading-change` 为 `true` 时禁用新会话和历史切换。
  - `initialized` 完成前不渲染 `BChat`，完成后再传入最终 `sessionId`。
- 更新 `BChat` 测试，覆盖：
  - `sessionId` 变化时加载对应历史。
  - `sessionId` 为空时首次发送会创建会话。
  - 内部创建会话后使用新会话 ID 持久化用户消息和 assistant 消息。
  - `chatStore.createSession()` 失败时不写入 `createdSessionId`，不触发 `session-created`。
  - `loading-change` 同时覆盖 `chat`、`compact` 和底层 stream loading。
- 保留 `test/layouts/default/header-tabs-structure.test.ts` 对 expanded 状态隐藏标签区的断言。
- 增加一条完整路径验证：新会话草稿态发送第一条消息后，覆盖 `createSession -> session-created -> activeSessionId 回写 -> stream -> persist`，确保不会因为 prop 回写重新加载历史而丢失流式消息。
- 运行 `pnpm lint`、`pnpm lint:style`、`pnpm exec tsc --noEmit`，并按影响范围运行相关 Vitest。

## 风险与缓解

- 风险：`BChat` 首次创建 session 与外层同步 active session 存在短暂时序差。
  缓解：使用 `createdSessionId` 和 `activeSessionId`，在外层同步完成前仍使用内部有效 ID。

- 风险：`useSession` 当前与消息状态、usage、确认控制器存在耦合，直接迁移到 `ChatSider` 会重新引入跨层依赖。
  缓解：第一版新增轻量 `useChatSiderSession`，`BChat` 通过 `sessionId` prop 自行加载和创建会话。

- 风险：样式类名迁移后测试或局部选择器失效。
  缓解：迁移时保持 BEM 类名可搜索，避免 Less 中使用 `&__xxx` 省略完整类名。实施前搜索裸 `.divider` 使用范围；迁移前裸 `.divider` 仅在 `src/components/BChat/index.vue` 中定义和使用，可安全迁移为 `.chat-sider__divider`。

- 风险：删除或切换会话时仍有流式任务。
  缓解：延续现有 loading 禁用和任务运行时保护，不在本次改变并发策略。

## 实施顺序建议

1. 新增 `src/layouts/default/hooks/useChatSiderSession.ts`，承接标题、初始化、切换、新会话草稿和删除同步。
2. 新增 `ChatSider.vue`，先搬迁侧栏外壳、header 和控制按钮。
3. 修改 `src/layouts/default/index.vue`，用 `ChatSider` 替换直接使用 `BChat`。
4. 为 `BChat` 增加 `sessionId` prop、`session-created` emit 和 `loading-change` emit。
5. 将 `BChat` 内部所有 session 读写统一改为 `activeSessionId`，并实现 prop 回写等值跳过重载。
6. 将 `SessionHistory`、标题、新会话、放大、关闭从 `BChat` 移除。
7. 迁移样式到 `ChatSider`，保留聊天内容区样式在 `BChat`。
8. 更新测试和 changelog。
