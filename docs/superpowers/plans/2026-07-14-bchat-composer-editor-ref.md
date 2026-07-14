# BChat Composer Editor Ref Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `useChatComposer` receive `promptEditorRef` directly, remove page-level editor method adapters, and simplify pure `clearInput` forwarding.

**Architecture:** `src/components/BChat/index.vue` keeps ownership of the template ref and passes it into `useChatComposer`. `useChatComposer` owns the editor helper methods and continues to expose only the existing composer return API to the page.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Pinia-powered existing BChat hooks.

## Global Constraints

- Do not modify `src/components/BChat/components/MessageBubble.vue`.
- Do not run `git add`, `git commit`, or `git push`; the user will submit code themselves.
- Do not introduce `any`.
- Every new or changed function, interface, or non-trivial block must keep explicit types and useful comments.
- Component refs use `InstanceType<typeof ComponentName>`.
- Record code changes in `changelog/2026-07-14.md`.

---

## File Structure

- `test/components/BChat/chat-composer-boundary.test.ts` verifies the page/composer boundary shape from source contracts.
- `src/components/BChat/hooks/useChatComposer.ts` receives `promptEditorRef`, owns editor helper functions, and feeds lower hooks with minimal methods.
- `src/components/BChat/index.vue` removes the local editor adapter object, uses returned `focusInput`, and passes `inputEvents.clear` directly.
- `changelog/2026-07-14.md` records the refactor.

### Task 1: Boundary Contract Test

**Files:**
- Create: `test/components/BChat/chat-composer-boundary.test.ts`

**Interfaces:**
- Consumes: Current source files under `src/components/BChat/`.
- Produces: A failing test that describes the desired page/composer boundary.

- [ ] **Step 1: Write the failing test**

Create `test/components/BChat/chat-composer-boundary.test.ts`:

```ts
/**
 * @file chat-composer-boundary.test.ts
 * @description 校验 BChat 入口组件与 useChatComposer 的编辑器依赖边界。
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const chatSourcePath = 'src/components/BChat/index.vue';
const composerSourcePath = 'src/components/BChat/hooks/useChatComposer.ts';

/**
 * 读取仓库源码文本，便于约束组合层之间的依赖形状。
 * @param path - 仓库相对路径
 * @returns 源码文本
 */
async function readSource(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

describe('BChat composer boundary', (): void => {
  it('passes the prompt editor ref into the composer', async (): Promise<void> => {
    const chatSource = await readSource(chatSourcePath);
    const composerSource = await readSource(composerSourcePath);

    expect(chatSource).toContain('promptEditorRef,');
    expect(chatSource).not.toContain('editor: {');
    expect(composerSource).toContain('promptEditorRef: Ref<InstanceType<typeof BTextEditor> | undefined>;');
  });

  it('passes clear input without wrapping it', async (): Promise<void> => {
    const chatSource = await readSource(chatSourcePath);

    expect(chatSource).toContain('clearInput: inputEvents.clear,');
    expect(chatSource).not.toContain('clearInput: (): void => inputEvents.clear()');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/components/BChat/chat-composer-boundary.test.ts`

Expected: FAIL because `index.vue` still contains `editor: {` and wrapped `clearInput`.

### Task 2: Composer Owns Editor Helpers

**Files:**
- Modify: `src/components/BChat/hooks/useChatComposer.ts`
- Modify: `src/components/BChat/index.vue`

**Interfaces:**
- Consumes: `promptEditorRef: Ref<InstanceType<typeof BTextEditor> | undefined>`.
- Produces: `focusInput(options?: { moveToEnd?: boolean }): void` from `useChatComposer`, with `saveCursorPosition`, `getCursorPosition`, `replaceTextRange`, and `insertTextAtCursor` kept internal.

- [ ] **Step 1: Update `useChatComposer` option type**

Replace the `editor` object in `UseChatComposerOptions` with:

```ts
/** 输入编辑器组件引用 */
promptEditorRef: Ref<InstanceType<typeof BTextEditor> | undefined>;
```

Add `import type BTextEditor from '@/components/BText/Editor.vue';`.

- [ ] **Step 2: Add internal editor helpers**

Inside `useChatComposer`, replace `options.editor.*` usage with these helpers:

```ts
/** 聚焦输入编辑器。 */
function focusInput(focusOptions?: { moveToEnd?: boolean }): void {
  options.promptEditorRef.value?.focus?.(focusOptions);
}

/** 保存输入编辑器光标位置。 */
function saveCursorPosition(): void {
  options.promptEditorRef.value?.saveCursorPosition();
}

/** 读取输入编辑器光标位置。 */
function getCursorPosition(): number {
  return options.promptEditorRef.value?.getCursorPosition() ?? 0;
}

/**
 * 替换输入编辑器文本范围。
 * @param from - 起始偏移
 * @param to - 结束偏移
 * @param text - 替换文本
 */
function replaceTextRange(from: number, to: number, text: string): void {
  options.promptEditorRef.value?.replaceTextRange(from, to, text);
}

/**
 * 在当前光标处插入输入文本。
 * @param text - 插入文本
 */
function insertTextAtCursor(text: string): void {
  options.promptEditorRef.value?.insertTextAtCursor(text);
}
```

Pass these helpers into `useFileReference`, `useVoiceInput`, and file-drop token insertion.

- [ ] **Step 3: Update `index.vue` composer wiring**

Change the composer call to:

```ts
const composer = useChatComposer({
  containerRef,
  promptEditorRef,
  showToast: interactionAPI.showToast,
  openFile
});
```

Destructure `focusInput` from `composer` and remove the local `focusInput` wrapper function.

### Task 3: Clear Input Direct Forwarding

**Files:**
- Modify: `src/components/BChat/index.vue`

**Interfaces:**
- Consumes: `inputEvents.clear: () => void`.
- Produces: `useSlashCommands({ clearInput: inputEvents.clear })`.

- [ ] **Step 1: Replace pure wrapper**

Change:

```ts
clearInput: (): void => inputEvents.clear(),
```

to:

```ts
clearInput: inputEvents.clear,
```

- [ ] **Step 2: Run focused boundary test**

Run: `pnpm exec vitest run test/components/BChat/chat-composer-boundary.test.ts`

Expected: PASS.

### Task 4: Changelog and Verification

**Files:**
- Modify: `changelog/2026-07-14.md`

**Interfaces:**
- Consumes: The completed refactor.
- Produces: Fresh verification evidence and a changelog entry.

- [ ] **Step 1: Update changelog**

Add under `## Changed`:

```md
- BChat Composer 直接接收输入编辑器实例引用，并清理入口组件的编辑器方法与清空草稿转发。
```

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
pnpm exec vitest run test/components/BChat/chat-composer-boundary.test.ts test/components/BChat/session-id-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run static verification**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
pnpm test
```

Expected: The known `MessageBubble.vue`-related test may still fail because that file has user-owned changes outside this task; all new composer tests should pass.
