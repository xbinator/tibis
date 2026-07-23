/**
 * @file 2026-07-23-header-tab-menu-design.md
 * @description HeaderTabMenu 单例右键菜单、批量关闭和复制路径/地址能力设计说明。
 */

# HeaderTabMenu 右键菜单设计

## 背景

`src/layouts/default/components/HeaderTabs.vue` 当前支持标签切换、关闭按钮、横向滚动和拖拽排序。关闭按钮只触发单个标签关闭，批量关闭能力已经由 `src/stores/workspace/tabs.ts` 的 `getClosePlan` 和 `applyClosePlan` 支撑，但顶部标签栏还没有右键入口。

本次希望在标签页上右键提供：

- 关闭
- 关闭其他
- 关闭右侧
- 关闭全部
- 文件标签复制路径
- WebView 标签复制地址

由于标签页数量可能较多，不能为每个标签都包一层 `BDropdown`。菜单应是单例浮层：标签栏只渲染一个 `HeaderTabMenu`，右键时记录命中的标签和坐标。

## 目标

- 新增 `HeaderTabMenu`，作为顶部标签页的单例右键菜单。
- 右键菜单关闭动作复用现有 `tabsStore.getClosePlan()`、`tabsStore.applyClosePlan()` 和 `useTabCloseGuard()`。
- 文件标签支持复制真实磁盘路径，路径从最近记录中的 `path` 字段读取，支持空格、中文、`?`、`#` 等复杂字符。
- WebView 标签支持复制真实页面地址，优先从 WebView 最近记录读取，找不到记录时从标签路由 query 中解析。
- 保持 `HeaderTabs.vue` 不直接持有聊天 Runtime Store，运行中聊天终止与脏标签确认继续由 `useTabCloseGuard()` 处理。

## 非目标

- 不为每个标签创建独立 `BDropdown`。
- 不调整拖拽排序、滚轮横向滚动或左键切换行为。
- 不新增关闭已保存、固定标签、标签分组或标签重命名能力。
- 不把 `router.push`、剪贴板写入或确认弹窗下沉到 tabs store。
- 不抽象或改造 `BWidget` 的右键菜单组件。

## 推荐方案

采用“HeaderTabs 维护菜单状态 + HeaderTabMenu 单例渲染 + 工具函数解析资源动作”的结构。

`HeaderTabs.vue` 负责：

- 监听 `HeaderTab` 的 `contextmenu` 事件。
- 保存菜单状态：是否打开、命中标签 ID、菜单浏览器坐标。
- 基于命中的标签生成菜单项。
- 执行关闭计划、导航和剪贴板动作。

`HeaderTabMenu.vue` 负责：

- 按坐标渲染菜单。
- 展示菜单项、禁用态、分割线和危险态。
- 使用 opacity/scale 入场动画，不对 `left` 或 `top` 坐标做 transition。
- 点击菜单项后发出 `select` 事件。
- 外部点击、Esc、窗口 resize 时关闭或重新定位。
- 限制菜单位置，避免超出视口。

资源解析工具负责：

- 根据 `tab.recentKey` 和 `recentStore.recentRecords` 找到文件或 WebView 最近记录。
- 判断当前标签是否应显示“复制路径”或“复制地址”。
- 在 WebView 最近记录缺失时，从 `/webview/...?...url=` 中解析地址。

## 组件设计

### HeaderTab.vue

`HeaderTab` 新增右键事件透传：

```ts
const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'close'): void;
  (e: 'contextmenu', event: MouseEvent): void;
}>();
```

模板在根节点上补充：

```vue
@contextmenu.prevent="emit('contextmenu', $event)"
```

这样 `HeaderTab` 仍只负责单个标签的视觉和基础事件，不生成菜单，也不读取 store。

### HeaderTabMenu.vue

新增 `src/layouts/default/components/HeaderTabMenu.vue`。

建议接口：

```ts
interface HeaderTabMenuItem {
  type?: 'item';
  key: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}

interface HeaderTabMenuDivider {
  type: 'divider';
  key: string;
}

type HeaderTabMenuEntry = HeaderTabMenuItem | HeaderTabMenuDivider;

interface HeaderTabMenuPosition {
  x: number;
  y: number;
}

interface Props {
  open: boolean;
  position: HeaderTabMenuPosition;
  items: HeaderTabMenuEntry[];
}
```

事件：

```ts
const emit = defineEmits<{
  select: [key: string];
  close: [];
}>();
```

视觉可仿照 `src/components/BWidget/components/ContextMenu.vue`，但类名前缀使用 `header-tab-menu`，避免和 Widget 组件耦合。
菜单项使用纯文字展示，不渲染图标。
菜单已打开时再次右键另一个标签，应先关闭旧菜单，下一帧再以新 key 在新坐标重新挂载菜单，避免旧实例的坐标变化产生平移动画。

## 菜单项设计

关闭菜单项始终存在，禁用态由关闭计划计算：

```text
close       -> 关闭
closeOthers -> 关闭其他
closeRight  -> 关闭右侧
closeAll    -> 关闭全部
```

资源菜单项按标签类型追加：

- 文件或 Widget 最近记录存在且 `record.path` 非空：显示 `复制路径`。
- WebView 最近记录存在，或路由中能解析出 URL：显示 `复制地址`。
- 其他标签不显示资源复制项。

菜单项顺序：

```text
关闭
关闭其他
关闭右侧
关闭全部
----
复制路径 / 复制地址
```

`关闭全部` 可使用危险态样式；禁用项不触发动作。

## 关闭执行

关闭动作统一走一个函数：

```ts
async function executeCloseAction(action: TabCloseAction, tab: Tab): Promise<void>
```

执行步骤：

1. 用当前路由找到当前激活标签 ID。
2. 调用 `tabsStore.getClosePlan(action, { anchorTabId: tab.id, activeTabId, allowCloseLastTab: true })`。
3. 调用 `canClose(plan)` 处理运行中聊天和脏标签确认。
4. 如果 `plan.requiresNavigation`，先 `router.push(plan.nextActivePath ?? '/welcome')`。
5. 导航失败或阻塞时 `cancelClose(plan.targetTabIds)` 并停止。
6. 成功后 `tabsStore.applyClosePlan(plan)`。
7. 调用 `cleanupClosedTabs(plan.targetTabIds)`。

这与现有关闭按钮逻辑保持一致，避免批量关闭和单个关闭出现不同规则。

## 资源解析

新增工具建议放在 `src/layouts/default/utils/headerTabMenu.ts`。

工具职责：

- 构建最近记录索引。
- 根据 `Tab.recentKey` 找最近记录。
- 判断 `isDocumentRecord(record)` 后读取 `record.path`。
- 判断 `record.type === 'webview'` 后读取 `record.url`。
- WebView fallback 解析 `tab.path` 的 query `url`。

解析规则：

```text
复制路径：
1. tab.recentKey 命中文件型最近记录
2. record.path 是非空字符串
3. 返回 record.path

复制地址：
1. tab.recentKey 命中 WebView 最近记录时返回 record.url
2. recentKey 未命中时，在 WebView 最近记录中按 URL 匹配 tab.path 解出的 URL
3. 最近记录仍未命中时，直接返回 tab.path query 中解出的 URL
```

不从 `/editor/:id` 或 `/widget/:id` 推导磁盘路径，因为路由参数是记录 ID，不是真实文件路径。

## 错误与降级

- 右键事件找不到标签时不打开菜单。
- 菜单打开后目标标签被移除时关闭菜单。
- 文件记录没有 `path` 时不显示“复制路径”。
- WebView 标签无法解析地址时不显示“复制地址”。
- 剪贴板写入失败由 `useClipboard()` 现有提示处理。
- 关闭计划禁用时菜单项显示禁用，点击无动作。

## 测试设计

- `headerTabMenu` 工具测试：
  - 文件记录复制真实复杂路径。
  - 未保存文件 `path: null` 不生成复制路径。
  - WebView recent 记录复制 `record.url`。
  - WebView recent 缺失时从路由 query 解码 URL。
  - 普通设置或聊天标签不生成资源复制项。
- `HeaderTab` 组件测试：
  - 根节点右键时发出 `contextmenu` 事件并传递 `MouseEvent`。
- `HeaderTabs` 组件测试：
  - 页面只渲染一个 `HeaderTabMenu`。
  - 右键命中标签后菜单打开并传入对应菜单项。
  - 关闭其他、关闭右侧、关闭全部调用现有关闭计划。
  - 文件标签选择复制路径时调用 `clipboard(path, { successMessage: '已复制路径', trim: false })`。
  - WebView 标签选择复制地址时调用 `clipboard(url, { successMessage: '已复制地址', trim: false })`。
- 静态结构测试：
  - 不在 `HeaderTabs.vue` 中出现每个标签一层 `BDropdown` 的结构。
  - `HeaderTabs.vue` 仍不导入聊天 Runtime Store。

## 验收标准

- 标签页多时，顶部标签栏只创建一个 `HeaderTabMenu` 实例。
- 右键任意标签可以看到关闭、关闭其他、关闭右侧、关闭全部。
- 禁用态与现有 `tabsStore.getClosePlan()` 一致。
- 批量关闭继续触发运行中聊天确认、脏标签确认和关闭后导航。
- 文件标签可以复制真实复杂路径。
- WebView 标签可以复制真实地址。
- 非文件、非 WebView 标签不显示复制路径或复制地址。
