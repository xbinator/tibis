# Widget Editor AI Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add page-scoped `get_widget` and structured-Patch `edit_widget` tools that exist only while the Widget editor page is active.

**Architecture:** `src/views/widget/index.vue` owns a WebView-style context registry entry whose registration and current state are separate. `get_widget` reads a deep-cloned live session snapshot; `edit_widget` validates Patch structure, obtains permission, reapplies the Patch to the latest snapshot, strictly validates the resulting WidgetData, and atomically replaces the page value. Runtime tool discovery appends the tools only when the registry has a current context, and ChatRuntime binds renderer executor snapshots to the runtime request by `runtimeId`.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Pinia tool permissions, lodash-es, Vitest, Vue Test Utils.

**Execution note:** The user explicitly authorized development on `main` and requested no `git add` or `git commit`; commit steps are intentionally omitted.

> **Current ownership detail:** `src/views/widget/index.vue` 管理 Widget 工具上下文的注册、激活、快照和销毁；BWidget 仅暴露普通的 `replaceDocumentValue` 画布事务。

---

## File Map

- Create `src/components/BWidget/utils/widgetDataValidation.ts`: strict, non-normalizing WidgetData validator.
- Create `src/ai/tools/builtin/WidgetTool/patch.ts`: safe structured Patch parsing and application.
- Create `src/ai/tools/context/widget.ts`: Widget context types and register/current lifecycle registry.
- Modify `src/ai/tools/permission.ts`: preserve explicit operation error codes through permission lifecycle.
- Modify `src/ai/tools/builtin/WidgetTool/index.ts`: add `get_widget` and `edit_widget` executors.
- Modify `src/ai/tools/builtin/index.ts`: export names and add conditional read/write whitelist entries.
- Modify `src/components/BChat/hooks/useRuntimeTools.ts`: dynamically create page tools from the current Widget context.
- Modify `src/components/BChat/hooks/useChatRuntime.ts`: bind the renderer executor snapshot used for a request to its returned `runtimeId`.
- Modify `src/components/BChat/index.vue`: include current Widget editor tools only in the transport schemas.
- Modify `src/components/BWidget/index.vue`: expose the document replacement transaction whose element-tree replacement enters board history.
- Modify `src/components/BWidget/hooks/useWidgetBoard.ts`: expose the board element replacement operation.
- Modify `src/components/BWidget/utils/boardTransforms.ts`: replace board elements as one history change.
- Modify `src/views/widget/index.vue`: own Widget tool-context registration, activation, snapshots and document replacement delegation.
- Create `test/components/BWidget/widget-data-validation.test.ts`: validator behavior.
- Create `test/ai/tools/builtin-widget-patch.test.ts`: Patch behavior and safety.
- Create `test/ai/tools/context-widget.test.ts`: registry lifecycle.
- Create `test/ai/tools/permission.test.ts`: explicit error-code preservation.
- Modify `test/ai/tools/builtin-widget-tool.test.ts`: page tool behavior and permission flow.
- Modify `test/ai/tools/builtin-index.test.ts`: conditional whitelist behavior.
- Modify `test/components/BChat/use-runtime-tools.test.ts`: dynamic page-tool exposure.
- Modify `test/components/BChat/use-chat-runtime.test.ts`: runtime executor snapshot binding and terminal-request behavior.
- Modify `test/components/BWidget/board-transforms.test.ts`: element replacement history behavior.
- Modify `test/electron/main/modules/chat/runtime/service.test.ts`: main-process renderer context propagation.
- Modify `test/views/widget/index.test.ts`: page context lifecycle and live snapshot behavior.
- Modify `changelog/2026-07-10.md`: feature entry.

### Task 1: Strict WidgetData Validation

**Files:**
- Create: `test/components/BWidget/widget-data-validation.test.ts`
- Create: `src/components/BWidget/utils/widgetDataValidation.ts`

- [x] **Step 1: Write failing validator tests**

Cover a default WidgetData success case, invalid schema path, duplicate nested element IDs, invalid loop values, non-plain metadata, and unexpected root fields. The intended API is:

```ts
const result = validateWidgetData(value)
expect(result).toEqual({ valid: false, path: ['elements', 1, 'id'], message: expect.any(String) })
```

- [x] **Step 2: Run validator tests and verify RED**

Run: `pnpm test test/components/BWidget/widget-data-validation.test.ts`

Expected: FAIL because `widgetDataValidation.ts` does not exist.

- [x] **Step 3: Implement the strict validator**

Export these types and function:

```ts
export interface WidgetDataValidationFailure {
  valid: false
  path: Array<string | number>
  message: string
}

export type WidgetDataValidationResult = { valid: true } | WidgetDataValidationFailure

export function validateWidgetData(value: unknown): WidgetDataValidationResult
```

Use `isPlainObject`. Recursively validate exact schema fields and element style value types, plus the exact eight root keys, execute fields, plain metadata objects, finite geometry, complete loop fields, recursive children, and globally unique element IDs. Return the first failing path without modifying the input.

- [x] **Step 4: Run validator tests and verify GREEN**

Run: `pnpm test test/components/BWidget/widget-data-validation.test.ts`

Expected: PASS.

### Task 2: Structured Widget Patch

**Files:**
- Create: `test/ai/tools/builtin-widget-patch.test.ts`
- Create: `src/ai/tools/builtin/WidgetTool/patch.ts`

- [x] **Step 1: Write failing Patch tests**

Test nested object set, array append, array delete using splice, nested delete, original-value immutability, prototype-pollution rejection, unknown root rejection, missing parent rejection, out-of-range array rejection, required-root deletion rejection, and strict WidgetData validation failure.

```ts
const next = applyWidgetDocumentPatches(current, [
  { op: 'set', path: ['elements', 0, 'style', 'color'], value: '#111827' }
])
expect(next.elements[0].style.color).toBe('#111827')
expect(current.elements[0].style.color).toBeUndefined()
```

- [x] **Step 2: Run Patch tests and verify RED**

Run: `pnpm test test/ai/tools/builtin-widget-patch.test.ts`

Expected: FAIL because the Patch module does not exist.

- [x] **Step 3: Implement Patch parsing and atomic application**

Export the Patch union, validation result, parser, error, and applicator:

```ts
export type WidgetDocumentPathSegment = string | number
export type WidgetDocumentPatch =
  | { op: 'set'; path: WidgetDocumentPathSegment[]; value: unknown }
  | { op: 'delete'; path: WidgetDocumentPathSegment[] }

export class WidgetDocumentPatchError extends Error {}

export function validateWidgetDocumentPatches(value: unknown):
  | { valid: true; patches: WidgetDocumentPatch[] }
  | { valid: false; message: string }

export function applyWidgetDocumentPatches(value: WidgetData, patches: WidgetDocumentPatch[]): WidgetData
```

Allow 1-100 operations. Reject unsafe string segments (`__proto__`, `prototype`, `constructor`), enforce known root keys, require all parent containers, allow array set only at `0..length`, splice array deletes, and prohibit root deletes. Apply to `cloneDeep(value)`, then call `validateWidgetData`; throw `WidgetDocumentPatchError` on any failure before returning the clone.

- [x] **Step 4: Run Patch tests and verify GREEN**

Run: `pnpm test test/ai/tools/builtin-widget-patch.test.ts`

Expected: PASS.

### Task 3: Widget Context Registry and Page Lifecycle

**Files:**
- Create: `test/ai/tools/context-widget.test.ts`
- Create: `src/ai/tools/context/widget.ts`
- Modify: `test/views/widget/index.test.ts`
- Modify: `src/views/widget/index.vue`

- [x] **Step 1: Write failing registry tests**

Use two contexts to prove registration does not select, `setCurrent` selects only a registered ID, `clearCurrent` is ID-sensitive, unregistering current clears it, and removing one context never falls back to another.

```ts
registry.register('widget-a', contextA)
registry.register('widget-b', contextB)
registry.setCurrent('widget-b')
registry.unregister('widget-b')
expect(registry.getCurrentContext()).toBeUndefined()
```

- [x] **Step 2: Run registry tests and verify RED**

Run: `pnpm test test/ai/tools/context-widget.test.ts`

Expected: FAIL because `context/widget.ts` does not exist.

- [x] **Step 3: Implement context types and registry**

```ts
export interface WidgetDocumentSnapshot {
  file: { id: string; name: string; ext: string; path: string | null; title: string }
  value: WidgetData
}

export interface WidgetToolContext {
  id: string
  getSnapshot: () => WidgetDocumentSnapshot
  replaceValue: (value: WidgetData) => Promise<void> | void
}

export interface WidgetToolContextRegistry {
  register(id: string, context: WidgetToolContext): void
  unregister(id: string): void
  setCurrent(id: string): void
  clearCurrent(id: string): void
  getCurrentContext(): WidgetToolContext | undefined
}
```

Implement `createWidgetToolContextRegistry()` with a Map and nullable current ID, then export the singleton.

- [x] **Step 4: Run registry tests and verify GREEN**

Run: `pnpm test test/ai/tools/context-widget.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing Widget page lifecycle tests**

Mock `widgetToolContextRegistry` and assert setup calls `register`; only mounted、activated、session ready 同时成立时调用 `setCurrent`；context snapshots deep-clone current session state；`replaceValue` 通过 BWidget 事务更新 `session.data.value`；unmount 调用 `unregister`。

- [x] **Step 6: Run page tests and verify RED**

Run: `pnpm test test/views/widget/index.test.ts`

Expected: FAIL because the page does not use the Widget context registry.

- [x] **Step 7: Wire the Widget page lifecycle**

页面创建稳定 context 并注册；页面以 `isActive && isPageMounted && isWidgetSessionLoaded` 作为激活条件，其中 `isWidgetSessionLoaded` 由首次 `fileState` 替换得到；deactivated 清理 current，unmount 注销。`getSnapshot` 使用 `cloneDeep`；`replaceValue` 调用 BWidget 暴露的 `replaceDocumentValue`。

- [x] **Step 8: Run page tests and verify GREEN**

Run: `pnpm test test/views/widget/index.test.ts`

Expected: PASS.

### Task 4: Page-Scoped Tool Executors and Permission Errors

**Files:**
- Create: `test/ai/tools/permission.test.ts`
- Modify: `src/ai/tools/permission.ts`
- Modify: `test/ai/tools/builtin-widget-tool.test.ts`
- Modify: `src/ai/tools/builtin/WidgetTool/index.ts`

- [x] **Step 1: Write a failing explicit permission-error test**

```ts
const result = await executeWithPermission({
  definition,
  adapter,
  request,
  operation: async () => {
    throw new AIToolOperationError('STALE_CONTEXT', 'Widget 页面已切换')
  }
})
expect(result).toMatchObject({ status: 'failure', error: { code: 'STALE_CONTEXT' } })
```

- [x] **Step 2: Run permission tests and verify RED**

Run: `pnpm test test/ai/tools/permission.test.ts`

Expected: FAIL because `AIToolOperationError` is not exported and errors are mapped to `EXECUTION_FAILED`.

- [x] **Step 3: Preserve explicit operation error codes**

Add:

```ts
export class AIToolOperationError extends Error {
  readonly code: AIToolExecutionError['code']

  constructor(code: AIToolExecutionError['code'], message: string) {
    super(message)
    this.name = 'AIToolOperationError'
    this.code = code
  }
}
```

Update `executeOperation` catch handling to use `error.code` only for this class and retain `EXECUTION_FAILED` for all other errors. Keep confirmation lifecycle callbacks reporting failure.

- [x] **Step 4: Run permission tests and verify GREEN**

Run: `pnpm test test/ai/tools/permission.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing `get_widget` and `edit_widget` tests**

Test definitions, deep-cloned reads, stale reads, invalid Patch rejection before confirmation, approved atomic writes, denied confirmation, readonly mode, strict validation failure, and context becoming stale while confirmation is pending. Also prove the operation rereads current data after confirmation.

- [x] **Step 6: Run Widget tool tests and verify RED**

Run: `pnpm test test/ai/tools/builtin-widget-tool.test.ts`

Expected: FAIL because the new exports do not exist.

- [x] **Step 7: Implement the page-scoped tools**

Add constants and creators:

```ts
export const GET_WIDGET_TOOL_NAME = 'get_widget'
export const EDIT_WIDGET_TOOL_NAME = 'edit_widget'

export function createGetWidgetTool(
  context: WidgetToolContext,
  options: { isCurrent: () => boolean }
): AIToolExecutor<Record<string, never>, WidgetDocumentSnapshot>

export function createEditWidgetTool(
  context: WidgetToolContext,
  options: { confirm: AIToolConfirmationAdapter; isCurrent: () => boolean }
): AIToolExecutor<EditWidgetInput, WidgetDocumentSnapshot>
```

`get_widget` returns `STALE_CONTEXT` unless `isCurrent()` and otherwise returns `cloneDeep(context.getSnapshot())`. `edit_widget` validates Patch structure before permission, uses `executeWithPermission`, rechecks `isCurrent()` inside the operation, rereads `context.getSnapshot()`, applies and validates Patch, then calls `replaceValue`. Convert stale and Patch errors to `AIToolOperationError` with `STALE_CONTEXT` or `INVALID_INPUT`.

- [x] **Step 8: Run Widget tool tests and verify GREEN**

Run: `pnpm test test/ai/tools/builtin-widget-tool.test.ts`

Expected: PASS.

### Task 5: Runtime Injection, Whitelists, and Documentation

**Files:**
- Modify: `test/ai/tools/builtin-index.test.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Modify: `test/components/BChat/use-runtime-tools.test.ts`
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts`
- Modify: `changelog/2026-07-10.md`

- [x] **Step 1: Write failing whitelist tests**

Assert `GET_WIDGET_TOOL_NAME` belongs to `CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES`, `EDIT_WIDGET_TOOL_NAME` belongs to `CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES`, both pass `isBuiltinToolName`, and neither appears in `createBuiltinTools()` without a page context.

- [x] **Step 2: Run whitelist tests and verify RED**

Run: `pnpm test test/ai/tools/builtin-index.test.ts`

Expected: FAIL because the names are not exported or whitelisted.

- [x] **Step 3: Update builtin exports and conditional lists**

Import/re-export both names, append `GET_WIDGET_TOOL_NAME` to conditional read-only names, and append `EDIT_WIDGET_TOOL_NAME` to conditional writable names without adding either creator to `createBuiltinTools()`.

- [x] **Step 4: Run whitelist tests and verify GREEN**

Run: `pnpm test test/ai/tools/builtin-index.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing Runtime injection tests**

Mock `widgetToolContextRegistry.getCurrentContext`, `createGetWidgetTool`, and `createEditWidgetTool`. Assert no page tools without current context; both exist with current context even when the global Widget store is empty; creators receive an identity-based `isCurrent` predicate; existing `widget/open_widget` exposure remains unchanged.

- [x] **Step 6: Run Runtime tests and verify RED**

Run: `pnpm test test/components/BChat/use-runtime-tools.test.ts`

Expected: FAIL because Runtime does not inspect the Widget editor context.

- [x] **Step 7: Add dynamic Runtime injection**

Read the current Widget context once per `getActiveTools()` call. When present, create both tools with `isCurrent: () => widgetToolContextRegistry.getCurrentContext() === capturedContext`; pass the existing confirmation adapter to `createEditWidgetTool`. Let the final builtin whitelist filter apply normally.

- [x] **Step 8: Run Runtime tests and verify GREEN**

Run: `pnpm test test/components/BChat/use-runtime-tools.test.ts`

Expected: PASS.

- [x] **Step 9: Update changelog**

Add an `## Added` section to `changelog/2026-07-10.md` when absent, with:

```md
- Widget 编辑页激活时动态提供 `get_widget` 与结构化 Patch `edit_widget` AI 工具，支持读取和安全编辑当前未保存会话。
```

- [x] **Step 10: Bind renderer tools to the runtime request**

Add failing tests that prove a tool-request uses the renderer executor snapshot captured when the runtime started, without adding a Widget ID to the ChatRuntime protocol.

### Task 6: Integrated Verification

**Files:** All files above.

- [x] **Step 1: Run focused feature tests**

Run:

```bash
pnpm test test/components/BWidget/widget-data-validation.test.ts test/ai/tools/builtin-widget-patch.test.ts test/ai/tools/context-widget.test.ts test/ai/tools/permission.test.ts test/ai/tools/builtin-widget-tool.test.ts test/ai/tools/builtin-index.test.ts test/components/BChat/use-runtime-tools.test.ts test/components/BChat/use-chat-runtime.test.ts test/views/widget/index.test.ts
```

Expected: all selected test files pass.

- [x] **Step 2: Run TypeScript checking**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0.

- [x] **Step 3: Run ESLint without auto-fixing unrelated files**

Run:

```bash
pnpm exec eslint src/ai/tools/context/widget.ts src/ai/tools/permission.ts src/ai/tools/builtin/WidgetTool/index.ts src/ai/tools/builtin/WidgetTool/patch.ts src/ai/tools/builtin/index.ts src/components/BWidget/utils/widgetDataValidation.ts src/components/BChat/hooks/useRuntimeTools.ts src/views/widget/index.vue test/ai/tools/context-widget.test.ts test/ai/tools/permission.test.ts test/ai/tools/builtin-widget-tool.test.ts test/ai/tools/builtin-widget-patch.test.ts test/ai/tools/builtin-index.test.ts test/components/BWidget/widget-data-validation.test.ts test/components/BChat/use-runtime-tools.test.ts test/views/widget/index.test.ts
```

Expected: exit code 0.

- [x] **Step 4: Run diff checks**

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 5: Review final diff against the specification**

Confirm page-only injection, current-context identity guards, non-normalizing validation, confirmation-time reread, no direct save, and no staged or committed files.
