# WebView 双实现并行设计

## 背景

当前 WebView 页面仅支持基于 `WebContentsView` 的 `native` 实现，渲染层通过占位容器 + IPC 驱动主进程视图。现在需要在不替换现有方案的前提下，新增一套基于 Electron `<webview>` 标签的 `web` 实现，用于并行验证能力、体验与宿主边界差异。

本次设计目标是让两套实现共享尽可能多的页面外壳和状态逻辑，同时把各自宿主差异隔离在独立目录下，避免后续演进时交叉污染。

## 目标

- 保留现有 `native` WebView 方案，行为不倒退。
- 新增 `<webview>` 标签版 `web` WebView 方案，作为显式路由入口。
- 统一地址栏、加载态、标题同步和标签页标题更新逻辑。
- 为 `<webview>` 方案补齐宿主级安全控制，避免直接放开 `webviewTag` 带来的风险。
- 为后续实现默认入口切换或灰度策略预留清晰边界。

## 非目标

- 本次不移除现有 `WebContentsView` 实现。
- 本次不打通 `native` 与 `web` 两套实现的登录态、Cookie 与缓存。
- 本次不引入页面下载管理、复杂 preload 注入或页面内权限放开。
- 本次不改变现有标签页系统的基础行为，只做 WebView 页面内部重组。

## 总体方案

采用“共享 shell，分别挂 `native` 和 `web`”的结构。

- `shared` 负责公共视图层和通用状态模型。
- `native` 负责当前 `WebContentsView + IPC` 的宿主控制。
- `web` 负责 `<webview>` 标签的页面内实例控制。
- 路由显式区分两个入口，不设置默认实现。

这样可以让 UI 和业务入口保持统一，同时允许两套实现各自遵循适合自己的生命周期模型。

## 目录结构

目标目录结构如下：

```text
src/views/webview/
├── shared/
│   ├── components/
│   │   └── AddressBar.vue
│   ├── hooks/
│   │   └── useTabTitle.ts
│   ├── types.ts
│   └── utils/
│       └── url.ts
├── native/
│   ├── hooks/
│   │   └── useNativeWebView.ts
│   └── index.vue
└── web/
    ├── hooks/
    │   └── useTagWebView.ts
    └── index.vue
```

相关 Electron 侧改动：

```text
electron/
├── main/
│   ├── modules/
│   │   └── webview/
│   │       └── ipc.mts
│   └── window.mts
└── preload/
    ├── index.mts
    └── webview.mts
```

## 路由设计

提供两个显式入口：

- `/webview/native?url=...`
- `/webview/web?url=...`

路由层不提供默认实现映射，避免调试与问题定位时混淆当前使用的宿主实现。两条路由都沿用现有标签页系统，`tabId` 继续基于 `route.fullPath` 生成，从而保证相同 URL 在不同实现下得到不同实例标识。

需要明确的是：当前标签页系统本身就是以 `route.fullPath` 作为 tab 主键，因此同一实现下再次打开相同 URL 时，会复用现有 tab，而不是创建第二个完全相同的实例。这是现有标签系统的既有约束，本次设计沿用该行为，不把“同 URL 多实例标签页”纳入本次范围。

## 共享状态模型

`shared/types.ts` 维护统一的状态视图模型：

```ts
interface WebviewPageState {
  url: string
  title: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  loadProgress: number
}
```

两套实现都必须把内部事件收敛成这份状态：

- `native` 通过主进程 IPC 推送更新。
- `web` 通过 `<webview>` DOM 事件本地更新。

共享层只消费这份状态，不感知底层宿主差异。

## 共享 Shell 设计

共享 shell 不再直接承载具体实现，而是承载通用交互约定：

- 地址栏按钮：后退、前进、刷新、停止、在系统浏览器打开。
- URL 标准化：统一处理缺少协议时的补全策略。
- 标签页标题同步：监听状态中的 `title`，统一更新 `tabsStore`。
- 加载条展示：只依赖 `isLoading` 和 `loadProgress`。

`useTabTitle.ts` 的职责也需要明确：

- 当页面状态中的 `title` 变更时，更新当前 tab 标题。
- keep-alive 的 `onDeactivated` 不清理标题，当前标题应保留给已缓存页面。
- 关闭 tab 时由现有 tabs store 的删除流程统一清理条目，不由该 hook 主动回滚或重置标题。

这样可以避免共享 hook 越权处理 tab 生命周期。

共享 shell 与具体实现之间通过统一动作接口协作：

```ts
interface WebviewController {
  state: Ref<WebviewPageState>
  create(initialUrl: string): Promise<void> | void
  navigate(url: string): Promise<void> | void
  goBack(): Promise<void> | void
  goForward(): Promise<void> | void
  reload(): Promise<void> | void
  stop(): Promise<void> | void
}
```

`native` 可以额外实现 `show`、`hide`、`setBounds`、`destroy` 等宿主相关能力，但这些仅在内部页面组件使用，不进入共享地址栏接口。

边界约定需要明确：

- 共享 shell 只消费 `WebviewController` 这类跨实现都成立的最小能力。
- `native/index.vue` 自己负责在 `onMounted`、`onActivated`、`onDeactivated`、`onBeforeUnmount` 中调用 `show`、`hide`、`setBounds`、`destroy`。
- `web/index.vue` 不暴露这些宿主方法，因为 `<webview>` 标签不需要对应的主进程显隐控制。

这样可以避免后续开发者误把 `native` 专属生命周期能力抬升到共享层。

## `native` 实现设计

`native` 目录负责保留当前 `WebContentsView` 模式，主要工作是迁移和收敛，而不是行为重写。

职责包括：

- 保留 `WebContentsView` 由主进程托管的模式。
- 继续在 `onMounted`、`onActivated`、`onDeactivated`、`onBeforeUnmount` 中管理 `create`、`show`、`hide`、`destroy`。
- 继续通过占位容器的 `getBoundingClientRect()` 计算 bounds。
- 继续通过 preload 暴露的 `window.electronAPI.webview` 与主进程通信。

本次迁移后，原 `useWebView.ts` 重命名为 `useNativeWebView.ts`，内部逻辑基本保持不变，只把状态类型和标题同步逻辑接入共享层。

## `web` 实现设计

`web` 目录新增基于 Electron `<webview>` 标签的页面实现。该页面直接在 Vue 模板中渲染 `<webview>` 元素，不依赖主进程创建独立 `WebContentsView`。

页面需要负责：

- 通过 `ref` 获取 `<webview>` 实例。
- 在首次挂载时加载初始 URL。
- 将标签实例事件映射为共享状态。
- 暴露统一导航动作：`navigate`、`goBack`、`goForward`、`reload`、`stop`。

建议监听的核心事件包括：

- `did-start-loading`
- `did-stop-loading`
- `did-navigate`
- `did-navigate-in-page`
- `page-title-updated`
- `dom-ready`

状态更新规则：

- 导航事件更新 `url`。
- 标题事件更新 `title`。
- 加载事件更新 `isLoading`。
- 每次导航和加载结束后重新读取 `canGoBack()` 与 `canGoForward()`。
- 第一版不追求精确的进度百分比，`loadProgress` 采用近似分段模型：`did-start-loading` 设为 `0.1`，`dom-ready` 设为 `0.7`，`did-stop-loading` 设为 `1`。

这意味着第一版的加载条本质上是“有限状态进度反馈”，而不是真实网络进度条。若后续觉得这种视觉语义仍不够准确，可以把共享 shell 的展示改为不确定进度条，但不在本次范围内处理。

## Electron 宿主策略

为了支持 `<webview>`，主窗口需要显式开启 `webviewTag`。但该能力必须和额外的安全收口一起上线，不能只改窗口配置。

### 窗口配置

在 `electron/main/window.mts` 中为主窗口 `webPreferences` 增加：

- `webviewTag: true`

同时保持现有安全配置不变：

- `contextIsolation: true`
- `nodeIntegration: false`

### `will-attach-webview` 安全收口

在主进程统一监听 `will-attach-webview`，执行以下策略：

- 删除页面侧传入的 preload 配置，包括：
  - 清理 `webPreferences.preload`
  - 忽略 `<webview>` 标签上的 `preload="..."` 属性
- 清理危险或未授权的 `webPreferences` 字段。
- 只允许 `http:` 和 `https:` 协议。
- 由主进程强制设置受控 `partition`，而不是信任页面模板传入值。

如果 URL 不合法或协议不在白名单内，直接阻止附加。

第一版不为 `<webview>` 注入受控 preload。`electron/preload/webview.mts` 仍然服务于现有 `native` 的 `WebContentsView` 方案，不复用到 `<webview>` 标签实现。

### Session 策略

第一版推荐为 `web` 实现使用独立持久化分区，例如：

- `persist:tibis-webview`

目的：

- 避免与 `native` 方案的 session、Cookie、缓存互相污染。
- 降低调试成本，便于单独排查 `<webview>` 行为。

后续若需要共享登录态，再单独评估统一 session 的副作用。

这也意味着当用户在 `web` 实现内部完成登录后，点击“在系统浏览器打开”仍然可能在外部浏览器看到未登录页面。该体验断裂是独立 session 策略的已知代价，需要在实现说明和验收时明确接受。

## 新窗口与外链策略

两套实现在第一版都采用保守策略：不在应用内接管额外弹窗。

- `native` 继续使用 `setWindowOpenHandler` 将新窗口请求改为系统浏览器打开。
- `web` 在标签事件中拦截新窗口或外链请求，统一改为系统浏览器打开。

这能保证第一版不引入新的标签页分裂逻辑，也能避免页面自发弹出未受控窗口。

## 组件与数据流

两条路由的数据流保持一致：

1. 路由读取 `query.url`。
2. 共享 URL 工具做标准化处理。
3. 具体实现创建内部控制器并初始化目标地址。
4. 地址栏按钮调用统一动作接口。
5. 状态变化统一驱动标题栏、加载条和标签页标题。
6. “在浏览器打开”统一调用 `native.openExternal`。

这样可以保证页面交互层对底层宿主无感知。

## 错误处理

第一版错误处理保持轻量：

- URL 非法时不创建页面实例，展示现有消息提示。
- `<webview>` 附加被主进程拒绝时，由主进程通过额外 IPC 事件把拒绝原因发送给当前渲染页，渲染层据此记录日志并提示无法打开该地址。
- 加载失败时更新 `isLoading = false`，并保留当前 URL 供用户重试。
- `native` 与 `web` 都应在销毁时清理事件监听，避免 keep-alive 恢复后重复绑定。

之所以增加显式 IPC 事件，是因为仅依赖 `<webview>` 自身事件不足以稳定区分“页面加载失败”和“宿主附加前就被主进程拒绝”这两类错误。

## 测试与验证

需要覆盖以下验证点：

- 两条路由都能通过 `url` 参数打开页面。
- 地址栏的后退、前进、刷新、停止按钮在两套实现下行为一致。
- 页面标题变化后能够同步更新标签页标题。
- `native` 实现切换 keep-alive 页面时仍能正确 `show` / `hide`。
- `web` 实现切换 keep-alive 页面后不会重复注册事件。
- 非 `http/https` 地址在 `web` 实现下会被主进程拒绝附加。
- 新窗口请求不会在应用内失控弹出。

第一版优先做人肉验证，后续再根据可测试性补充单元或集成测试。

调试阶段允许通过开发者工具直接检查 `<webview>` 宿主行为，但不把“在产品界面中暴露 `<webview>` DevTools 入口”纳入本次正式功能范围。

## 实施步骤建议

1. 重组 `src/views/webview` 目录，抽出 `shared`。
2. 迁移当前 `native` 实现到新目录，保持行为不变。
3. 在主窗口启用 `webviewTag` 并补齐 `will-attach-webview` 安全控制。
4. 新增 `web` 目录并实现 `<webview>` 版最小能力。
5. 新增显式路由并接入现有标签页系统。
6. 完成双实现对照验证，再决定是否引入默认入口映射。

## 风险与权衡

- `<webview>` 开发体验更直接，但宿主安全面更大，因此必须把控制点放在主进程。
- `native` 与 `web` 生命周期不同，不能强行复用同一套页面组件，只能复用共享状态和 UI。
- 独立 `partition` 会带来登录态不共享，也会导致“在系统浏览器打开”时可能回到未登录状态，但这是第一版换取可控性的必要成本。
- 显式双路由会增加入口数，但换来更低的调试复杂度和更清晰的行为边界。

## 结论

本次 WebView 演进应采用“共享 shell，分别挂 `native` 和 `web`”的双实现并行方案。该方案可以在不回退现有能力的前提下，以最低风险引入 `<webview>` 标签实现，并为后续的默认实现切换、灰度验证和能力收敛提供清晰的结构基础。
