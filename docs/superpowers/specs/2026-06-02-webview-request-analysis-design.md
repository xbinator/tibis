# WebView 请求与页面加载 AI 分析设计

## 背景

当前 `src/views/webview/web/` 已经支持基于 Electron `<webview>` 的网页加载、设备尺寸模拟、Touch 模拟、User-Agent 切换以及页面 DOM 元素点选。下一步如果希望 AI 分析网站请求、页面加载性能和潜在问题，需要先把 WebView 的运行过程采集成稳定、可压缩、可解释的数据快照。

这类能力不能只依赖渲染进程里的 `<webview>` DOM 事件。主页面导航可以从 `<webview>` 事件中拿到，但页面内部的 fetch、XHR、图片、CSS、JS、字体等资源请求，需要通过 Electron 主进程的 `session.webRequest` 采集；页面性能指标则需要在 WebView 页面内注入脚本读取 `performance` 数据。AI 分析只消费整理后的快照，不直接消费原始请求流。

## 目标

- 为每个 WebView 标签页采集网络请求、响应、错误和基础耗时。
- 采集页面加载性能指标，包括 navigation timing、resource timing、DOMContentLoaded、load 等。
- 采集页面运行问题，包括 console error/warning、未捕获错误和资源加载失败。
- 生成 HAR-like 的 `WebviewAnalysisSnapshot`，作为 Network 面板和 AI 分析的共同数据源。
- 支持 AI 基于快照输出页面加载诊断报告、失败请求分析和优化建议。
- 保持采集功能默认可控，避免长期保存敏感请求头、Cookie 或请求体。

## 非目标

- 第一版不实现完整 Chrome DevTools Network 面板。
- 第一版不采集请求体和响应体。
- 第一版不绕过网站安全策略，不修改第三方网站请求。
- 第一版不实现 Lighthouse 等完整审计体系，只做 Tibis 内部轻量诊断。
- 第一版不把所有请求原样丢给 AI，必须先做结构化压缩和隐私裁剪。
- 第一版不覆盖 `native` WebContentsView 实现，优先服务 `web` `<webview>` 实现。

## 总体方案

采用“四层管线”：

1. **采集层**：主进程通过 `session.webRequest` 采集请求，WebView 页面通过注入脚本采集性能和 console 信息。
2. **归档层**：按 WebView tab/session 聚合成请求记录、性能记录和问题记录。
3. **快照层**：在用户触发分析时生成 `WebviewAnalysisSnapshot`，包含摘要、慢请求、失败请求、资源分组和页面指标。
4. **AI 分析层**：AI 只读取快照和压缩后的上下文，输出可读诊断报告。

数据流如下：

```text
<webview> tab
  │
  ├─ main process session.webRequest
  │    └─ request/response/error records
  │
  ├─ renderer webview.executeJavaScript(...)
  │    └─ performance/console/runtime issue records
  │
  ▼
WebviewAnalysisStore
  │
  ├─ buildSnapshot(tabId)
  ├─ summarizeForAI(snapshot)
  └─ Network / Analysis UI
       │
       ▼
AI 诊断报告
```

## Session 与标签页隔离

请求采集必须能按 WebView 标签页隔离。现有 `<webview>` attach 安全收口位于 `electron/main/modules/webview/ipc.mts`，当前会把 `<webview>` 的 partition 强制覆盖为共享常量：

```ts
export const WEBVIEW_TAG_PARTITION = 'persist:tibis-webview';
```

这意味着当前 `web` `<webview>` 实现的所有标签页会落到同一个 Electron session。该策略有利于共享登录态和缓存，但不利于请求采集归属。请求分析功能上线前必须先做一次采集层技术验证，确认主进程可以对该 partition 注册 `session.webRequest`，并且能通过额外映射把请求归属到正确 tab。

第一版有两种可选策略：

| 策略 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 共享 partition + active tab 映射 | 保留登录态共享，不改变现有行为 | 多标签页并发加载时容易串请求，需要 `webContentsId` 或活动窗口映射 | 适合保持当前用户体验 |
| 每 tab 独立 partition | 请求归属最清晰，采集器简单 | 登录态、Cookie、缓存按 tab 隔离，体验变化明显 | 适合诊断隔离模式 |

设计建议：第一版先保持现有共享 partition，不直接破坏登录态；分析模式启动时建立 `tabId -> partition -> webContentsId` 的采集映射。只有在技术验证证明共享 partition 无法可靠归属请求时，再引入“诊断隔离模式”，由用户显式选择独立 partition。

如果后续启用独立 partition，命名建议为：

```ts
const partition = `persist:tibis-webview-${tabId}`;
webviewElement.setAttribute('partition', partition);
```

这项改动必须同步调整 `electron/main/modules/webview/ipc.mts` 中的 `sanitizeAttachedWebPreferences`，否则 renderer 设置的 partition 会被主进程覆盖。

需要保留当前安全原则：

- 只允许 `http:` / `https:` URL。
- 不信任页面传入的 preload。
- 不采集或展示敏感字段的完整值。
- 停止采集时必须注销 webRequest 监听器。

## 采集层技术验证

进入正式实现前，需要先做一个 spike 验证以下链路：

1. `<webview>` attach 后主进程使用 `session.fromPartition(WEBVIEW_TAG_PARTITION)` 能监听到页面子资源请求。
2. 同时打开两个 `web` WebView 标签页时，请求记录能可靠归属到正确 tab。
3. 如果共享 partition 无法区分 tab，请验证是否能通过 `<webview>.getWebContentsId()` 上报 `webContentsId`，再在主进程用 `webContents.fromId(webContentsId)` 建立 `webContentsId -> tabId` 映射。
4. 验证 `native` WebContentsView 实现是否也能复用同一采集器接口。`native` 主进程已经持有 `WebContentsView.webContents`，理论上更容易采集，但第一版不做 UI 覆盖。

spike 输出需要明确选择：继续共享 partition、改为独立 partition，或提供“普通浏览共享登录态 / 诊断模式隔离 session”两种模式。

## 请求采集设计

主进程新增 WebView 请求采集模块。建议放在现有 WebView 模块内部，避免把 WebView 生命周期和分析生命周期拆散：

```text
electron/main/modules/webview/
└── analysis/
    ├── collector.mts
    ├── ipc.mts
    └── types.mts
```

核心职责：

- 按 `tabId` 启动/停止采集。
- 对应到目标 `session`。
- 监听 webRequest 生命周期。
- 将请求事件聚合成稳定记录。
- 通过 IPC 推送增量事件或按需返回快照。

请求聚合主键使用 Electron `webRequest` details 中的 `id`。同一个请求在 `onBeforeRequest`、`onBeforeSendHeaders`、`onHeadersReceived`、`onCompleted`、`onErrorOccurred` 之间必须使用同一 `requestId` 更新同一条记录。若某些事件缺失，例如缓存命中跳过请求头阶段，采集器应保留已有字段并把缺失字段视为 `undefined`，不能丢弃整条请求。

建议监听：

| 事件 | 用途 |
|------|------|
| `onBeforeRequest` | 创建请求记录，记录 URL、method、resourceType、startTime |
| `onBeforeSendHeaders` | 采集请求头，按隐私规则裁剪 |
| `onHeadersReceived` | 采集 statusCode、responseHeaders、mimeType |
| `onCompleted` | 标记成功结束，计算 duration |
| `onErrorOccurred` | 标记失败，记录 error |

重定向处理：

- 3xx 响应记录为一条已完成请求，包含 `statusCode` 与 `redirectURL`。
- 后续跳转目标请求使用新的 `requestId` 记录。
- 采集器通过 `redirectChain` 保存同一次导航中的上游 URL，便于 UI 和 AI 说明“慢在重定向链上”。
- 如果 Electron 事件无法提供完整链路，至少记录当前请求的 `redirectURL`。

请求记录类型：

```ts
export interface WebviewRequestRecord {
  id: string;
  requestId: string;
  tabId: string;
  url: string;
  method: string;
  resourceType: string;
  statusCode?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  redirectURL?: string;
  redirectChain?: string[];
  initiatorUrl?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  fromCache?: boolean;
  error?: string;
  domain: string;
}
```

隐私裁剪规则：

- 默认隐藏 `cookie`、`authorization`、`set-cookie`、`x-api-key`、`token` 等字段。
- 请求 URL 默认保留 query，但 AI 摘要阶段需要按 key 名隐藏疑似敏感值。
- 不采集 request body 和 response body。
- Network 面板可以展示“已隐藏敏感字段”提示。

请求记录上限：

- 每个 tab 内存中最多保留最近 1000 条请求。
- 超出上限时按 FIFO 删除已完成请求，优先保留失败请求和慢请求摘要。
- 原始请求记录仅服务 UI；AI 分析必须使用压缩后的 `WebviewAnalysisAIContext`。

## 页面性能采集设计

在 `<webview>` 的 `dom-ready`、`did-stop-loading` 后通过 `executeJavaScript` 注入脚本读取：

```js
performance.getEntriesByType('navigation')
performance.getEntriesByType('resource')
```

采集内容：

- `domContentLoadedEventEnd - startTime`
- `loadEventEnd - startTime`
- `responseStart - requestStart` 近似 TTFB
- First Paint / First Contentful Paint（浏览器提供时）
- Largest Contentful Paint（浏览器提供时，采集不到时为空）
- 每类资源数量与总耗时
- 慢资源列表
- 资源 transferSize / encodedBodySize / decodedBodySize（浏览器可用时）

页面性能类型：

```ts
export interface WebviewPerformanceMetrics {
  capturedAt: number;
  url: string;
  domContentLoadedMs?: number;
  loadMs?: number;
  ttfbMs?: number;
  firstPaintMs?: number;
  firstContentfulPaintMs?: number;
  largestContentfulPaintMs?: number;
  resourceCount: number;
  totalTransferSize?: number;
  slowResources: WebviewResourceTiming[];
}

export interface WebviewResourceTiming {
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSize?: number;
}
```

## Console 与运行错误采集

第一版可以优先采集 `<webview>` 可直接监听的 console 事件，如果 Electron `<webview>` 类型覆盖不足，再通过主进程或注入脚本补齐。

采集来源分两类：

- `<webview>` / `webContents` 的 `console-message`：适合捕获页面 console 输出，但 level 和 source 信息可能因 Electron 版本有所差异。
- 注入脚本的 `error` / `unhandledrejection`：适合捕获运行错误和 Promise 异常。

去重策略：

- 以 `level + message + source + line + column` 作为近似 key。
- 500ms 内重复出现的同 key issue 只保留一次，并累加 `count`。
- 注入脚本失败时记录一条采集失败 issue，不影响 WebView 正常加载。

建议记录：

```ts
export interface WebviewConsoleIssue {
  tabId: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  count: number;
  capturedAt: number;
}
```

注入脚本可补充：

- `window.addEventListener('error', ...)`
- `window.addEventListener('unhandledrejection', ...)`

注意：第三方页面可能有 CSP 或隔离限制，注入失败时应记录采集失败原因，而不是中断 WebView 加载。

## 快照模型

AI 和 UI 共同消费快照，不直接消费原始采集器状态：

```ts
export interface WebviewAnalysisSnapshot {
  id: string;
  tabId: string;
  page: {
    url: string;
    title: string;
    capturedAt: number;
  };
  summary: {
    totalRequests: number;
    failedRequests: number;
    slowRequests: number;
    totalDomains: number;
    totalTransferSize?: number;
    domContentLoadedMs?: number;
    loadMs?: number;
  };
  requestSummary: WebviewRequestSummary[];
  failedRequests: WebviewRequestRecord[];
  slowRequests: WebviewRequestRecord[];
  thirdPartyDomains: string[];
  performance?: WebviewPerformanceMetrics;
  consoleIssues: WebviewConsoleIssue[];
}

export interface WebviewRequestSummary {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  statusCode?: number;
  durationMs?: number;
  domain: string;
  error?: string;
}
```

快照生成规则：

- `slowRequests` 默认取 duration 超过 1000ms 的请求，最多保留 20 条。
- `failedRequests` 保留 HTTP 4xx/5xx 和 `onErrorOccurred` 记录，最多保留 50 条。
- `requestSummary` 是裁剪后的轻量列表，最多保留 200 条，不包含 headers。
- 完整请求头只在 Network 面板查看单条请求详情时从 store 按 ID 查询。
- `thirdPartyDomains` 第一版使用 eTLD+1 判定；如果暂不引入 public suffix 依赖，则退化为同域或子域匹配，并在 UI 中标记为“近似判定”。

## AI 分析上下文

AI 不读取完整请求头，不读取所有请求明细。应先构建压缩摘要：

```ts
export interface WebviewAnalysisAIContext {
  page: WebviewAnalysisSnapshot['page'];
  summary: WebviewAnalysisSnapshot['summary'];
  topSlowRequests: Array<Pick<WebviewRequestRecord, 'url' | 'method' | 'resourceType' | 'statusCode' | 'durationMs' | 'domain'>>;
  failedRequests: Array<Pick<WebviewRequestRecord, 'url' | 'method' | 'resourceType' | 'statusCode' | 'error' | 'domain'>>;
  resourceBreakdown: Record<string, { count: number; totalDurationMs: number; totalTransferSize?: number }>;
  consoleIssues: WebviewConsoleIssue[];
}
```

AI 报告输出结构：

- **加载概览**：请求总数、失败数、DOMContentLoaded、Load。
- **主要瓶颈**：慢请求、阻塞资源、第三方域名。
- **失败与风险**：4xx/5xx、CORS 迹象、资源加载失败、console error。
- **优化建议**：图片压缩、缓存、减少第三方脚本、拆分关键资源等。
- **下一步排查**：建议用户查看的具体请求或页面区域。

## UI 设计

第一版 UI 建议放在 WebView 页面内部设备工具栏附近，作为诊断面板入口：

- “Network” 面板：表格展示请求 URL、method、status、type、duration、domain。
- “Performance” 面板：展示页面加载摘要和慢资源。
- “AI 分析”按钮：生成快照并调用 AI 输出诊断报告。

不建议第一版实现复杂瀑布图。可以先用排序表格和摘要卡片，等数据模型稳定后再补 waterfall。

## IPC 设计

建议 preload 暴露：

```ts
webviewAnalysis: {
  start: (tabId: string, partition: string) => Promise<void>;
  stop: (tabId: string) => Promise<void>;
  getSnapshot: (tabId: string) => Promise<WebviewAnalysisSnapshot>;
  getRequest: (tabId: string, requestId: string) => Promise<WebviewRequestRecord | undefined>;
  clear: (tabId: string) => Promise<void>;
  onRequestsUpdated: (callback: (tabId: string, records: WebviewRequestSummary[]) => void) => UnlistenFn;
}
```

主进程需要校验：

- `tabId` 必须是当前应用已知 WebView tab。
- `partition` 必须是 `WEBVIEW_TAG_PARTITION` 或符合内部允许列表，不能由 renderer 任意指定。
- renderer 不能监听任意 session。

IPC 推送策略：

- 不按单条请求实时推送，避免页面加载高峰产生 IPC 洪水。
- 采集器在主进程内按 200ms 窗口批量推送 `WebviewRequestSummary[]`。
- 如果短时间内请求量超过 200 条，当前批次截断为最近 200 条，并设置面板状态提示“仍有更多请求，可刷新列表”。
- Renderer 可在面板激活时调用 `getSnapshot(tabId)` 拉取全量摘要。

生命周期：

- 用户打开诊断面板或点击“开始分析”时启动采集。
- 第一版不默认对所有 WebView 自动开启采集，避免无感记录用户浏览请求。
- WebView tab 关闭时自动 `stop(tabId)` 并清理 webRequest 监听器。
- 采集数据默认只保存在内存中；关闭 tab 后立即清理。
- 如果 AI 调用失败，保留当前内存快照，允许用户重新触发分析；关闭 tab 后仍清理。

## 与现有 WebView 的关系

现有文件职责保持：

| 文件 | 后续关系 |
|------|----------|
| `src/views/webview/web/index.vue` | 增加分析面板入口、启动/停止采集、触发快照 |
| `src/views/webview/web/hooks/useWebView.ts` | 保持导航、DOM 点选、touch、UA 等页面控制，不承载请求采集主逻辑 |
| `src/views/webview/web/utils/hosting.ts` | 不参与请求分析 |
| `src/views/webview/shared/types.ts` | 可扩展共享的分析状态类型，但不要把大体量请求记录塞入基础 `WebviewPageState` |
| `electron/main/modules/webview/ipc.mts` | 保留 attach 安全收口；如启用独立 partition，需要同步更新 partition 策略 |
| `electron/main/modules/webview/analysis/` | 新增请求采集、快照构建和 IPC |

请求采集不应塞进 `useWebView.ts`。该 hook 只适合处理 `<webview>` 实例动作和页面内脚本注入；网络请求生命周期属于 Electron session 层，应独立成分析模块。

采集器接口应尽量同时兼容 `web` 和 `native` 两种实现：

```ts
export interface WebviewAnalysisTarget {
  tabId: string;
  partition?: string;
  webContentsId?: number;
}
```

第一版 UI 只覆盖 `web` `<webview>` 实现；但主进程采集器不应写死 `<webview>` 标签概念。`native` 实现后续可以直接传 `WebContentsView.webContents.id` 接入同一采集器。

## 分阶段实现

### 阶段 1：数据采集 MVP

- 完成采集层技术验证，明确共享 partition 或独立 partition 策略。
- 主进程实现请求采集器。
- Renderer 能启动/停止采集并查看原始请求表格。
- 不接 AI。

### 阶段 2：性能与问题采集

- 注入 performance 采集脚本。
- 采集 console error/warning。
- 生成 `WebviewAnalysisSnapshot`。
- 增加失败请求、慢请求和资源类型汇总。

### 阶段 3：AI 分析

- 实现 `buildWebviewAnalysisAIContext(snapshot)`。
- 接入现有 AI 调用链。
- 输出结构化诊断报告。
- 支持把报告追加到聊天侧边栏或 WebView 分析面板。

### 阶段 4：增强体验

- Network 表格筛选、搜索和排序。
- 请求复制为 cURL。
- HAR 导出。
- 简化瀑布图。
- 多次快照对比。

## 风险与约束

- Electron `<webview>` 的 session 与 webRequest 归属需要谨慎处理，否则会串 tab。
- 部分页面的 performance resource timing 可能因跨域限制缺少 size 信息。
- 请求头可能包含敏感信息，必须默认裁剪。
- 长时间采集会产生大量记录，需要设置上限，例如每个 tab 保留最近 1000 条请求。
- AI 分析结果不能替代安全审计，只能作为辅助诊断。
- 共享 partition 保留登录态，但请求归属更复杂；独立 partition 采集更干净，但会改变登录态与缓存体验。
- `console-message` 与注入脚本可能重复采集同一错误，需要按近似 key 去重。
- performance 注入脚本可能失败，UI 需要展示“性能数据不可用”，但请求采集仍应继续。

## 错误处理与降级

- `session.webRequest` 注册失败：诊断面板展示“请求采集不可用”，保留页面性能采集入口。
- partition 未找到或不在允许列表：拒绝启动采集，并记录 renderer 可见错误。
- performance 脚本执行失败：快照中 `performance` 为空，`summary` 只展示请求统计。
- AI 分析失败：保留快照，允许用户重试，不清理请求记录。
- 批量 IPC 推送失败：下次面板刷新时通过 `getSnapshot(tabId)` 重新拉取。

## 验证标准

- 打开一个页面后，Network 面板能看到主文档、CSS、JS、图片等资源请求。
- 切换 WebView tab 时，请求记录不会串到其他 tab。
- 两个 WebView tab 并发加载时，请求记录仍能归属到正确 tab，或 spike 明确记录共享 partition 无法满足并切换方案。
- 页面加载结束后能生成包含 summary、failedRequests、slowRequests 的快照。
- AI 分析不会收到 Cookie、Authorization 等敏感请求头。
- 关闭 WebView tab 后，对应采集器被清理。
- 高请求量页面加载时，IPC 推送按批次合并，不出现每条请求一次 IPC 的行为。
