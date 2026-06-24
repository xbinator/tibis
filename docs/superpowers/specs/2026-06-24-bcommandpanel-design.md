# 2026-06-24 BCommandPanel Design

## Background

`src/components/BRecent/index.vue` 和 `src/components/BModel/select.vue` 都实现了“弹窗 + 搜索输入 + 可键盘导航列表 + 选择动作”的交互壳，但它们的业务源不同：

- `BRecent` 面向最近文件、WebView、URL 候选和绝对路径候选。
- `BModel/select.vue` 面向 provider 分组下的可用模型。

这两个组件的重复点适合收敛为统一命令面板；业务差异适合拆成不同 command source，而不是合成一个巨大组件。

## Goal

新增 `src/components/BCommandPanel`，作为统一命令入口，并满足以下行为：

1. 最近入口默认只搜索最近记录，保持文件和 WebView 打开体验。
2. 最近入口输入 `>` 后显示全部跳转语法；选择或输入 `> model` 后显示模型列表。
3. 删除 `> model` 使输入回退到 `> mo` 时，面板回到跳转命令搜索；删除 `>` 后回到最近记录搜索。
4. `src/components/BChat/index.vue` 中的模型选择入口直接打开模型列表，并且只能搜索模型。
5. 弹窗、输入框、列表、空状态、键盘导航和滚动聚焦统一由 `BCommandPanel` 承担。

## Non-Goals

- 不在本次设计中把所有应用菜单命令都迁入命令面板。
- 不改变最近记录存储、模型 provider 存储或文件打开底层链路。
- 不要求替换 `src/components/BChat/components/InputToolbar/ModelSelector.vue` 的小型下拉按钮；本设计优先替换全局弹窗式模型选择入口。
- 不引入模糊搜索库；先使用现有的大小写不敏感包含匹配。

## User-Facing Behavior

### Recent Scope

从布局或欢迎页打开命令面板时，默认 scope 是 `recent`，并启用跳转语法。

输入行为：

- 空输入：展示最近记录。
- `abc`：只搜索最近记录。
- `>`：展示所有跳转命令。
- `> mo`：搜索跳转命令，展示匹配的 `> model`。
- 选择 `> model`：输入框进入 `> model` 路由，列表展示模型。
- `> model`：展示全部模型。
- `> model `：展示全部模型。
- `> model qwen`：只搜索模型。
- `> model qwen extra`：把 `qwen extra` 作为完整模型搜索词。
- `> models` / `> modelx`：继续搜索跳转命令，不进入模型列表；无匹配时展示跳转命令空状态。
- 从 `> model` 删除为 `> mo`：回到跳转命令列表。
- 删除掉 `>`：回到最近记录搜索。

### Model Scope

从 `src/components/BChat/index.vue` 打开命令面板时，scope 是 `model`，并禁用跳转语法。

输入行为：

- 空输入：展示模型列表。
- `qwen`：只搜索模型。
- `>`：仍按模型关键字处理，不显示跳转命令，不混入最近记录。

选择模型后关闭面板，并把焦点还给聊天输入框。

## Design

### Single Panel, Multiple Sources

`BCommandPanel` 是唯一的弹窗组件，负责展示和交互骨架。业务结果由 source 提供：

- `recentSource`：最近文件、WebView、URL 候选、绝对路径候选。
- `modelSource`：provider 分组模型。
- `jumpSource`：`>` 命名空间下的跳转命令，例如 `> model`。

全局 store 打开时接收配置：

```ts
type CommandPanelScope = 'recent' | 'model';

interface OpenCommandPanelOptions {
  onClose?: () => void;
}
```

最近入口使用：

```ts
commandPanelStore.openRecent();
```

聊天模型入口使用：

```ts
commandPanelStore.openModel({
  onClose: () => promptEditorRef.value?.focus()
});
```

`scope` 决定可用 source：`recent` scope 支持最近记录和 `>` 跳转语法；`model` scope 始终锁定模型 source，不提供跳转命令。

### Query Routing

面板不维护“粘住的模式”，而是每次根据当前输入解析渲染状态。

解析规则：

1. 当 `scope` 是 `model` 时，始终使用 `modelSource`。
2. 当 `scope` 是 `recent` 且输入不以 `>` 开头时，使用 `recentSource`。
3. 当 `scope` 是 `recent` 且输入以 `>` 开头但不匹配完整跳转语法时，使用 `jumpSource`。
4. 当 `scope` 是 `recent` 且输入匹配 `> model`、`> model ` 或 `> model <keyword>` 时，使用 `modelSource`。

这样删除输入时会自然回退，不需要额外维护“已进入模型模式”的状态。

`> model` 路由解析细节：

- 判断命令时允许尾部空格，`> model` 和 `> model ` 都进入模型列表。
- keyword 是 `> model ` 之后的剩余字符串整体 `trim()`，例如 `> model qwen extra` 的 keyword 是 `qwen extra`。
- `> models` / `> modelx` 不视为 `> model`，仍由 `jumpSource` 搜索跳转命令。
- jump item 的 `routeInput` 是不含尾空格的命令前缀，例如 `> model`；面板选择 jump item 后负责追加一个空格并写入输入框。

### Source Contract

每个 source 使用同一套接口，面板负责调用、丢弃过期异步结果和渲染分组。

```ts
type CommandPanelSourceId = 'recent' | 'model' | 'jump';

interface CommandPanelSource {
  id: CommandPanelSourceId;
  load: () => Promise<void> | void;
  search: (keyword: string) => Promise<CommandPanelGroup[]> | CommandPanelGroup[];
}
```

`load()` 在 source 参与渲染前调用；`search()` 每次 query routing 结果变化时调用。面板维护递增 request token，当异步搜索返回时只接受最新 token 的结果。source 不接收 request token；如果 source 内部还有额外异步流程，例如 `recentSource` 的绝对路径校验，可在 source 内部继续维护自己的 token。

`load()` 必须可安全重复调用。面板不维护 `loaded` 集合，直接在 source 参与渲染前调用 `load()`；幂等性由 `recentStore.ensureLoaded()`、`providerStore.loadProviders()` 或 source 自身处理。

### Result Item Model

`BCommandPanel` 接收统一分组和结果项，模板只关心通用展示字段、图标渲染和动作。

```ts
import type { VNodeChild } from 'vue';

type CommandPanelItemKind = 'file' | 'webview' | 'absolute-path' | 'url' | 'jump' | 'model';

interface CommandPanelIconContext {
  className: string;
  size: number;
}

interface CommandPanelGroup {
  key: string;
  title?: string;
  items: CommandPanelItem[];
}

interface CommandPanelItemBase {
  key: string;
  kind: CommandPanelItemKind;
  title: string;
  description?: string;
  descriptionClass?: string;
  meta?: string;
  active?: boolean;
  renderIcon?: (context: CommandPanelIconContext) => VNodeChild;
}

interface CommandPanelActionItem extends CommandPanelItemBase {
  kind: Exclude<CommandPanelItemKind, 'jump'>;
  removable?: boolean;
  closeOnSelect?: boolean;
  onSelect: () => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}

interface CommandPanelJumpItem extends CommandPanelItemBase {
  kind: 'jump';
  routeInput: string;
}

type CommandPanelItem = CommandPanelActionItem | CommandPanelJumpItem;
```

不同 source 可以继续持有自己的业务数据，但进入模板前必须归一化为 `CommandPanelItem`。

动作契约固定为：

- 普通 action item 默认 `closeOnSelect: true`；选择后执行 `onSelect()` 并关闭面板。
- 如果后续出现需要停留的普通 action，可以显式设置 `closeOnSelect: false`。
- jump item 不暴露 `onSelect()` 和 `closeOnSelect`；面板根据 `kind: 'jump'` 内部处理 `routeInput`，将输入框更新为 `${routeInput} ` 并保持面板打开。

### Icon Rendering

图标由 source 通过 `renderIcon()` 提供，避免 `CommandPanelItem` 为不同业务类型泄漏 `record`、`fileName`、`modelId` 等字段。

- `recentSource` 使用 `h(BRecentIcon, { record, fileName, icon, class: className, size })`。
- `modelSource` 使用 `h(BModelIcon, { model: modelId, provider: providerId, size })`。
- `jumpSource` 可以使用普通 `BIcon` 或不提供图标。

这样 `BCommandPanel` 不需要根据 `kind` 猜测业务图标，也不会破坏现有 `BRecentIcon` 和 `BModelIcon` 的不同入参。

### Grouping and Ordering

最近 scope：

1. 普通最近搜索：返回 key 为 `recent` 的无标题 group；URL 或绝对路径候选排在最近记录前，最近记录保持现有排序。
2. `>` 跳转搜索：返回 key 为 `jump`、标题为 `跳转` 的 group，只展示跳转命令。
3. `> model` 路由：复用模型分组，按 provider 分组。

模型 scope：

1. 始终只展示模型。
2. 每个 provider 是一个 group，`key` 使用 `providerId`，`title` 使用 `providerName`。
3. provider 和模型顺序沿用 `providerStore.availableModels`。
4. 当前选中模型标记为 active。

### Keyboard Behavior

统一键盘行为：

- `ArrowDown` / `ArrowUp`：循环移动高亮项。
- `Enter`：选择当前高亮项；没有高亮时选择第一项。
- `Escape`：关闭面板。
- 高亮移动后滚动到可视区域。

跳转命令行为：

- 在 `>` 或 `> mo` 列表中选择 `> model` 时，面板读取 jump item 的 `routeInput`，不调用 source action，不关闭面板；更新输入为 `> model `，并立即展示模型列表。
- 在模型列表中选择模型时，执行模型切换并关闭面板。
- 在最近记录中选择文件、WebView、URL 或绝对路径候选时，执行打开动作并关闭面板。
- 删除最近记录仅通过 item 右侧删除按钮触发，保持现有 `BRecent` 行为；本次不新增键盘删除快捷键。

### Data Loading

打开 recent scope 时：

- 调用 `recentStore.ensureLoaded()`。
- 仅在输入看起来是绝对路径时调用 `native.getPathStatus()`。
- 绝对路径校验使用 `lodash-es` 的 `debounce` 延迟约 120ms，并保留 request token，避免快速输入时频繁 IPC 或过期结果覆盖新结果。120ms 用作输入响应和 IPC 频次之间的轻量平衡值，不作为全局固定常量。

打开 model scope 或解析到 `> model` 时：

- 调用 `providerStore.loadProviders()`。
- 调用 `serviceModelStore.loadChatModel()`，并以 `serviceModelStore.chatModel` 判断 active 模型。
- 模型列表使用 `providerStore.availableModels` 作为事实源。

### Integration Points

替换现有弹窗入口：

- `src/layouts/default/index.vue`：全局挂载唯一 `BCommandPanel` 实例，并通过 `useCommandPanelStore` 打开 recent 或 model scope。
- `src/views/welcome/index.vue`：欢迎页最近入口调用 `commandPanelStore.openRecent()`，复用默认布局中的全局面板。
- `src/components/BChat/index.vue`：全局模型选择入口调用 `commandPanelStore.openModel()`，并在关闭后聚焦输入框。

保留或逐步迁移：

- `src/components/BRecent/Icon.vue` 继续作为最近记录图标组件复用。
- `src/components/BModel/Icon.vue` 继续作为模型图标组件复用。
- `src/components/BModel/select.vue` 和 `src/components/BRecent/index.vue` 在集成完成后删除，避免保留双入口。

## Error Handling

- source 加载或搜索失败时，面板清空当前结果并展示对应空状态，不向控制台输出错误。
- 绝对路径校验请求使用 token 防止过期响应覆盖新输入。
- URL 解析失败时不生成 URL 候选项。
- 当前 source 没有结果时显示与 source 对应的空状态文案。

空状态文案固定为：

| Source | 文案 |
| --- | --- |
| recent | 没有匹配的最近记录 |
| model | 未找到匹配的模型 |
| jump | 没有匹配的跳转命令 |

## Testing

新增或更新测试覆盖：

1. recent scope 空输入展示最近记录。
2. recent scope 输入普通关键词只搜索最近记录。
3. recent scope 输入 `>` 展示跳转命令。
4. recent scope 输入 `> mo` 匹配 `> model`。
5. 选择 `> model` 后展示模型列表，不关闭面板，并把输入更新为 `> model `。
6. 从 `> model` 删除到 `> mo` 后回到跳转命令列表。
7. model scope 空输入展示模型列表。
8. model scope 输入关键词只搜索模型。
9. model scope 输入 `>` 不展示跳转命令。
10. 模型选择后触发模型变更并恢复聊天输入焦点。
11. 当前选中模型在 model scope 中带 active 状态。
12. URL 输入生成 URL 候选项。
13. 绝对路径输入触发 debounced `native.getPathStatus()`，过期 request 结果被丢弃。
14. 删除最近记录调用对应 item 的 `onRemove()` 并保留面板。
15. `ArrowDown` 在末尾循环回首项，`ArrowUp` 在首项循环到末尾。

## Open Decisions

- 首次实现只内置 `> model` 跳转命令；后续可以扩展 `> recent`、`> settings` 等命令。
- `src/components/BChat/components/InputToolbar/ModelSelector.vue` 的按钮下拉暂时不强制迁移，避免把小型就地选择体验变成全局弹窗。
