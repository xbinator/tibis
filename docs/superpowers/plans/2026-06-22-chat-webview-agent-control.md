# Chat WebView Agent Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Tibis ChatRuntime observe and operate the currently active WebView through `read_current_webpage` and `operate_webpage`.

**Architecture:** Keep ChatRuntime as the only model loop. Add a main-process `WebviewTool` group whose execution uses renderer bridge requests to the active WebView context. The renderer owns DOM snapshot, snapshot TTL, and DOM actions; main process owns tool registry, validation envelope, permission confirmation, and stable tool results.

**Tech Stack:** Electron 41, Vue 3 Composition API, TypeScript strict, Vercel AI SDK tool schema, Pinia context registries, Vitest.

**User Constraint:** Do not commit during implementation. Leave changes unstaged/uncommitted until the final unified commit request.

---

## File Structure

- Modify `shared/ai/tools/toolRegistry.ts`
  - Add `OPERATE_WEBPAGE_TOOL_NAME`.
  - Add `webview` to `ToolRuntimeGroup`.
  - Move `read_current_webpage` to WebView group and conditional exposure.
  - Add `operate_webpage` schema with one `action` union.

- Modify `src/ai/tools/catalog/runtimeTools.ts`
  - Import/export `OPERATE_WEBPAGE_TOOL_NAME`.
  - Add `createOperateWebpageTool`.

- Modify `src/ai/tools/builtin/index.ts`
  - Export `OPERATE_WEBPAGE_TOOL_NAME`.
  - Include schema-only WebView tools in `createBuiltinTools()` so `useRuntimeTools()` can dynamically filter them.

- Modify `electron/main/modules/chat/runtime/tools/constants.mts`
  - Export WebView tool constants.
  - Add `WEBVIEW_TOOL_NAMES`.
  - Remove `read_current_webpage` from `READ_TOOL_NAMES` by moving its registry group.

- Create `electron/main/modules/chat/runtime/tools/WebviewTool/index.mts`
  - Add `isWebviewTool()` and `executeWebviewTool()`.
  - Handle `read_current_webpage` and `operate_webpage`.
  - Request renderer bridge kinds `webview-snapshot` and `webview-operate`.
  - Convert bridge timeout/failures into stable tool results.

- Modify `electron/main/modules/chat/runtime/tools/index.mts`
  - Route WebView tools before fallback.

- Modify `electron/main/modules/chat/runtime/tools/types.mts`
  - Add serializable WebView operation input/result types used by main-process tests.

- Modify `src/ai/tools/context/webview.ts`
  - Extend `WebviewToolContext` with `operatePage(input)`.
  - Add snapshot element, scroll, operation input, operation result, and error code types.

- Modify `src/components/BChat/utils/runtimeBridge.ts`
  - Add `webview-operate` bridge handling.
  - Keep `webview-snapshot` backed by `readPageSnapshot()`.

- Modify `src/components/BChat/hooks/useRuntimeTools.ts`
  - Import and filter `OPERATE_WEBPAGE_TOOL_NAME`.
  - Hide both WebView tools when no active WebView context exists.

- Modify `src/views/webview/web/hooks/useWebView.ts`
  - Upgrade `readPageSnapshot()` to include `snapshotId`, scroll state, loading state, and indexed elements.
  - Add `operatePage(input)`.
  - Add page script builders and normalization helpers.
  - Clear snapshot cache on navigation start and element selection reset.

- Modify tests:
  - `test/ai/tools/tool-registry.test.ts`
  - `test/ai/tools/builtin-index.test.ts`
  - `test/electron/main/modules/chat/runtime/main-tools.test.ts`
  - `test/components/BChat/runtime-bridge.test.ts`
  - `test/views/webview/web-use-webview.test.ts`
  - Add `test/components/BChat/use-runtime-tools.test.ts` only if no existing test can cover dynamic WebView filtering cleanly.

- Modify `changelog/2026-06-22.md`
  - Add the implementation summary under `Added` or `Changed`.

---

### Task 1: Registry And Schema

**Files:**
- Modify: `shared/ai/tools/toolRegistry.ts`
- Modify: `src/ai/tools/catalog/runtimeTools.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Test: `test/ai/tools/tool-registry.test.ts`
- Test: `test/ai/tools/builtin-index.test.ts`

- [ ] **Step 1: Write registry tests for WebView group and conditional exposure**

Add expectations to `test/ai/tools/tool-registry.test.ts`:

```ts
it('derives WebView tools by runtime group', (): void => {
  expect(getToolNamesByRuntimeGroup('main', 'webview')).toEqual(expect.arrayContaining(['read_current_webpage', 'operate_webpage']));
});

it('exposes WebView tools as conditional tools', (): void => {
  expect(getToolNamesByExposure('conditional-readonly')).toEqual(expect.arrayContaining(['read_current_webpage']));
  expect(getToolNamesByExposure('conditional-writable')).toEqual(expect.arrayContaining(['operate_webpage']));
});
```

Update the existing exposure test so `default-readonly` no longer expects `read_current_webpage`, and `conditional-readonly` does expect it:

```ts
expect(getToolNamesByExposure('default-readonly')).toEqual(
  expect.arrayContaining(['read_current_document', 'read_current_drawing', 'get_current_time', 'read_file', 'get_settings', 'query_logs', 'open_resource'])
);
expect(getToolNamesByExposure('conditional-readonly')).toEqual(expect.arrayContaining(['read_directory', 'get_mcp_settings', 'read_current_webpage']));
```

- [ ] **Step 2: Run registry tests and verify failure**

Run:

```bash
pnpm test test/ai/tools/tool-registry.test.ts test/ai/tools/builtin-index.test.ts
```

Expected: failure because `webview` group and `operate_webpage` do not exist yet.

- [ ] **Step 3: Update registry types and tool definitions**

In `shared/ai/tools/toolRegistry.ts`, change:

```ts
export type ToolRuntimeGroup = 'read' | 'file' | 'settings' | 'drawing' | 'resource';
```

to:

```ts
export type ToolRuntimeGroup = 'read' | 'file' | 'settings' | 'drawing' | 'resource' | 'webview';
```

Add:

```ts
/** 操作当前网页工具名称。 */
export const OPERATE_WEBPAGE_TOOL_NAME = 'operate_webpage';
```

Add action schema constants near other schema helpers:

```ts
/** 网页操作动作参数 Schema。 */
const WEBPAGE_OPERATION_ACTION_SCHEMA: ToolJsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['click'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的元素索引。' }
      },
      required: ['type', 'index'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['input'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的输入元素索引。' },
        text: { type: 'string', description: '要输入的文本。' },
        clear: { type: 'boolean', description: '是否先清空原内容，默认 true。' }
      },
      required: ['type', 'index', 'text'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['select'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的 select 元素索引。' },
        optionText: { type: 'string', description: '要选择的 option 可见文本。存在多个同名 option 时工具会返回歧义错误。' }
      },
      required: ['type', 'index', 'optionText'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['scroll'] },
        index: { type: 'number', description: '可选，来自 read_current_webpage 最新 snapshot 的元素索引；提供时滚动其可滚动祖先。' },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        pixels: { type: 'number', minimum: 1, maximum: 5000 }
      },
      required: ['type', 'direction'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['wait'] },
        seconds: { type: 'number', minimum: 0.1, maximum: 5 }
      },
      required: ['type'],
      additionalProperties: false
    }
  ]
};
```

Change `read_current_webpage` registry entry:

```ts
runtime: 'main',
group: 'webview',
exposure: 'conditional-readonly',
definition: {
  name: READ_CURRENT_WEBPAGE_TOOL_NAME,
  description: '读取当前内置 WebView 页面的标题、URL、可见文本、选中文本、标题结构、链接摘要、滚动状态和可操作元素索引。需要操作网页前必须先调用此工具获取 snapshotId 和元素 index。',
  source: 'builtin',
  riskLevel: 'read',
  requiresActiveDocument: false,
  permissionCategory: 'system',
  parameters: { type: 'object', properties: {}, additionalProperties: false }
}
```

Add `operate_webpage` registry entry:

```ts
{
  runtime: 'main',
  group: 'webview',
  exposure: 'conditional-writable',
  definition: {
    name: OPERATE_WEBPAGE_TOOL_NAME,
    description:
      '操作当前激活 WebView 页面。必须先调用 read_current_webpage，并使用它返回的 snapshotId；点击、输入、选择和元素滚动还要使用元素 index。支持 click、input、select、scroll、navigate、wait；打开或切换当前网页请使用 navigate；不接受 CSS selector 或任意 JavaScript。',
    source: 'builtin',
    riskLevel: 'write',
    requiresActiveDocument: false,
    permissionCategory: 'system',
    safeAutoApprove: false,
    parameters: {
      type: 'object',
      properties: {
        snapshotId: { type: 'string', description: 'read_current_webpage 返回的 snapshotId。' },
        action: WEBPAGE_OPERATION_ACTION_SCHEMA
      },
      required: ['snapshotId', 'action'],
      additionalProperties: false
    }
  }
}
```

- [ ] **Step 4: Update renderer schema-only exports**

In `src/ai/tools/catalog/runtimeTools.ts`, import and export `OPERATE_WEBPAGE_TOOL_NAME`, then add:

```ts
/** 创建 operate_webpage schema-only 工具。 */
export const createOperateWebpageTool = getRuntimeToolFactory(OPERATE_WEBPAGE_TOOL_NAME);
```

In `src/ai/tools/builtin/index.ts`, import `createOperateWebpageTool`, export `OPERATE_WEBPAGE_TOOL_NAME`, and include WebView schema-only tools in the returned tool lists even though they are conditional. Add `createOperateWebpageTool()` to the migrated write tools list.

- [ ] **Step 5: Run tests and verify pass**

Run:

```bash
pnpm test test/ai/tools/tool-registry.test.ts test/ai/tools/builtin-index.test.ts
```

Expected: pass.

---

### Task 2: Main-Process WebviewTool

**Files:**
- Modify: `electron/main/modules/chat/runtime/tools/constants.mts`
- Modify: `electron/main/modules/chat/runtime/tools/index.mts`
- Modify: `electron/main/modules/chat/runtime/tools/types.mts`
- Create: `electron/main/modules/chat/runtime/tools/WebviewTool/index.mts`
- Modify: `electron/main/modules/chat/runtime/tools/ReadTool/index.mts`
- Test: `test/electron/main/modules/chat/runtime/main-tools.test.ts`

- [ ] **Step 1: Write main tool routing tests**

Add tests to `test/electron/main/modules/chat/runtime/main-tools.test.ts`:

```ts
it('routes read_current_webpage through WebviewTool bridge', async (): Promise<void> => {
  const bridgeRequests: MainToolBridgeRequest[] = [];
  const executeMainTool = createMainToolExecutor({
    ...createMainToolDependencies(bridgeRequests),
    async requestBridge(input: MainToolBridgeRequest) {
      bridgeRequests.push(input);
      return {
        status: 'success',
        data: {
          url: 'https://example.com',
          title: 'Example',
          text: 'Hello',
          selectedText: '',
          headings: [],
          links: [],
          capturedAt: 1,
          truncated: {},
          snapshotId: 'snap-1',
          loading: false,
          scroll: { x: 0, y: 0, viewportWidth: 800, viewportHeight: 600, scrollWidth: 800, scrollHeight: 1200, atTop: true, atBottom: false },
          elements: []
        }
      };
    }
  });

  const result = await executeMainTool({ runtime, toolCallId: 'tool-call-web-1', toolName: 'read_current_webpage', input: {} });

  expect(result.status).toBe('success');
  expect(result.toolName).toBe('read_current_webpage');
  expect(result.data).toMatchObject({ snapshotId: 'snap-1', title: 'Example' });
  expect(bridgeRequests).toEqual([{ runtimeId: 'runtime-1', toolCallId: 'tool-call-web-1', kind: 'webview-snapshot', payload: {} }]);
});

it('confirms operate_webpage before requesting renderer operation', async (): Promise<void> => {
  const bridgeRequests: MainToolBridgeRequest[] = [];
  const requestConfirmation = vi.fn(async () => ({ approved: true }));
  const executeMainTool = createMainToolExecutor({
    now: () => '2026-06-22T00:00:00.000Z',
    requestConfirmation,
    async requestBridge(input: MainToolBridgeRequest) {
      bridgeRequests.push(input);
      return {
        status: 'success',
        data: {
          ok: true,
          action: 'click',
          target: { index: 2, label: 'Search', tagName: 'BUTTON' },
          message: '已点击 Search',
          navigationStarted: false,
          pageChanged: true,
          shouldReadAgain: true
        }
      };
    }
  });

  const input = { snapshotId: 'snap-1', action: { type: 'click', index: 2 } };
  const result = await executeMainTool({ runtime, toolCallId: 'tool-call-web-2', toolName: 'operate_webpage', input });

  expect(result.status).toBe('success');
  expect(requestConfirmation).toHaveBeenCalledTimes(1);
  expect(bridgeRequests).toEqual([{ runtimeId: 'runtime-1', toolCallId: 'tool-call-web-2', kind: 'webview-operate', payload: input }]);
});
```

- [ ] **Step 2: Run main tool tests and verify failure**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/main-tools.test.ts
```

Expected: failure because WebviewTool is not implemented.

- [ ] **Step 3: Update constants and remove read WebView handling from ReadTool**

In `electron/main/modules/chat/runtime/tools/constants.mts`, export `OPERATE_WEBPAGE_TOOL_NAME`, add:

```ts
/** 主进程 WebView 工具名称集合。 */
export const WEBVIEW_TOOL_NAMES = new Set(getToolNamesByRuntimeGroup('main', 'webview'));
```

Add `...WEBVIEW_TOOL_NAMES` to `MAIN_PROCESS_TOOL_NAMES`.

In `electron/main/modules/chat/runtime/tools/ReadTool/index.mts`, remove the `READ_CURRENT_WEBPAGE_TOOL_NAME` branch and related guard import if unused.

- [ ] **Step 4: Add WebviewTool implementation**

Create `electron/main/modules/chat/runtime/tools/WebviewTool/index.mts`:

```ts
/**
 * @file index.mts
 * @description ChatRuntime 主进程 WebView 工具。
 */
import type { AIToolExecutionResult } from 'types/ai';
import type { ChatRuntimeMainToolExecutionInput } from '../../types.mjs';
import type { MainToolsDependencies } from '../types.mjs';
import { OPERATE_WEBPAGE_TOOL_NAME, READ_CURRENT_WEBPAGE_TOOL_NAME, WEBVIEW_TOOL_NAMES } from '../constants.mjs';
import { createBridgeFailureResult, createMainToolCancelledResult, createMainToolFailureResult, createMainToolSuccessResult } from '../results.mjs';

/**
 * 判断工具是否属于 WebView 工具模块。
 * @param toolName - 工具名称
 * @returns 是否为 WebView 工具
 */
export function isWebviewTool(toolName: string): boolean {
  return WEBVIEW_TOOL_NAMES.has(toolName);
}

/**
 * 创建 WebView 操作确认描述。
 * @param input - 工具输入
 * @returns 确认描述
 */
function createOperateConfirmationDescription(input: unknown): string {
  if (!input || typeof input !== 'object') return '操作当前网页。';
  const action = (input as { action?: { type?: unknown; index?: unknown; text?: unknown; optionText?: unknown; direction?: unknown } }).action;
  if (!action || typeof action.type !== 'string') return '操作当前网页。';
  if (action.type === 'click') return `点击当前网页元素 #${String(action.index ?? '')}`;
  if (action.type === 'input') return `向当前网页元素 #${String(action.index ?? '')} 输入文本：${String(action.text ?? '')}`;
  if (action.type === 'select') return `在当前网页元素 #${String(action.index ?? '')} 选择：${String(action.optionText ?? '')}`;
  if (action.type === 'scroll') return `滚动当前网页：${String(action.direction ?? '')}`;
  if (action.type === 'wait') return '等待当前网页状态更新。';
  return '操作当前网页。';
}

/**
 * 执行 WebView 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
export async function executeWebviewTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  if (input.toolName === READ_CURRENT_WEBPAGE_TOOL_NAME) {
    const bridgeResult = await deps.requestBridge({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      kind: 'webview-snapshot',
      payload: input.input
    });
    if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
    return createMainToolSuccessResult(READ_CURRENT_WEBPAGE_TOOL_NAME, bridgeResult.data);
  }

  if (input.toolName === OPERATE_WEBPAGE_TOOL_NAME) {
    const decision = await deps.requestConfirmation({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      request: {
        toolCallId: input.toolCallId,
        toolName: OPERATE_WEBPAGE_TOOL_NAME,
        title: '操作当前网页',
        description: createOperateConfirmationDescription(input.input),
        riskLevel: 'write',
        allowRemember: false
      }
    });
    if (!decision.approved) return createMainToolCancelledResult(OPERATE_WEBPAGE_TOOL_NAME);

    const bridgeResult = await deps.requestBridge({
      runtimeId: input.runtime.runtimeId,
      toolCallId: input.toolCallId,
      kind: 'webview-operate',
      payload: input.input
    });
    if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
    return createMainToolSuccessResult(OPERATE_WEBPAGE_TOOL_NAME, bridgeResult.data);
  }

  return createMainToolFailureResult(input.toolName, 'TOOL_NOT_FOUND', `Unsupported WebView tool: ${input.toolName}`);
}
```

- [ ] **Step 5: Route WebviewTool**

In `electron/main/modules/chat/runtime/tools/index.mts`, import and route:

```ts
import { executeWebviewTool, isWebviewTool } from './WebviewTool/index.mjs';

if (isWebviewTool(input.toolName)) return executeWebviewTool(input, deps);
```

- [ ] **Step 6: Run main tool tests**

Run:

```bash
pnpm test test/electron/main/modules/chat/runtime/main-tools.test.ts
```

Expected: pass.

---

### Task 3: Renderer Context And Bridge

**Files:**
- Modify: `src/ai/tools/context/webview.ts`
- Modify: `src/components/BChat/utils/runtimeBridge.ts`
- Test: `test/components/BChat/runtime-bridge.test.ts`

- [ ] **Step 1: Write bridge tests**

Add tests to `test/components/BChat/runtime-bridge.test.ts` for:

```ts
it('dispatches webview-operate to the active WebView context', async (): Promise<void> => {
  const operatePage = vi.fn(async () => ({
    ok: true,
    action: 'click',
    target: { index: 1, label: 'Search', tagName: 'BUTTON' },
    message: 'clicked',
    navigationStarted: false,
    pageChanged: true,
    shouldReadAgain: true
  }));
  const result = await handleBChatRuntimeBridgeRequest(
    {
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      requestId: 'bridge-1',
      kind: 'webview-operate',
      payload: { snapshotId: 'snap-1', action: { type: 'click', index: 1 } }
    },
    createDependencies({ getWebviewContext: () => ({ readPageSnapshot: vi.fn(), operatePage }) })
  );

  expect(result).toMatchObject({ ok: true, action: 'click' });
  expect(operatePage).toHaveBeenCalledWith({ snapshotId: 'snap-1', action: { type: 'click', index: 1 } });
});
```

Use the local dependency helper style already present in that test file; if it lacks a helper, add a focused one with all required dependency functions.

- [ ] **Step 2: Run bridge tests and verify failure**

Run:

```bash
pnpm test test/components/BChat/runtime-bridge.test.ts
```

Expected: failure because `operatePage` and bridge kind do not exist.

- [ ] **Step 3: Extend WebView context types**

In `src/ai/tools/context/webview.ts`, add serializable types:

```ts
export type WebviewAgentElementAction = 'click' | 'input' | 'select' | 'scroll';
export type WebviewOperateAction =
  | { type: 'click'; index: number }
  | { type: 'input'; index: number; text: string; clear?: boolean }
  | { type: 'select'; index: number; optionText: string }
  | { type: 'scroll'; index?: number; direction: 'up' | 'down' | 'left' | 'right'; pixels?: number }
  | { type: 'wait'; seconds?: number };

export interface WebviewOperateInput {
  snapshotId: string;
  action: WebviewOperateAction;
}

export interface WebviewOperateResult {
  ok: boolean;
  action: WebviewOperateAction['type'];
  target: { index: number; label: string; tagName: string } | null;
  message: string;
  navigationStarted: boolean;
  pageChanged: boolean;
  shouldReadAgain: boolean;
}
```

Extend `WebviewPageSnapshot` with `snapshotId`, `loading`, `scroll`, and `elements`. Extend `WebviewToolContext`:

```ts
operatePage(input: WebviewOperateInput): Promise<WebviewOperateResult>;
```

- [ ] **Step 4: Add runtimeBridge handler**

In `src/components/BChat/utils/runtimeBridge.ts`, add:

```ts
if (event.kind === 'webview-operate') {
  const context = dependencies.getWebviewContext();
  if (!context) {
    throw createBridgeError('EDITOR_UNAVAILABLE', '当前没有可操作的网页');
  }
  return context.operatePage(event.payload as WebviewOperateInput);
}
```

Import `WebviewOperateInput` from `@/ai/tools/context/webview`.

- [ ] **Step 5: Run bridge tests**

Run:

```bash
pnpm test test/components/BChat/runtime-bridge.test.ts
```

Expected: pass.

---

### Task 4: WebView Snapshot Upgrade

**Files:**
- Modify: `src/views/webview/web/hooks/useWebView.ts`
- Test: `test/views/webview/web-use-webview.test.ts`

- [ ] **Step 1: Write snapshot tests**

Add tests that exercise exported helpers where possible:

```ts
it('normalizes webpage agent snapshot fields', async (): Promise<void> => {
  const snapshot = normalizeWebviewPageSnapshot({
    url: 'https://example.com',
    title: 'Example',
    text: 'Hello',
    selectedText: '',
    headings: [],
    links: [],
    snapshotId: 'snap-1',
    loading: false,
    scroll: { x: 0, y: 0, viewportWidth: 800, viewportHeight: 600, scrollWidth: 800, scrollHeight: 1200, atTop: true, atBottom: false },
    elements: [
      { index: 1, tagName: 'BUTTON', text: 'Search', label: 'Search', disabled: false, isNew: true, actions: ['click'] }
    ]
  });

  expect(snapshot.snapshotId).toBe('snap-1');
  expect(snapshot.elements[0]).toMatchObject({ index: 1, label: 'Search', actions: ['click'] });
});
```

If `normalizeWebviewPageSnapshot` remains typed around raw page script output, update the test to call the new raw type.

- [ ] **Step 2: Run WebView hook tests and verify failure**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: failure because snapshot fields do not exist.

- [ ] **Step 3: Add snapshot constants and types**

In `src/views/webview/web/hooks/useWebView.ts`, add:

```ts
const WEBVIEW_AGENT_ELEMENT_LIMIT = 180;
const WEBVIEW_AGENT_SNAPSHOT_TTL_MS = 60_000;
const WEBVIEW_AGENT_SCRIPT_TIMEOUT_MS = 10_000;
```

Track snapshot cache inside `useWebView()`:

```ts
let activeSnapshot: { id: string; url: string; capturedAtMs: number } | null = null;
```

Use `performance.now()` for renderer-local TTL.

- [ ] **Step 4: Upgrade page snapshot script**

Extend `createPageSnapshotScript()` so returned object includes:

```ts
snapshotId: '',
loading: document.readyState === 'loading',
scroll: {
  x: window.scrollX || document.documentElement.scrollLeft || 0,
  y: window.scrollY || document.documentElement.scrollTop || 0,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
  scrollHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
  atTop: (window.scrollY || document.documentElement.scrollTop || 0) <= 0,
  atBottom: (window.scrollY || document.documentElement.scrollTop || 0) + window.innerHeight >= Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) - 2
},
elements: collectInteractiveElements()
```

Implement `collectInteractiveElements()` inside the injected script with these rules:

- Use selectors: `button,a[href],input,textarea,select,summary,[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[tabindex]`.
- Filter invisible elements by rect size and computed style.
- Assign indexes from 1.
- Set `actions` from tag and type.
- Do not include hidden inputs or password value.

- [ ] **Step 5: Normalize snapshot and assign snapshotId**

In `readPageSnapshot()` after raw script result validates:

```ts
const snapshotId = `webview-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalized = normalizeWebviewPageSnapshot({ ...value, snapshotId });
activeSnapshot = { id: snapshotId, url: normalized.url, capturedAtMs: performance.now() };
return normalized;
```

Use an exported helper for action/element normalization so tests can cover it without a real WebView.

- [ ] **Step 6: Clear snapshot on navigation start**

In `handleDidStartLoading()`, add:

```ts
activeSnapshot = null;
```

- [ ] **Step 7: Run WebView hook tests**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: pass.

---

### Task 5: WebView Operate Implementation

**Files:**
- Modify: `src/views/webview/web/hooks/useWebView.ts`
- Test: `test/views/webview/web-use-webview.test.ts`

- [ ] **Step 1: Write operation tests**

Add tests for pure validation helpers:

```ts
it('rejects stale webpage snapshots before operation', async (): Promise<void> => {
  expect(() => assertWebviewSnapshotActive(null, 'snap-1')).toThrow('STALE_SNAPSHOT');
});

it('rejects ambiguous select option labels', (): void => {
  const result = normalizeWebviewOperationError(new Error('OPTION_AMBIGUOUS'));
  expect(result.code).toBe('OPTION_AMBIGUOUS');
});
```

If helper names differ during implementation, keep the tested behavior: stale snapshot and ambiguous select errors must be stable and serializable.

- [ ] **Step 2: Run WebView hook tests and verify failure**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: failure because operation helpers do not exist.

- [ ] **Step 3: Add operation timeout helper**

In `useWebView.ts`, add:

```ts
function withWebviewOperationTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('BRIDGE_TIMEOUT')), WEBVIEW_AGENT_SCRIPT_TIMEOUT_MS);
    promise.then(resolve).catch(reject).finally(() => globalThis.clearTimeout(timer));
  });
}
```

- [ ] **Step 4: Add operation script builder**

Add `createPageOperationScript(input: WebviewOperateInput): string`. The script should:

- Check `document.readyState`.
- Recompute interactive elements using the same selector rules as snapshot.
- Find the requested index.
- Validate action support.
- Execute the requested action.
- Return:

```ts
{
  ok: true,
  action: input.action.type,
  target: target ? { index, label, tagName } : null,
  message,
  navigationStarted: document.readyState === 'loading',
  pageChanged: input.action.type !== 'wait',
  shouldReadAgain: input.action.type !== 'wait' || document.readyState === 'loading'
}
```

For select action, if multiple options match, throw an error object/message containing `OPTION_AMBIGUOUS`.

For indexed scroll, if no scrollable ancestor is found, throw `SCROLL_TARGET_NOT_FOUND`.

- [ ] **Step 5: Implement operatePage**

Inside `useWebView()` return object, add:

```ts
async function operatePage(input: WebviewOperateInput): Promise<WebviewOperateResult> {
  const instance = webviewRef.value;
  if (!instance || typeof instance.executeJavaScript !== 'function') {
    throw new Error('当前页面尚未准备好操作，请稍后重试');
  }
  if (!activeSnapshot || activeSnapshot.id !== input.snapshotId || performance.now() - activeSnapshot.capturedAtMs > WEBVIEW_AGENT_SNAPSHOT_TTL_MS) {
    throw new Error('STALE_SNAPSHOT');
  }
  if (state.value.isLoading && input.action.type !== 'wait') {
    throw new Error('PAGE_LOADING');
  }
  const rawResult = instance.executeJavaScript(createPageOperationScript(input)) as Promise<unknown>;
  const result = await withWebviewOperationTimeout(rawResult);
  if (!isWebviewOperateResult(result)) {
    throw new Error('页面操作结果格式无效');
  }
  return result;
}
```

Also ensure current URL still equals `activeSnapshot.url` before executing, or inside the injected script by returning/throwing `STALE_SNAPSHOT` if `location.href` changed.

- [ ] **Step 6: Export operatePage through context registration**

In `src/views/webview/web/index.vue`, change registration to:

```ts
webviewToolContextRegistry.register(routeFullPath, {
  readPageSnapshot: webview.readPageSnapshot,
  operatePage: webview.operatePage
});
```

- [ ] **Step 7: Run WebView tests**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: pass.

---

### Task 6: Dynamic Tool Filtering

**Files:**
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts`
- Test: existing BChat runtime tools test or new `test/components/BChat/use-runtime-tools.test.ts`

- [ ] **Step 1: Write dynamic filtering test**

If no existing test covers `useRuntimeTools`, add a focused test that mocks `webviewToolContextRegistry.getCurrentContext()`:

```ts
it('hides WebView tools without an active WebView and exposes them with one', (): void => {
  vi.mocked(webviewToolContextRegistry.getCurrentContext).mockReturnValue(undefined);
  expect(getActiveToolNames()).not.toContain('read_current_webpage');
  expect(getActiveToolNames()).not.toContain('operate_webpage');

  vi.mocked(webviewToolContextRegistry.getCurrentContext).mockReturnValue({ readPageSnapshot: vi.fn(), operatePage: vi.fn() });
  expect(getActiveToolNames()).toEqual(expect.arrayContaining(['read_current_webpage', 'operate_webpage']));
});
```

Use the local mount/composable setup style in existing BChat tests.

- [ ] **Step 2: Run BChat tests and verify failure**

Run:

```bash
pnpm test test/components/BChat
```

Expected: failure if filtering is not updated.

- [ ] **Step 3: Update filtering**

In `src/components/BChat/hooks/useRuntimeTools.ts`, import `OPERATE_WEBPAGE_TOOL_NAME`, then update:

```ts
if (tool.definition.name === READ_CURRENT_WEBPAGE_TOOL_NAME && !hasActiveWebview) return false;
if (tool.definition.name === OPERATE_WEBPAGE_TOOL_NAME && !hasActiveWebview) return false;
```

- [ ] **Step 4: Run BChat tests**

Run:

```bash
pnpm test test/components/BChat
```

Expected: pass.

---

### Task 7: Changelog And Verification

**Files:**
- Modify or create: `changelog/2026-06-22.md`

- [ ] **Step 1: Update changelog**

Add:

```markdown
## Added
- 新增 ChatRuntime WebView 页面操作工具设计与实现，支持在激活 WebView 中读取可操作元素索引并执行点击、输入、选择、滚动、导航和等待。
```

If `## Added` already exists, append only the bullet.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/ai/tools/tool-registry.test.ts test/ai/tools/builtin-index.test.ts test/electron/main/modules/chat/runtime/main-tools.test.ts test/components/BChat/runtime-bridge.test.ts test/views/webview/web-use-webview.test.ts
```

Expected: pass.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: pass, or only known pre-existing failures unrelated to touched files. Any failure in touched files must be fixed.

- [ ] **Step 4: Run lint on touched source**

Run:

```bash
pnpm exec eslint src/views/webview/web/hooks/useWebView.ts src/views/webview/web/index.vue src/ai/tools/context/webview.ts src/components/BChat/hooks/useRuntimeTools.ts src/components/BChat/utils/runtimeBridge.ts src/ai/tools/builtin/index.ts src/ai/tools/catalog/runtimeTools.ts shared/ai/tools/toolRegistry.ts --ext .ts,.vue
```

Expected: pass.

- [ ] **Step 5: Inspect final diff without staging**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes are limited to the planned files plus tests, changelog, spec, and plan. Do not stage or commit.

---

## Self-Review

- Spec coverage: the plan covers no MCP, no setting switch, `read_current_webpage` as the only observation tool, `operate_webpage` as the only action tool, dynamic exposure by active WebView, snapshot TTL, bridge timeout, navigation race checks, option ambiguity, scroll target behavior, and testing.
- Placeholder scan: this plan contains no `TBD`, `TODO`, or unspecified “fill in” tasks.
- Type consistency: the plan consistently uses `snapshotId`, `operatePage`, `WebviewOperateInput`, `WebviewOperateResult`, `OPERATE_WEBPAGE_TOOL_NAME`, `webview-snapshot`, and `webview-operate`.
