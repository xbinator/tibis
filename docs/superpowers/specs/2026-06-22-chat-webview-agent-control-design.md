# Chat 操作 WebView 设计

## 背景

Tibis 已经具备 `read_current_webpage` 工具，可以在当前激活的 `<webview>` 页面中读取标题、URL、正文、选中文本、标题结构和链接摘要。WebView 页面本身也已经具备 `executeJavaScript`、元素选择、截图和当前激活上下文注册能力。

现在希望让 Chat 不仅能读取网页，还能像页面 Agent 一样操作当前 WebView：观察页面中的可交互元素，按索引点击、输入、选择、滚动和等待。该能力只面向 Tibis 内部 ChatRuntime，不通过 MCP 暴露给外部，也不引入 page-agent 或其他第三方插件。

## 目标

- 复用现有 `read_current_webpage` 作为唯一网页观察工具，不新增 `observe_webpage`。
- 新增 `operate_webpage` 作为唯一网页操作工具，内部通过 `action` 字段区分点击、输入、选择、滚动和等待。
- WebView 工具只在存在当前激活 WebView 时暴露给模型；没有激活 WebView 时不传入工具。
- ChatRuntime 继续作为唯一模型循环，不引入第二套 ReAct 页面循环。
- 不引入 MCP，不新增设置开关，不引入第三方依赖。
- 通过 `snapshotId`、元素索引和动作白名单降低模型幻觉与误操作风险。

## 非目标

- 不开放任意 JavaScript 执行工具。
- 不允许模型直接传 CSS selector、XPath 或 DOM 引用。
- 不读取 Cookie、localStorage、sessionStorage、密码框值或隐藏表单值。
- 不绕过站点安全策略、登录墙、验证码或付费墙。
- 不覆盖 `native` WebContentsView 实现；第一版只支持 `src/views/webview/web/` 的 `<webview>` 实现。
- 不提供 MCP server 或外部 Agent 调用入口。
- 不增加独立设置开关；WebView 激活状态就是工具暴露条件。

## 总体方案

采用“ChatRuntime 主进程工具 + renderer WebView bridge + 页面控制 Lite”的方案。

```text
shared/ai/tools/toolRegistry.ts
  ├─ read_current_webpage
  └─ operate_webpage

electron/main/modules/chat/runtime/tools/WebviewTool/index.mts
  ├─ requestBridge(kind: "webview-snapshot")
  └─ requestBridge(kind: "webview-operate")

src/components/BChat/utils/runtimeBridge.ts
  ├─ webview-snapshot -> WebviewToolContext.readPageSnapshot()
  └─ webview-operate  -> WebviewToolContext.operatePage()

src/ai/tools/context/webview.ts
  └─ WebviewToolContext

src/views/webview/web/hooks/useWebView.ts
  ├─ readPageSnapshot()
  └─ operatePage()
```

`read_current_webpage` 从“网页文本快照”升级为“网页观察快照”。它继续返回原有网页内容字段，同时新增页面操作所需的 `snapshotId`、可交互元素列表、滚动信息和加载状态。

`operate_webpage` 是唯一写操作入口。模型必须先调用 `read_current_webpage`，拿到 `snapshotId` 后，才能调用 `operate_webpage`；点击、输入、选择和元素滚动还需要使用快照中的元素 `index`。运行时会校验 `snapshotId` 是否仍然有效、`index` 是否存在、动作是否被该元素允许。打开或切换当前 WebView 页面时使用 `navigate` 动作，避免模型改用 `open_resource` 创建新页面。

## 工具设计

### `read_current_webpage`

工具归属：

- `runtime`: `main`
- `group`: `webview`
- `exposure`: `conditional-readonly`
- `riskLevel`: `read`
- `permissionCategory`: `system`

输入为空对象，沿用现有调用习惯。

输出为普通 JSON 对象，包含：

- `url`：当前页面地址。
- `title`：页面标题。
- `text`：可读正文，继续沿用现有裁剪策略。
- `selectedText`：页面选中文本。
- `headings`：标题结构。
- `links`：链接摘要。
- `capturedAt`：采集时间戳。
- `truncated`：字段截断状态。
- `snapshotId`：本次页面观察快照 ID。
- `loading`：页面是否正在加载。
- `scroll`：页面滚动位置、视口尺寸、文档尺寸和是否到达顶部/底部。
- `elements`：可交互元素列表。

`elements` 中每个元素包含：

```ts
interface WebpageAgentElement {
  index: number;
  tagName: string;
  role?: string;
  text: string;
  label: string;
  placeholder?: string;
  href?: string;
  valuePreview?: string;
  disabled: boolean;
  checked?: boolean;
  selected?: boolean;
  isNew: boolean;
  actions: Array<'click' | 'input' | 'select' | 'scroll'>;
}
```

`valuePreview` 只允许用于非敏感控件，并且需要裁剪；`input[type=password]` 不返回值。

模型可见的文本摘要应明确提示：

```text
Use read_current_webpage before operate_webpage.
operate_webpage only accepts indexes from the latest snapshotId.
If an index is missing or stale, call read_current_webpage again.
```

### `operate_webpage`

工具归属：

- `runtime`: `main`
- `group`: `webview`
- `exposure`: `conditional-writable`
- `riskLevel`: `write`
- `permissionCategory`: `system`
- `safeAutoApprove`: `false`

输入使用单工具 action union，不拆成多个工具：

```ts
interface OperateWebpageInput {
  snapshotId: string;
  action:
    | { type: 'click'; index: number }
    | { type: 'input'; index: number; text: string; clear?: boolean }
    | { type: 'select'; index: number; optionText: string }
    | { type: 'scroll'; index?: number; direction: 'up' | 'down' | 'left' | 'right'; pixels?: number }
    | { type: 'navigate'; url: string }
    | { type: 'wait'; seconds?: number };
}
```

输出包含：

- `ok`：操作是否完成。
- `action`：实际执行的动作类型。
- `target`：被操作元素的摘要，滚动和等待动作可为空。
- `message`：给模型看的简短结果说明。
- `navigationStarted`：操作后是否触发导航或加载。
- `pageChanged`：操作后页面是否可能发生变化。
- `shouldReadAgain`：是否建议模型重新调用 `read_current_webpage`。

操作成功后默认返回 `shouldReadAgain: true`，除非是纯等待且页面状态未变化。这样引导模型回到“读 -> 操作 -> 再读”的稳定节奏。

## 页面控制 Lite

`useWebView.ts` 内部实现一个轻量页面控制器，不独立成第二套 agent。

职责：

- 通过 `executeJavaScript` 抓取当前页面可交互元素。
- 为元素分配本轮快照内稳定 index。
- 维护最近一次 `snapshotId` 到元素定位信息的缓存。
- 根据 index 执行点击、输入、选择、滚动和等待。
- 返回可结构化克隆的普通对象。

元素抓取策略：

- 识别 `button`、`a[href]`、`input`、`textarea`、`select`、`summary`、`[contenteditable]`、带交互 role 的元素、带 `tabindex` 的可见元素。
- 过滤 `display: none`、`visibility: hidden`、尺寸为 0、被禁用、明显不可见的元素。
- 默认不读取隐藏 input，也不读取 password 值。
- 保留少量语义属性：`role`、`aria-label`、`aria-expanded`、`aria-checked`、`placeholder`、`title`、`href`、`type`。
- 对正文、元素文本、链接和列表数量做裁剪。

点击策略：

- 滚动元素到视口。
- 使用元素中心点 hit-test，优先点击真实命中的最深元素。
- 触发 pointer/mouse/focus/click 事件序列，兼容 Vue、React 和常见事件委托。

输入策略：

- 原生 `input` / `textarea` 通过原型链 native value setter 写入，再触发 `input` 和 `change`。
- `contenteditable` 第一版支持基础 `textContent`/`innerText` 写入和事件触发；复杂编辑器如 Monaco、CodeMirror 不承诺支持。
- 默认清空后输入；`clear: false` 时追加输入。

选择策略：

- 只支持真实 `<select>`。
- 第一版按 `optionText` 精确匹配，失败后再按 trim 后文本匹配。
- 如果匹配到多个同名 option，返回 `OPTION_AMBIGUOUS`，不默认选择第一个，避免模型在歧义状态下误操作。
- 后续可扩展 option index 或 value 匹配来消除歧义。

滚动策略：

- 有 `index` 时，从元素向上寻找可滚动祖先。
- 没有 `index` 时滚动页面主文档。
- 有 `index` 但找不到可滚动祖先时返回 `SCROLL_TARGET_NOT_FOUND`，不自动回退到页面主文档，避免模型以为滚动的是某个局部容器但实际滚动了整页。
- `pixels` 为空时使用视口高度的 70% 作为默认步长。

等待策略：

- `seconds` 默认 1，最大 5。
- 如果页面正在加载，可等待加载停止或超时。
- 第一版不支持条件等待；后续可扩展 `until: 'load' | 'networkidle' | 'element'` 等条件。

## Snapshot 与幻觉控制

`read_current_webpage` 每次生成新的 `snapshotId`。`operate_webpage` 必须携带该 ID。

运行时校验：

- `snapshotId` 不存在或过期：拒绝执行，返回 `STALE_SNAPSHOT`，提示重新读取。
- `index` 不存在：拒绝执行，返回 `ELEMENT_NOT_FOUND`。
- 元素已从 DOM 消失：拒绝执行，返回 `ELEMENT_DETACHED`。
- 元素动作不匹配：拒绝执行，返回 `ACTION_NOT_SUPPORTED`。
- 页面正在导航且动作不是 `wait`：拒绝执行，返回 `PAGE_LOADING`。
- 元素 disabled 或不可见：拒绝执行，返回稳定错误。

缓存策略：

- 仅保留当前激活 WebView 最近一次 snapshot。
- 页面导航开始、WebView 失活、组件卸载时清空 snapshot。
- snapshot 设置短 TTL，例如 60 秒，避免模型隔很久后操作旧页面。
- TTL 校验放在生成和持有 snapshot 的 renderer WebView 上下文内完成，使用 renderer 本地单调时钟，例如 `performance.now()`。主进程只把 `snapshotId` 当作不透明令牌转发，不参与 TTL 判断，避免跨进程时钟不同步导致误判。

这些约束让模型不能凭空编 selector，也不能操作不存在的页面状态。

## 导航与并发

`operate_webpage` 执行前必须在 renderer 端重新读取当前 WebView 状态，而不是只信任 snapshot 创建时的缓存。

执行前检查：

- 当前 WebView 是否仍是激活上下文。
- 页面是否正在加载或导航。
- 当前 URL 是否仍与 snapshot 记录的 URL 一致；如果 URL 已变化，返回 `STALE_SNAPSHOT`。
- 目标元素是否仍存在、可见且动作可用。

如果页面正在导航，除 `wait` 外的动作返回 `PAGE_LOADING`。这用于覆盖模型刚拿到 snapshot 后页面立即跳转、但导航事件尚未完全同步到缓存的竞态。

如果操作触发导航，结果应设置 `navigationStarted: true` 和 `shouldReadAgain: true`。

## 动态暴露规则

不新增设置开关。工具暴露完全由上下文决定：

- 没有激活 WebView：不暴露 `read_current_webpage` 和 `operate_webpage`。
- 有激活 WebView：暴露 `read_current_webpage`。
- 有激活 WebView：暴露 `operate_webpage`，但执行仍受工具权限模式约束。
- 有激活 WebView：不暴露 `open_resource`，避免模型用资源打开工具创建新页面或绕过当前 WebView 操作。

在 `src/components/BChat/hooks/useRuntimeTools.ts` 中继续使用 `webviewToolContextRegistry.getCurrentContext()` 动态过滤工具。

## 权限策略

`read_current_webpage` 是只读工具，自动执行。

`operate_webpage` 是写工具：

- `ask` 模式：每次操作请求确认。
- `readonly` 模式：拒绝执行。
- `autoSafe` 模式：第一版仍不自动批准，因为网页点击和输入可能提交表单、触发支付、删除数据或导航。

确认卡片描述应包含动作摘要，例如：

- 点击网页元素：“Search” button。
- 向网页输入框输入文本：“hello”。
- 选择下拉项：“United States”。
- 滚动当前网页。

## 错误处理

主进程工具使用 `createMainToolSuccessResult`、`createMainToolFailureResult`、`createMainToolCancelledResult` 和 `createBridgeFailureResult`。

renderer bridge 不把底层 DOM 对象、Error 实例、Vue proxy 或函数返回给主进程。所有结果都归一化为普通对象。

常见错误码建议：

- `BRIDGE_TIMEOUT`
- `WEBVIEW_UNAVAILABLE`
- `PAGE_LOADING`
- `STALE_SNAPSHOT`
- `ELEMENT_NOT_FOUND`
- `ELEMENT_DETACHED`
- `ACTION_NOT_SUPPORTED`
- `OPTION_AMBIGUOUS`
- `SCROLL_TARGET_NOT_FOUND`
- `EXECUTION_FAILED`
- `SECURITY_BLOCKED`

## 超时策略

WebView 工具需要两层超时保护：

- renderer WebView 层对单次 `executeJavaScript`、等待加载和页面动作设置 10 秒超时；超时后返回稳定失败结果，不继续等待页面脚本。
- ChatRuntime 已有全局 renderer bridge 超时，当前为 30 秒。若全局 bridge 先超时或 renderer 未响应，WebviewTool 将该失败归一为 `BRIDGE_TIMEOUT`。

这样普通页面脚本卡住时通常由 WebView 层先失败；renderer 卡死或 bridge 响应丢失时由 ChatRuntime 全局超时兜底。

## 文件改动范围

- `shared/ai/tools/toolRegistry.ts`
  - 新增 `OPERATE_WEBPAGE_TOOL_NAME`。
  - 新增 `webview` 工具分组。
  - 将 `read_current_webpage` 归入 `webview` 分组和 `conditional-readonly` 暴露策略。
  - 新增 `operate_webpage` schema。

- `electron/main/modules/chat/runtime/tools/constants.mts`
  - 导出 WebView 工具名。
  - 增加 `WEBVIEW_TOOL_NAMES`。

- `electron/main/modules/chat/runtime/tools/WebviewTool/index.mts`
  - 实现 `isWebviewTool` 和 `executeWebviewTool`。
  - 通过 bridge 调用 `webview-snapshot` 和 `webview-operate`。

- `electron/main/modules/chat/runtime/tools/index.mts`
  - 接入 WebView 工具分发。

- `electron/main/modules/chat/runtime/tools/types.mts`
  - 增加 WebView snapshot 和 operation 结果类型。

- `src/ai/tools/catalog/runtimeTools.ts`
  - 由 registry 派生 `operate_webpage` schema-only 工具。

- `src/ai/tools/context/webview.ts`
  - 扩展 `WebviewToolContext`。
  - 增加页面观察元素、滚动信息、操作输入/结果类型。

- `src/components/BChat/hooks/useRuntimeTools.ts`
  - 仅在存在激活 WebView 时暴露两个工具。

- `src/components/BChat/utils/runtimeBridge.ts`
  - 新增 `webview-operate` bridge。
  - 保留并升级 `webview-snapshot`。

- `src/views/webview/web/hooks/useWebView.ts`
  - 升级 `readPageSnapshot()`。
  - 新增 `operatePage()`。
  - 实现页面控制 Lite 的脚本构造、校验和错误归一化。

## 测试范围

- `test/ai/tools/tool-registry.test.ts`
  - registry 包含 WebView 工具，分组、暴露策略、风险等级正确。

- `test/ai/tools/builtin-index.test.ts`
  - schema-only 工具由 registry 正确暴露。

- `test/electron/main/modules/chat/runtime/main-tools.test.ts`
  - `read_current_webpage` 成功和 bridge 失败。
  - `operate_webpage` 成功、非法输入、bridge 失败、权限取消。

- `test/components/BChat/runtime-bridge.test.ts`
  - `webview-snapshot` 和 `webview-operate` bridge 分发。

- `test/views/webview/web-use-webview.test.ts`
  - 页面观察元素抓取、敏感字段过滤、snapshot 过期、index 校验。
  - click/input/select/scroll/navigate/wait 的脚本构造和结果归一化。

- `test/components/BChat/use-runtime-tools.test.ts` 或现有相关测试
  - 无激活 WebView 时不暴露 WebView 工具。
  - 有激活 WebView 时暴露 `read_current_webpage` 和 `operate_webpage`。
  - 有激活 WebView 时不暴露 `open_resource`。

## 开发约束

- 遵循 `docs/ai-tools/tool-development-guide.md`：registry 是工具元数据唯一来源。
- 不把 WebView Agent 工具放到 renderer-local builtin 目录。
- bridge 只是受控 RPC，不是第二套工具运行时。
- 所有新增 TypeScript 类型、函数和复杂逻辑都需要注释。
- 不使用 `any`。
- 文档内引用项目文件使用仓库相对路径。
- 每次实现改动需要记录当天 changelog；本设计文档本身不要求单独 changelog。

## 后续演进

后续可以在不改变工具接口的前提下增强内部实现：

- 更精细的可见性和遮挡判定。
- 更好的 iframe 支持。
- 对复杂富文本编辑器的定向适配。
- 更丰富的元素语义摘要。
- WebView 操作过程中的可视化指针或高亮反馈。

这些增强都应保留 `read_current_webpage -> operate_webpage -> read_current_webpage` 的稳定节奏。
