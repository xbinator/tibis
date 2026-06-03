# 当前网页读取工具设计

## 背景

当前聊天侧边栏已经支持通过 `read_current_document` 读取当前编辑器文档，但 AI 无法按需读取用户正在浏览的 WebView 页面。`src/views/webview/web/` 已经具备基于 Electron `<webview>` 的页面加载、标题同步、设备预览、元素选择和 `executeJavaScript` 注入能力，因此可以在不自动注入页面内容的前提下，为 AI 提供一个只在当前存在激活 WebView 时才可用的网页读取工具。

本设计只覆盖 `web` `<webview>` 实现。`native` WebContentsView 实现可以后续复用同一上下文接口，但不纳入第一版。

## 目标

- 新增 `read_current_webpage` 内置 AI 工具，按需读取当前激活 WebView 页面内容。
- 仅当存在激活的 WebView 上下文时，把该工具传给模型；没有 WebView 时不传入。
- 页面内容不自动进入每轮聊天上下文，由模型在用户提出页面相关问题时调用工具读取。
- 第一版读取标题、URL、可见正文、标题结构、链接和页面选中文本。
- 对正文、链接和字段做裁剪，避免 token 膨胀和隐私噪声。

## 非目标

- 不实现 `@page` 输入引用。
- 不自动把当前页面摘要注入 system prompt 或用户消息。
- 不读取密码框、隐藏元素、表单控件值或 Cookie、本地存储等敏感状态。
- 不采集网络请求、性能指标或 HAR 数据；这些属于独立的 WebView 分析能力。
- 不绕过站点安全策略。若目标页面禁止脚本访问或脚本执行失败，工具返回可解释错误。

## 总体方案

采用“WebView 上下文注册表 + 工具按需读取”的方案。

```text
src/views/webview/web/index.vue
  └─ 注册当前 WebView 上下文
       └─ readPageSnapshot()

src/ai/tools/context/webview.ts
  └─ webviewToolContextRegistry

src/ai/tools/builtin/WebpageTool/
  └─ read_current_webpage

src/components/BChatSidebar/index.vue
  └─ getActiveTools() 有激活 WebView 时才保留工具
```

这样与现有编辑器上下文模式保持一致：聊天侧边栏不直接依赖 WebView 组件实例，而是通过 registry 判断是否存在当前可读页面。

## WebView 上下文接口

新增共享上下文类型，建议放在 `src/ai/tools/context/webview.ts`：

```ts
export interface WebviewPageTruncation {
  text: boolean;
  headings: boolean;
  links: boolean;
  selectedText: boolean;
}

export interface WebviewPageSnapshot {
  url: string;
  title: string;
  text: string;
  selectedText: string;
  headings: WebviewPageHeading[];
  links: WebviewPageLink[];
  capturedAt: number;
  truncated: WebviewPageTruncation;
}

export interface WebviewToolContext {
  readPageSnapshot(): Promise<WebviewPageSnapshot>;
}
```

注册表需要提供：

- `register(id, context)`：注册当前 WebView 页面。
- `unregister(id)`：页面卸载时移除。
- `setCurrent(id)`：页面激活时标记为当前上下文。
- `clearCurrent(id)`：页面失活或关闭时清理当前上下文。
- `getCurrentContext()`：工具读取当前激活 WebView。

这里刻意不完全复用 `editorToolContextRegistry` 的三方法模式。编辑器上下文目前以最后注册的编辑器作为 active editor，`unregister` 时回退到剩余 Map 的最后一个；而 WebView 页面运行在默认布局的 KeepAlive 中，并且真实 `<webview>` 宿主层挂在 `document.body` 下，多个 WebView tab 可以同时保留 DOM 与宿主实例。此时“最后注册”不等于“当前激活标签页”，所以需要显式的 `setCurrent` / `clearCurrent` 来跟随路由激活状态。

`src/views/webview/web/index.vue` 负责注册上下文，而不是让聊天侧边栏持有 WebView 实例。`useWebView(webviewElementRef)` 返回 `readPageSnapshot()` 方法，`index.vue` 在 `<script setup>` 中把该方法注册到 `webviewToolContextRegistry`：

```ts
webviewToolContextRegistry.register(routeFullPath, {
  readPageSnapshot: webview.readPageSnapshot
});
```

页面 `onMounted` / `onActivated` 时调用 `setCurrent(routeFullPath)`，`onDeactivated` 时调用 `clearCurrent(routeFullPath)`，`onBeforeUnmount` 时调用 `unregister(routeFullPath)`。如果当前路由暂时没有进入 KeepAlive，`onMounted` / `onBeforeUnmount` 也能覆盖第一版行为；如果 KeepAlive 生效，激活状态仍然准确。

## 页面快照读取

`useWebView.ts` 新增 `readPageSnapshot()`，内部通过当前 `<webview>.executeJavaScript()` 执行页面脚本。该方法是 navigation-aware 的：如果 `state.value.isLoading` 为 true，直接抛出“页面正在导航，请稍后重试”的可解释错误，不在导航过程中执行脚本。

脚本只读取页面可见文本和结构化导航信息：

- `location.href`
- `document.title`
- `window.getSelection()?.toString()`
- `document.body.innerText`
- `document.querySelectorAll('h1,h2,h3,h4,h5,h6')`
- `document.querySelectorAll('a[href]')`

裁剪策略：

- 正文最多保留 20000 个字符。
- 标题最多保留 120 条，每条文本最多 300 字符。
- 链接最多保留 100 条，每条文本最多 300 字符。
- 选中文本最多保留 4000 个字符。
- `truncated.text`、`truncated.headings`、`truncated.links`、`truncated.selectedText` 分别标记对应字段是否发生裁剪。

脚本需要跳过明显敏感或无意义内容：

- 不读取 `input`、`textarea`、`select` 的值。
- 不读取隐藏元素的属性值。
- 链接只保留 `text` 和解析后的 `href`。
- 正文来自 `innerText`，不返回 HTML。

执行保护：

- `readPageSnapshot()` 设置 10 秒超时；超时后抛出“页面读取超时”错误。
- 如果已有一次 `readPageSnapshot()` 正在进行，重复调用复用同一个进行中的 Promise，避免模型连续调用时重复注入脚本。
- Promise 完成或失败后必须清理进行中引用，后续读取可以重新执行。

如果 `executeJavaScript` 不可用、页面尚未加载完成、脚本执行失败或返回结构不符合预期，`readPageSnapshot()` 抛出带原因的错误，由工具转换为失败结果。错误处理需要识别 Electron 返回的安全策略类错误；如果错误信息表明脚本执行被 CSP 或页面安全策略阻止，则返回“页面安全策略阻止读取”，区别于一般脚本异常。

## AI 工具设计

新增内置工具 `read_current_webpage`。工具描述应明确它读取“当前激活 WebView 页面的可读文本快照”，适用于总结网页、提取链接、解释当前页面内容、结合选中文本回答问题。命名使用 `webpage` 而不是 `webview`，避免模型误解为读取 Tibis 的 WebView 组件实现细节。

工具输入第一版为空对象：

```ts
type ReadCurrentWebpageInput = Record<string, never>;
```

未来可扩展可选参数，但第一版不实现：

- `includeLinks?: boolean`：模型不需要链接时跳过链接列表，减少 token。
- `maxChars?: number`：允许模型按需控制正文长度。

工具输出为结构化文本或 JSON 兼容对象，包含：

- 页面 URL 和标题。
- 页面选中文本。
- 标题结构。
- 链接列表。
- 可见正文。
- 裁剪提示。

当没有激活 WebView 上下文时，工具返回失败结果，说明“当前没有可读取的 WebView 页面”。正常情况下 `BChatSidebar` 已经会在无上下文时过滤掉工具，因此该失败分支主要服务竞态和测试。

工具通过 `CreateBuiltinToolsOptions` 注入上下文读取函数，不直接 import 单例读取当前上下文：

```ts
export interface CreateBuiltinToolsOptions {
  getWebviewContext?: () => WebviewToolContext | undefined;
}
```

`src/components/BChatSidebar/index.vue` 调用 `createBuiltinTools()` 时传入：

```ts
getWebviewContext: () => webviewToolContextRegistry.getCurrentContext()
```

工具执行时通过闭包调用 `options.getWebviewContext?.()` 获取当前上下文。这样与现有内置工具通过 options 注入 `getWorkspaceRoot`、`getEditorContext`、`openInWebview` 的方式一致，也便于单元测试替换上下文。

## 聊天侧边栏接入

`src/components/BChatSidebar/index.vue` 的工具过滤逻辑新增 WebView 判断：

```ts
const hasActiveWebview = Boolean(webviewToolContextRegistry.getCurrentContext());
```

`getActiveTools()` 中仅当 `hasActiveWebview` 为 true 时保留 `read_current_webpage`。这与 `read_current_document` 的运行时过滤一致，不需要改动输入框，也不需要新增用户操作入口。

## 错误处理

- 页面未加载完成：返回“当前页面尚未准备好读取，请稍后重试”。
- 页面正在导航：返回“当前页面正在导航，请稍后重试”。
- 页面读取超时：返回“页面读取超时，请稍后重试或刷新页面”。
- 脚本注入失败：返回错误原因，但不泄露堆栈。
- 页面安全策略阻止读取：返回“页面安全策略阻止读取当前网页内容”。
- 页面内容为空：返回 URL、标题和空正文提示。
- 快照被裁剪：在结果中明确提示正文或列表已截断。

工具错误不应中断聊天运行时，只作为工具结果反馈给模型。

## 测试

需要覆盖以下范围：

- `webviewToolContextRegistry` 注册、切换、清理当前上下文。
- `read_current_webpage` 在无上下文时返回失败结果。
- `read_current_webpage` 在有上下文时返回页面快照。
- `BChatSidebar` 工具过滤：无激活 WebView 时不包含该工具，有上下文时包含该工具。
- `useWebView.readPageSnapshot()` 的返回值校验和裁剪逻辑可以通过可注入的脚本构建函数或单元工具函数测试。
- `executeJavaScript` 返回异常值或非预期结构时返回可解释错误。
- 脚本执行被 CSP 或页面安全策略阻止时返回对应错误。
- 并发调用 `readPageSnapshot()` 时复用同一个进行中的 Promise。
- 页面导航中调用 `readPageSnapshot()` 时不执行脚本并返回导航中错误。

## 验收标准

- 用户打开 WebView 页面后，向 AI 询问当前网页内容，模型可以调用 `read_current_webpage` 获取页面快照。
- 未打开或未激活 WebView 页面时，模型不会收到 `read_current_webpage` 工具。
- 工具不会自动读取页面内容，也不会读取表单值、密码、Cookie 或本地存储。
- 相关 TypeScript、ESLint 和单元测试通过。
