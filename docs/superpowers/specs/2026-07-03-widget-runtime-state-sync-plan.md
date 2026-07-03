# Widget 运行态状态同步实施计划

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 确保 Widget 沙箱中的数据更新，例如 `this.message = '完成'`，在宿主消息更新后能够刷新 BChat 视图。

**架构：** 保留现有沙箱状态闭环：沙箱 Proxy 记录数据写入，`BWidgetRuntime` 立即提交本地运行态快照，宿主再把 `WidgetRuntimeChange` 持久化回消息。移除 BChat 消息列表上的 `v-memo`，避免手写 memo 依赖遗漏 `tool.widget.renderContext` 等深层运行态字段。

**技术栈：** Vue 3、TypeScript、Vitest、BChat 消息片段、BWidget 运行态沙箱。

---

## 背景

`src/components/BWidget/utils/widgetRuntime.ts` 已经在沙箱侧使用 Proxy 捕获直接数据写入，例如 `this.message = '新的消息'`。沙箱执行结束后，变更后的数据会写入 `WidgetRuntimeState.renderContext.data`。

`src/components/BWidget/Runtime.vue` 已经通过 `localRuntimeState.value ?? propsRuntimeState.value` 读取当前运行态，所以在宿主 props 回写前，运行态视图也可以先用本地快照刷新。

问题出在 `src/components/BChat/components/ConversationView.vue` 的 `v-memo`。它依赖一组手写签名来决定是否重新 patch `MessageBubble`。这类签名维护成本很高，容易遗漏 `open_widget` 工具片段中的 `part.widget.renderContext` 等深层运行态字段，导致宿主消息已经更新但视图仍被旧 memo 结果阻断。

## 结论

移除 `ConversationView.vue` 中的 `v-memo`，让 Vue 按正常响应式更新路径刷新消息气泡。这个方案优先保证正确性，避免后续每新增一种消息 part 或运行态字段都要同步维护 memo key。

不要把 Vue reactive 对象传入沙箱。沙箱应保持隔离，只返回可序列化的状态快照，未来如有需要再返回 patch。这样可以保留 Worker 兼容性、运行态持久化能力和清晰的安全边界。

## 非目标

- 不实现沙箱异步脚本执行过程中的实时 patch streaming。
- 不修改公开的 Widget 脚本 API。
- 不迁移已持久化的聊天消息。
- 不在本轮引入虚拟列表或新的渲染性能优化。

## 文件范围

- 修改 `src/components/BChat/components/ConversationView.vue`
  - 移除 `MessageBubble` 上的 `v-memo`。
  - 删除只服务于 `v-memo` 的 `MessageMemoDeps`、`getMessageMemoDeps(...)` 以及相关 memo key helper。
  - 删除不再使用的 `OPEN_WIDGET_TOOL_NAME`、`stringifyJsonValue` 等 import。
- 修改 `test/components/BChat/conversation-view.component.test.ts`
  - 扩展 `MessageBubble` 测试替身，让它展示内嵌的 `tool.widget.renderContext.data.message`。
  - 新增一个回归测试，只改变 `toolPart.widget.renderContext.data.message`。
- 修改 `changelog/2026-07-03.md`
  - 在 `Changed` 下记录移除 `v-memo` 的原因。

## 任务 1：补充失败用例覆盖

**文件：**

- 修改：`test/components/BChat/conversation-view.component.test.ts`

- [ ] **步骤 1：扩展 MessageBubble 测试替身输出**

更新 mock 的 `MessageBubble` 模板，让它展示工具片段中的内嵌 widget 运行态消息：

```typescript
template: [
  '<div data-testid="message-bubble">',
  '{{ message.parts[0]?.status ?? message.role }}:',
  '{{ message.parts[0]?.result?.status ?? "" }}:',
  '{{ disabled ? "disabled" : "enabled" }}:',
  '{{ canRollback && canRollback(message) ? "rollback" : "no-rollback" }}',
  '{{ message.parts[0]?.result?.data?.renderContext?.input?.city ?? "" }}',
  '{{ message.parts[0]?.renderContext?.data?.weather?.temperature ?? "" }}',
  '{{ message.parts[0]?.widget?.renderContext?.data?.message ?? "" }}',
  '</div>'
].join('')
```

- [ ] **步骤 2：引入内嵌 widget 运行态类型**

在现有类型 import 中加入 `ChatMessageWidgetRuntime`：

```typescript
import type { ChatMessageToolPart, ChatMessageWidgetPart, ChatMessageWidgetRuntime } from 'types/chat';
```

- [ ] **步骤 3：新增带内嵌 widget 运行态的工具片段 helper**

在 `createWidgetPart(...)` 后添加，避免触发 `no-use-before-define`：

```typescript
/**
 * 创建带内嵌运行态的小组件工具片段。
 * @param message - 运行态数据中的消息文本
 * @returns 工具片段
 */
function createOpenWidgetToolPartWithRuntimeMessage(message: string): ChatMessageToolPart {
  const part = createOpenWidgetToolPart('上海');
  const widget: ChatMessageWidgetRuntime = {
    sessionId: 'widget-weather-tool-call-widget',
    widgetId: 'weather',
    status: 'mounted',
    lifecycle: {
      mountedAt: '2026-07-03T00:00:00.000Z'
    },
    value: createWidgetPart(0).value,
    renderContext: {
      input: {
        city: '上海'
      },
      data: {
        message
      }
    }
  };

  return {
    ...part,
    widget
  };
}
```

- [ ] **步骤 4：新增回归测试**

把这个测试放在现有 open_widget 渲染更新测试附近：

```typescript
it('updates embedded open_widget runtime data when widget render context changes without tool status changes', async (): Promise<void> => {
  const wrapper = mount(ConversationViewForTest, {
    props: {
      messages: [createAssistantMessage(createOpenWidgetToolPartWithRuntimeMessage('等待用户操作'))],
      loading: true,
      disabled: false
    },
    global: {
      stubs: {
        BIcon: true
      }
    }
  });

  expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('done:success:enabled:no-rollback上海等待用户操作');

  await wrapper.setProps({
    messages: [createAssistantMessage(createOpenWidgetToolPartWithRuntimeMessage('已经完成'))],
    loading: true,
    disabled: false
  });
  await nextTick();

  expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('done:success:enabled:no-rollback上海已经完成');
});
```

- [ ] **步骤 5：运行定向测试并确认失败**

运行：

```bash
pnpm exec vitest run test/components/BChat/conversation-view.component.test.ts
```

移除 `v-memo` 前的预期结果：新增测试失败，因为 `MessageBubble` 输出仍然停留在 `等待用户操作`。

## 任务 2：移除 ConversationView 的 v-memo

**文件：**

- 修改：`src/components/BChat/components/ConversationView.vue`

- [ ] **步骤 1：删除模板上的 v-memo**

从 `MessageBubble` 上删除这一行：

```vue
v-memo="getMessageMemoDeps(item)"
```

- [ ] **步骤 2：删除 memo 专用类型与状态**

删除以下只服务于 `v-memo` 的声明：

```typescript
type MessageMemoDeps = readonly [...]
const memoObjectIds = new WeakMap<object, number>();
let memoObjectIdSeed = 0;
```

- [ ] **步骤 3：删除 memo key helper**

删除以下函数：

```typescript
function getMemoObjectId(value: object): number
function getFilesMemoKey(message: Message): string
function getToolPartsMemoKey(parts: Message['parts']): string
function getWidgetPartsMemoKey(parts: Message['parts']): string
function getMessageMemoDeps(message: Message): MessageMemoDeps
```

- [ ] **步骤 4：删除未使用 import**

删除以下 import：

```typescript
import { OPEN_WIDGET_TOOL_NAME } from '@/ai/tools/builtin';
import { stringifyJsonValue } from '@/utils/json';
```

- [ ] **步骤 5：运行定向测试并确认通过**

运行：

```bash
pnpm exec vitest run test/components/BChat/conversation-view.component.test.ts
```

预期结果：`conversation-view.component.test.ts` 中所有测试通过。

## 任务 3：更新 Changelog

**文件：**

- 修改：`changelog/2026-07-03.md`

- [ ] **步骤 1：添加 Changed 记录**

如果文件不存在，创建：

```markdown
# 2026-07-03

## Changed
- 移除聊天消息列表的 `v-memo` 渲染记忆，避免 open_widget 内嵌小组件运行态数据更新后视图被缓存依赖阻断。
```

如果文件已存在，把下面这条追加到 `## Changed` 下：

```markdown
- 移除聊天消息列表的 `v-memo` 渲染记忆，避免 open_widget 内嵌小组件运行态数据更新后视图被缓存依赖阻断。
```

## 任务 4：验证

**文件：**

- 验证：`src/components/BChat/components/ConversationView.vue`
- 验证：`test/components/BChat/conversation-view.component.test.ts`

- [ ] **步骤 1：运行定向组件测试**

运行：

```bash
pnpm exec vitest run test/components/BChat/conversation-view.component.test.ts
```

预期结果：通过。

- [ ] **步骤 2：运行 TypeScript 检查**

运行：

```bash
pnpm exec tsc --noEmit
```

预期结果：无 TypeScript 错误。

- [ ] **步骤 3：运行触达文件的 ESLint 检查**

运行：

```bash
pnpm exec eslint src/components/BChat/components/ConversationView.vue test/components/BChat/conversation-view.component.test.ts --ext .vue,.ts
```

预期结果：无 ESLint 错误。

## 回滚方案

如果移除 `v-memo` 后在长会话中出现可感知的性能退化，优先考虑引入更粗粒度且不易漏字段的方案，例如用 `getMemoObjectId(message)` 作为唯一消息级刷新签名，或后续引入虚拟列表。不要重新维护多套深层字段签名。

## 自检

- 需求覆盖：计划覆盖了当前失败模式、选择的移除 `v-memo` 方案、测试、changelog 和验证步骤。
- 占位符扫描：没有占位标记或未说明清楚的实施步骤。
- 类型一致性：计划使用了 `types/chat` 中已有的 `ChatMessageWidgetRuntime`、`ChatMessageToolPart` 和 `ChatMessageWidgetPart` 类型名。
