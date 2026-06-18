# Chat Input File Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drop files anywhere on the BChat input container, with images becoming draft image attachments and other files becoming file reference tokens.

**Architecture:** Keep BChat markup thin by moving shared DOM drag/drop behavior into `src/hooks/useFileDrop.ts`. `src/components/BChat/index.vue` passes the input container ref and a BChat-specific drop callback into the hook, while `src/views/welcome/components/DropZone.vue` also reuses the same hook.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest, Vue Test Utils, Less.

---

### Task 1: Add Container Drag-Drop Tests

**Files:**
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Capture prompt editor exposed methods in the test stub**

Add a hoisted state near the existing mocks:

```ts
const promptEditorMockState = vi.hoisted(() => ({
  focus: vi.fn(),
  saveCursorPosition: vi.fn(),
  insertTextAtCursor: vi.fn<(text: string) => void>(),
  getCursorPosition: vi.fn<() => number>(() => 0),
  replaceTextRange: vi.fn()
}));
```

Update `BPromptEditorStub` so `expose` uses `promptEditorMockState` methods instead of fresh `vi.fn()` calls.

- [ ] **Step 2: Add drop event helpers**

Add these helpers after `createDeferred`:

```ts
/**
 * 创建带文件拖拽数据的 DOM 事件。
 * @param type - 事件类型
 * @param files - 拖拽文件列表
 * @returns 拖拽事件
 */
function createFileDragEvent(type: 'dragenter' | 'dragover' | 'dragleave' | 'drop', files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      types: ['Files'],
      dropEffect: 'none'
    }
  });
  return event;
}
```

- [ ] **Step 3: Reset prompt editor mock state**

In `beforeEach`, reset the five methods on `promptEditorMockState` and restore `getCursorPosition` to return `0`.

- [ ] **Step 4: Write failing tests**

Add these tests inside `describe('BChat sessionId runtime', ...)`:

```ts
it('highlights the input container while dragging files over it', async (): Promise<void> => {
  const wrapper = mountBChat(null);
  await flushPromises();
  const inputContainer = wrapper.find('.b-chat__input-container');

  await inputContainer.element.dispatchEvent(createFileDragEvent('dragenter', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
  await wrapper.vm.$nextTick();

  expect(inputContainer.classes()).toContain('b-chat__input-container--dragover');

  await inputContainer.element.dispatchEvent(createFileDragEvent('dragleave', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
  await wrapper.vm.$nextTick();

  expect(inputContainer.classes()).not.toContain('b-chat__input-container--dragover');
});

it('inserts file reference tokens when non-image files are dropped on the input container', async (): Promise<void> => {
  const wrapper = mountBChat(null);
  await flushPromises();

  await wrapper.find('.b-chat__input-container').element.dispatchEvent(createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
  await flushPromises();

  expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{#[](note.md)}}');
});

it('adds image files when images are dropped on the input container', async (): Promise<void> => {
  const wrapper = mountBChat(null);
  await flushPromises();

  await wrapper.find('.b-chat__input-container').element.dispatchEvent(createFileDragEvent('drop', [new File(['image'], 'photo.png', { type: 'image/png' })]));
  await flushPromises();

  expect(promptEditorMockState.insertTextAtCursor).not.toHaveBeenCalled();
});

it('processes mixed dropped files with image upload and file reference insertion', async (): Promise<void> => {
  const wrapper = mountBChat(null);
  await flushPromises();

  await wrapper.find('.b-chat__input-container').element.dispatchEvent(
    createFileDragEvent('drop', [
      new File(['image'], 'photo.png', { type: 'image/png' }),
      new File(['hello'], 'note.md', { type: 'text/markdown' })
    ])
  );
  await flushPromises();

  expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{#[](note.md)}}');
});
```

- [ ] **Step 5: Run the focused tests and verify they fail before implementation**

Run:

```bash
pnpm test test/components/BChat/session-id-runtime.test.ts
```

Expected: at least the new drag-drop tests fail because `.b-chat__input-container` has no active class and no container drop handler yet.

### Task 2: Implement Container File Drop

**Files:**
- Create: `src/hooks/useFileDrop.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `src/components/BChat/hooks/useFileReference.ts`
- Modify: `src/views/welcome/components/DropZone.vue`

- [ ] **Step 1: Create the shared file drop hook**

Create `src/hooks/useFileDrop.ts` with a file header, typed options, drag state, DOM listener cleanup, and `resolveDroppedFilePath(file)`. The hook should return `isDragging`.

- [ ] **Step 2: Bind the hook to the input container ref**

Change the input container opening tag to use the existing BEM modifier helper and add a ref:

```vue
<div ref="inputContainerRef" :class="bem('input-container', { dragover: isInputDragActive })">
```

- [ ] **Step 3: Wire BChat to the hook**

Add an `inputContainerRef` and call the hook after `imageUpload` and `fileReference` are initialized:

```ts
const inputContainerRef = ref<HTMLElement>();

const { isDragging: isInputDragActive } = useFileDrop({
  targetRef: inputContainerRef,
  onDropFiles: handleInputDropFiles
});
```

- [ ] **Step 4: Resolve native paths for dropped non-image files**

Update `src/components/BChat/hooks/useFileReference.ts` so `onPasteFiles` calls `resolveDroppedFilePath(file)` and emits an encoded `[](...)` path token such as `{{#[](%2Fpath%2Fto%2Ffile.md)}}` when a local path is available, otherwise falling back to the same encoded filename token shape.

- [ ] **Step 5: Reuse the shared hook in Welcome DropZone**

Update `src/views/welcome/components/DropZone.vue` to replace local drag state, drag counter, and local path resolver with `useFileDrop` and `resolveDroppedFilePath`.

- [ ] **Step 6: Add drag-active styling**

Extend `.b-chat__input-container`:

```less
.b-chat__input-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: var(--b-chat-max-width, 800px);
  padding: 12px;
  margin: 0 auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  transition: background 0.3s ease-in-out, border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;

  &.b-chat__input-container--dragover {
    background: var(--color-primary-bg);
    border-color: var(--input-focus-border);
    box-shadow: inset 0 0 0 1px var(--color-control-outline);
  }
}
```

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```bash
pnpm test test/components/BChat/session-id-runtime.test.ts
pnpm test test/views/welcome/drop-zone.test.ts
```

Expected: all tests in both files pass.

### Task 3: Update Changelog and Run Verification

**Files:**
- Modify: `changelog/2026-06-18.md`

- [ ] **Step 1: Add changelog entry**

Add under `## Added`:

```md
- BChat 输入框容器支持拖拽文件：图片追加到草稿附件，普通文件优先插入真实路径引用 token。
```

- [ ] **Step 2: Run type and lint checks**

Run:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm lint:style
```

Expected: all commands complete successfully.

- [ ] **Step 3: Review final diff**

Run:

```bash
git diff -- src/hooks/useFileDrop.ts src/components/BChat/index.vue src/components/BChat/hooks/useFileReference.ts src/views/welcome/components/DropZone.vue test/components/BChat/session-id-runtime.test.ts test/views/welcome/drop-zone.test.ts changelog/2026-06-18.md docs/superpowers/specs/2026-06-18-chat-input-file-drop-design.md docs/superpowers/plans/2026-06-18-chat-input-file-drop.md
```

Expected: the diff only contains the shared drag-drop hook, BChat and welcome page integrations, tests, changelog, spec, and this plan.

- [ ] **Step 4: Keep changes uncommitted**

Leave all related changes in the working tree until the user explicitly asks to commit.
