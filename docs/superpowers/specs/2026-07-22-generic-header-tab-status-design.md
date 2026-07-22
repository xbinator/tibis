# 通用 HeaderTab 状态写穿设计

## 背景

`HeaderTab` 已改为通过通用 `TabStatus` Prop 渲染状态，但 `HeaderTabs` 仍直接读取 `useChatTabRuntimeStore`，并负责聊天状态映射、完成态已读、会话标题归属和标签关闭后的 Runtime 清理。顶部标签容器仍然知道聊天运行时细节，通用化只完成了展示组件一层。

## 目标

- `Tab` 直接携带可选的通用视觉状态，`HeaderTabs` 只把 `item.status` 传给 `HeaderTab`。
- 聊天运行状态在产生或变化时同步写入对应标签，不在渲染阶段反向查询。
- `HeaderTabs` 不再导入或调用 `useChatTabRuntimeStore`。
- 通用标签状态保持瞬时，不写入本地持久化数据。
- 保留聊天 Runtime 的会话归属、终止控制、草稿晋升、后台完成未读和关闭清理行为。

## 非目标

- 不移除聊天 Runtime Store；它仍负责聊天会话归属、控制器和终止能力。
- 不新增第二个通用 Runtime Store 或事件总线。
- 不恢复重启前的运行、等待或完成未读状态。
- 不改变聊天路由、标签拖拽、关闭确认和图标视觉。
- 不暂存或提交代码。

## 通用标签模型

`TabStatus` 移到 `src/stores/workspace/tabs.ts`，与 `Tab` 模型放在同一层：

```ts
export type TabStatus = 'loading' | 'attention' | 'error' | 'completed';

export interface Tab {
  id: string;
  path: string;
  title: string;
  cacheKey?: string;
  icon?: string;
  status?: TabStatus;
}
```

Tabs Store 新增通用动作：

```ts
setTabStatus(tabId: string, status?: TabStatus): void;
```

该动作只更新内存中的标签，不触发持久化。标签状态的含义保持通用：

- `loading`：异步任务执行中。
- `attention`：等待用户操作。
- `error`：任务失败。
- `completed`：后台任务完成且尚未查看。
- `undefined`：不展示状态。

## 状态写穿

聊天 Runtime Store 保留业务状态，并在现有状态动作完成后同步通用标签状态：

```text
idle      → undefined
running   → loading
waiting   → attention
error     → error
completed → completed
```

同步发生在以下边界：

- `syncStatus`：聊天页宿主显式把已有 Runtime 记录恢复到刚创建的通用标签。
- `setStatus`：同步 BChat 的 `idle / running / waiting / error`。
- `markCompleted`：活动标签写入 `undefined`，后台标签写入 `completed`。
- `markViewed`：清除 `completed`。
- `promoteTab`：草稿标签晋升时把当前通用状态迁移到新标签 ID。
- `removeTab`：清理仍存在标签上的瞬时状态。

这样状态只在产生时转换一次，展示组件不再了解聊天业务状态。

`ensureTab` 只负责创建或补全 Runtime 记录，不修改通用标签状态。`bindSession` 和 `registerController` 通过它保证记录存在时，同样不会产生视觉状态副作用；只有上述显式状态动作允许写入 `Tab.status`。

## 持久化边界

运行状态不能跟随标签写入 `app_tabs`。Tabs Store 统一通过持久化快照函数保存状态，该函数在写入前移除每个标签的 `status` 字段。所有现有 `persistState(TABS_STORAGE_KEY, this.$state)` 调用改为使用这一入口，避免后续标题、拖拽或脏状态写入时意外携带瞬时状态。

从本地存储加载时，持久化专用归一化不接收历史 `status` 字段；运行时归一化则保留调用方显式传入的合法状态。路由重复调用 `addTab` 时，显式新状态优先，否则保留内存中的现有状态；`replaceTab` 同样优先使用目标标签的显式状态，未提供时再迁移源标签或已存在目标标签的状态，确保草稿晋升不会短暂丢失视觉状态。

Tabs Store 每次初始化都会复制标签集合、缓存 key 和状态映射，避免持久化配置中的默认引用被前一个 Store 实例修改。

## HeaderTabs 边界

模板直接下发状态：

```vue
<HeaderTab :tab="item" :dragging="dragging" :status="item.status" />
```

`HeaderTabs` 删除聊天状态映射、`resolveTabStatus` 和 Runtime Store 实例。其余 Runtime 相关职责按以下方式移出：

- 完成态已读：由聊天页现有的路由监听和 `onActivated` 处理。
- 标题更新：持久化聊天页继续通过 `session-title-persisted` 直接更新所属标签；全局标题事件只按持久化会话标签 ID 更新，不再查询 Runtime。
- 关闭清理：`useTabCloseGuard` 新增关闭后的 Runtime 清理接口，由 HeaderTabs 在应用关闭计划后调用。

`HeaderTabs` 可以继续调用通用关闭守卫，但不会直接持有聊天 Runtime Store。

## 数据流

```text
BChat / Runtime 恢复事件
          │ ChatTabRuntimeStatus
          ▼
ChatTabRuntimeStore 状态动作
          │ 映射并调用 setTabStatus
          ▼
TabsStore.Tab.status（仅内存）
          │ item.status
          ▼
HeaderTabs → HeaderTab 通用视觉
```

## 错误与降级

- 目标标签尚未创建时，`setTabStatus` 安静返回；路由建签后，后续 Runtime 状态事件会再次同步。
- `idle` 和活动标签完成均写入 `undefined`，恢复普通标签图标。
- Runtime 终止失败时维持现有行为：阻止关闭并提示错误，不清理标签或 Runtime 记录。
- TypeScript 使用完整的 `Record<ChatTabRuntimeStatus, TabStatus | undefined>`，聊天状态扩展时必须补充映射。
- 持久化快照始终剔除 `status`，避免异常退出后展示虚假的运行状态。

## 测试设计

- Tabs Store 测试验证 `setTabStatus`、新增与重复 `addTab` 的显式状态优先级、`replaceTab` 的显式状态与迁移优先级、Store 实例隔离，以及持久化内容不包含 `status`。
- Chat Runtime Store 测试验证每种业务状态写穿到 `Tab.status`、`ensureTab` 无视觉副作用、显式 `syncStatus` 恢复、完成已读和草稿晋升同步正确。
- HeaderTabs 测试改为直接准备带 `status` 的标签，验证组件不读取聊天 Runtime Store。
- 静态隔离测试确认 `HeaderTabs.vue` 不包含 `useChatTabRuntimeStore` 和聊天 Runtime 类型。
- 保留标签关闭确认、终止失败、标题更新、图标优先级及聊天页 Runtime 测试。

## 验收标准

- `HeaderTabs.vue` 不导入或调用 `useChatTabRuntimeStore`。
- `HeaderTabs` 直接使用 `item.status`，不存在聊天状态映射函数。
- 所有聊天状态在 Runtime 动作发生时同步为通用 `TabStatus`。
- 标签状态不会进入 `app_tabs` 持久化内容，重启后状态为空。
- 草稿晋升、完成未读、查看清除和关闭 Runtime 清理行为保持不变。
