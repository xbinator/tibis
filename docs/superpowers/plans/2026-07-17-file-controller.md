# Common File Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated Editor and Widget file-session state machines with one generic `useFileController` that owns draft persistence, disk-save policy, save state, tab dirty/missing state, loading conflicts, file watching, save-as, rename, flush, and stale-operation isolation.

**Architecture:** `src/hooks/useFileController.ts` is the only public entry and composes three focused internal hooks under `src/hooks/file-controller/`: draft persistence, disk-save scheduling, and file watching. Editor and Widget retain thin adapters in their existing `useSession.ts` files; adapters provide type-specific `events` and page-only actions while the controller remains the only writer of file-session and tab state.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Pinia, Vitest, lodash-es debounce, platform abstraction through `native`, and the existing recent/tabs/file-watch stores.

## Global Constraints

- Do not use `any`; all function parameters and return values require explicit TypeScript annotations.
- Every new or modified source file, interface, function, method, and non-obvious branch requires an accurate comment or JSDoc block.
- All public callbacks and actions use the `on` prefix; reactive status fields do not use the `on` prefix.
- `saveStrategy: 'off'` disables automatic disk writes only; recent-file drafts still persist.
- Public save state remains exactly `isSaved: ComputedRef<boolean>`; internal loading/saving/error states must not become a third public save state.
- Auto-save with `path === null` must never open the first-save dialog.
- Async work must use `asyncTo()`; synchronous parse/serialization guards may use synchronous `try/catch`.
- `events` return results and never mutate controller-owned file, baseline, tab, watcher, or lifecycle state.
- Every async result is validated against `fileId`, `sessionVersion`, `contentRevision`, path, and content snapshot before it is applied.
- Preserve unrelated existing working-tree changes.
- The user will commit the work; do not run `git add` or `git commit` during execution.

---

## Final File Map

```text
src/hooks/
├── types.ts
├── useFileController.ts
└── file-controller/
    ├── types.ts
    ├── useDraftPersistence.ts
    ├── useDiskSave.ts
    └── useFileWatch.ts
test/hooks/
├── use-file-controller.test.ts
├── use-draft-persistence.test.ts
├── use-disk-save.test.ts
└── use-file-watch.test.ts
```

The Editor and Widget keep their existing `useSession.ts` files as adapters. Legacy auto-save, save-policy, Editor file-state, and Editor file-watcher modules are deleted only after both adapters pass their integration tests.

### Task 1: Lock the Public Contract and Core Save-State Invariant

**Files:**
- Create: `src/hooks/file-controller/types.ts`
- Create: `src/hooks/useFileController.ts`
- Create: `test/hooks/use-file-controller.test.ts`
- Modify: `src/hooks/types.ts`

**Interfaces:**
- Consumes: `FileSessionState`, `StoredDocumentRecord`, Vue `Ref` and `ComputedRef`.
- Produces: `FileControllerOptions<TData>`, `FileControllerEvents<TData>`, `FileControllerResult<TData>`, `FileControllerActions`, and `useFileController<TData>()`.

- [x] **Step 1: Add failing contract tests for initial state and dirty synchronization**

Create a typed event factory and assert the two-state invariant:

```ts
function createEvents(overrides: Partial<FileControllerEvents<string>> = {}): FileControllerEvents<string> {
  return {
    onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
      fileState: { id: fileId, name: 'Untitled', ext: 'md', path: null, content: '' },
      data: '',
      savedContent: ''
    }),
    onLoad: vi.fn().mockResolvedValue({ draft: null, disk: null, error: null }),
    onParse: ({ content }: FileParseContext): string => content,
    onSerialize: ({ data }: FileSerializeContext<string>): string => data,
    onBuildRecord: ({ fileState, savedContent }: FileRecordContext<string>): StoredDocumentRecord => ({
      ...fileState,
      type: 'file',
      savedContent
    }),
    onWriteFile: vi.fn().mockResolvedValue(undefined),
    onSaveAs: vi.fn().mockResolvedValue(null),
    onRename: vi.fn().mockResolvedValue(null),
    onResolveConflict: vi.fn().mockResolvedValue('keepDraft'),
    ...overrides
  };
}

it('exposes only saved or unsaved and mirrors it to the tab dirty state', async (): Promise<void> => {
  const controller = useFileController({ fileId: ref('file-1'), events: createEvents() });
  await controller.actions.onReload();
  expect(controller.isSaved.value).toBe(true);

  controller.data.value = 'changed';
  await nextTick();
  expect(controller.isSaved.value).toBe(false);
  expect(setDirtyMock).toHaveBeenCalledWith('file-1');
});
```

- [x] **Step 2: Run the focused test and verify the missing API failure**

Run: `pnpm test -- test/hooks/use-file-controller.test.ts`

Expected: FAIL because `@/hooks/useFileController` and controller contract types do not exist.

- [x] **Step 3: Define the complete public and internal contract**

Add these exact core types to `src/hooks/file-controller/types.ts`, with JSDoc on every field:

```ts
export type FileConflictDecision = 'keepDraft' | 'useDisk';

export interface FileControllerSnapshot<TData> {
  fileState: FileSessionState;
  data: TData;
  savedContent: string;
}

export interface FileLoadCandidates {
  draft: { fileState: FileSessionState; savedContent: string | null } | null;
  disk: { fileState: FileSessionState } | null;
  error: Error | null;
}

export interface FileOperationSnapshot {
  fileId: string;
  sessionVersion: number;
  contentRevision: number;
  path: string | null;
  content: string;
}

export interface FileControllerEvents<TData> {
  onCreate: (context: { fileId: string }) => FileControllerSnapshot<TData>;
  onLoad: (context: { fileId: string; sessionVersion: number }) => Promise<FileLoadCandidates>;
  onParse: (context: { content: string; path: string | null }) => TData;
  onSerialize: (context: { data: TData; path: string | null }) => string;
  onBuildRecord: (context: FileControllerSnapshot<TData> & { modifiedAt: number }) => StoredDocumentRecord;
  onWriteFile: (context: { path: string; content: string }) => Promise<void>;
  onSaveAs: (context: { fileState: Readonly<FileSessionState>; content: string }) => Promise<string | null>;
  onRename: (context: { fileState: Readonly<FileSessionState> }) => Promise<{ name: string; path: string | null; ext: string } | null>;
  onResolveConflict: (context: { draft: FileDraftCandidate; disk: FileDiskCandidate }) => Promise<FileConflictDecision>;
}
```

Define named interfaces for every inline context shown above before exporting them. Define `FileControllerActions` with `onSave`, `onSaveAs`, `onRename`, `onBlur`, `onReload`, `onDelete`, `onFlush`, and `onDispose`. Define `FileControllerResult<TData>` with `fileState`, `data`, `savedContent`, `isSaved`, `isMissing`, `isLoading`, `loadError`, and `actions`.

- [x] **Step 4: Implement the minimal public composition root**

Initialize from `events.onCreate`, derive `isSaved` from content equality plus the absence of serialization error, watch `data`, serialize it, increment `contentRevision`, and mirror the result to `tabsStore.setDirty/clearDirty`. Export public types from `useFileController.ts`; do not export internal hooks.

- [x] **Step 5: Run the controller contract test**

Run: `pnpm test -- test/hooks/use-file-controller.test.ts`

Expected: PASS for initial state, serialization, `isSaved`, and Tab dirty synchronization.

### Task 2: Add Draft Persistence and Disk-Save Scheduling

**Files:**
- Create: `src/hooks/file-controller/useDraftPersistence.ts`
- Create: `src/hooks/file-controller/useDiskSave.ts`
- Create: `test/hooks/use-draft-persistence.test.ts`
- Create: `test/hooks/use-disk-save.test.ts`
- Modify: `src/hooks/useFileController.ts`

**Interfaces:**
- Consumes: `onBuildRecord`, `onWriteFile`, `FileSessionState`, `savedContent`, `contentRevision`, and `EditorSaveStrategy`.
- Produces: `onScheduleDraft`, `onFlushDraft`, `onScheduleSave`, `onBlur`, `onSaveSnapshot`, `onFlushSave`, and internal `isSaving` state.

- [x] **Step 1: Write failing draft tests for create, update, strategy off, and flush**

```ts
it('persists drafts independently from disk strategy', async (): Promise<void> => {
  const persistence = useDraftPersistence({ fileState, data, savedContent, onBuildRecord, delay: 0 });
  persistence.onScheduleDraft();
  await persistence.onFlushDraft();
  expect(updateFileMock).toHaveBeenCalledWith(
    'file-1',
    expect.objectContaining({ content: 'draft', type: 'widget' })
  );
});
```

Also assert that a missing record calls `addFile`, `onBuildRecord` decides `type`, and flush writes a pending draft immediately.

- [x] **Step 2: Run the draft test and verify failure**

Run: `pnpm test -- test/hooks/use-draft-persistence.test.ts`

Expected: FAIL because `useDraftPersistence` does not exist.

- [x] **Step 3: Implement draft persistence with lodash-es debounce**

Build the record at execution time, call `recentStore.getFileById`, then `updateFile` or `addFile`. Expose `onScheduleDraft`, `onFlushDraft`, and `onDisposeDraft`. `onFlushDraft` calls `debounced.flush()` and awaits the current persistence Promise. This module must not read save strategy or branch on record type.

- [x] **Step 4: Write failing disk-scheduler tests**

```ts
it.each(['off', 'onBlur'] as const)('does not write on content change for %s', async (strategy): Promise<void> => {
  const disk = createDiskHarness(strategy);
  disk.onScheduleSave();
  await vi.runAllTimersAsync();
  expect(onWriteFile).not.toHaveBeenCalled();
});

it('writes on blur only for onBlur with an existing path', async (): Promise<void> => {
  const disk = createDiskHarness('onBlur');
  await disk.onBlur();
  expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/a.md', content: 'changed' });
});
```

Also test `onChange` debounce, no-path skip, failed-write baseline retention, one active write, pending latest resave, and an old successful snapshot not clearing a newer edit.

- [x] **Step 5: Run the disk test and verify failure**

Run: `pnpm test -- test/hooks/use-disk-save.test.ts`

Expected: FAIL because `useDiskSave` does not exist.

- [x] **Step 6: Implement serialized snapshot writes**

Use one active Promise and one `pendingSave` flag. Every write captures `{ fileId, sessionVersion, contentRevision, path, content }`, invokes `onWriteFile` through `asyncTo`, and calls controller-provided `onCommitSnapshot(snapshot)` only on success. `onChange` uses an 800 ms delay; `onBlur` writes only under `onBlur`; manual save bypasses strategy but still requires a path.

- [x] **Step 7: Compose draft and disk controls into the controller**

After every successful serialization call `onScheduleDraft`; let the disk scheduler decide whether content change also writes. Public `onBlur` delegates to the scheduler. Public `onFlush` flushes the draft first and then awaits all active/pending disk work allowed by the current strategy.

- [x] **Step 8: Run the controller-layer tests**

Run: `pnpm test -- test/hooks/use-file-controller.test.ts test/hooks/use-draft-persistence.test.ts test/hooks/use-disk-save.test.ts`

Expected: PASS.

### Task 3: Centralize File Watching and Self-Write Suppression

**Files:**
- Create: `src/hooks/file-controller/useFileWatch.ts`
- Create: `test/hooks/use-file-watch.test.ts`
- Modify: `src/hooks/useFileController.ts`
- Modify: `src/hooks/file-controller/useDiskSave.ts`

**Interfaces:**
- Consumes: `fileId`, current path, session version, `native.onFileChanged`, and `useEditorFileWatchStore`.
- Produces: `onSwitchPath`, `onSuppressWrite`, `onClearSuppression`, `onActivate`, `onDeactivate`, `onDisposeWatch`, and an external-event callback.

- [x] **Step 1: Write failing watcher tests**

```ts
it('suppresses only matching path and content from the current session', (): void => {
  watcher.onSuppressWrite({
    fileId: 'file-1',
    sessionVersion: 2,
    path: '/tmp/a.md',
    content: 'self-write'
  });

  emitChange({ type: 'change', filePath: '/tmp/a.md', content: 'self-write' });
  expect(onExternalChange).not.toHaveBeenCalled();

  emitChange({ type: 'change', filePath: '/tmp/a.md', content: 'external' });
  expect(onExternalChange).toHaveBeenCalledTimes(1);
});
```

Also cover duplicate identical native events, five-second expiry, path switch, session switch, `unlink`, `add`, and dispose. Verify register/update/unregister calls remain serialized when paths change quickly. Create two controller IDs for one path and assert the later registration is marked read-only for automatic writes, so only the existing writer can schedule `onChange` or `onBlur` disk saves.

- [x] **Step 2: Run the watcher test and verify failure**

Run: `pnpm test -- test/hooks/use-file-watch.test.ts`

Expected: FAIL because `useFileWatch` does not exist.

- [x] **Step 3: Implement versioned path registration and suppression**

Store the suppression signature as `{ fileId, sessionVersion, path, content, expiresAt }`. Match path and content; discard on mismatch, expiry, write failure, path/session change, or dispose. Use one queued path-sync Promise so a slow register cannot reinstall an obsolete path. Forward `change` to the controller and mirror `unlink/add` through the existing file-watch and tabs stores. Before enabling automatic writes, inspect the store path ownership map; another file ID on the same path makes the later session read-only for automatic disk policy while preserving draft persistence and explicit user actions.

- [x] **Step 4: Wire write snapshots to watcher suppression**

Before `onWriteFile`, register the exact write snapshot. Clear its signature when the write fails. After save-as or rename, invalidate old signatures before switching the watched path.

- [x] **Step 5: Run watcher and disk tests together**

Run: `pnpm test -- test/hooks/use-file-watch.test.ts test/hooks/use-disk-save.test.ts`

Expected: PASS with no leaked subscriptions or fake timers.

### Task 4: Complete Loading, Conflict, Manual Actions, and Lifecycle Isolation

**Files:**
- Modify: `src/hooks/useFileController.ts`
- Modify: `src/hooks/file-controller/types.ts`
- Modify: `test/hooks/use-file-controller.test.ts`

**Interfaces:**
- Consumes: all `events` and internal draft/disk/watch controls.
- Produces: the final public `FileControllerResult<TData>` behavior.

- [x] **Step 1: Add failing load and conflict tests**

Cover no candidates (`onCreate`), draft only, disk only, unchanged baseline, draft-only change, disk-only change, and simultaneous conflict. For simultaneous change, assert `onResolveConflict` decides the result and parsing happens only after the final string is chosen. Add load-read failure and parse failure cases that preserve the prior safe snapshot, expose `loadError`, and block draft/disk scheduling until `onReload` succeeds.

- [x] **Step 2: Add failing stale-operation tests**

```ts
it('discards an old load after fileId changes', async (): Promise<void> => {
  const firstLoad = createDeferred<FileLoadCandidates>();
  const fileId = ref('file-a');
  const events = createEvents({ onLoad: vi.fn().mockReturnValueOnce(firstLoad.promise) });
  const controller = useFileController({ fileId, events });

  const oldReload = controller.actions.onReload();
  fileId.value = 'file-b';
  await nextTick();
  firstLoad.resolve(createDiskCandidates('file-a', 'old'));
  await oldReload;

  expect(controller.fileState.value.id).toBe('file-b');
  expect(controller.fileState.value.content).not.toBe('old');
});
```

Add equivalent cases for save completion after a newer edit, save-as completion after file switch, rename completion after reload, external change from an old path, and any completion after dispose.

- [x] **Step 3: Add failing manual-action and lifecycle tests**

Assert manual `onSave` writes existing paths, no-path `onSave` delegates to `onSaveAs`, automatic triggers never do, cancel preserves all state, successful save-as updates path/name/ext and baseline, rename switches paths atomically, delete removes the recent record, flush persists pending drafts, and dispose prevents later mutations. Assert `unlink` sets `isMissing` without deleting the draft, successful restore/save-as clears it, activation restores the current watch, and deactivation stops page-level change handling without destroying the draft.

- [x] **Step 4: Implement load reconciliation and atomic apply**

Reuse `resolveFileReconcileDecision` or move its generic string/meta decision into `src/hooks/file-controller/` if importing an Editor utility would invert the dependency. Pause data watchers while applying the chosen snapshot. Call `onParse` synchronously; parsing failure sets `loadError`, keeps the prior safe snapshot, and prevents persistence and disk scheduling.

- [x] **Step 5: Implement manual actions and lifecycle**

Every action captures `FileOperationSnapshot` before awaiting. `onSaveAs` applies a returned path only if the snapshot remains current, parses name/ext with the shared path helper, switches watch path, clears missing, and commits only the written content. `onRename` applies its result only if current. `onDispose` awaits flush, increments session version, then clears timers, watchers, and suppression signatures.

- [x] **Step 6: Implement serialization-failure dirty behavior**

If `onSerialize` throws, set `serializationError`, keep the last valid `fileState.content`, set Tab dirty, and block draft/disk writes. A later successful serialization clears the error and recomputes `isSaved`.

- [x] **Step 7: Run the complete public controller suite**

Run: `pnpm test -- test/hooks/use-file-controller.test.ts test/hooks/use-draft-persistence.test.ts test/hooks/use-disk-save.test.ts test/hooks/use-file-watch.test.ts`

Expected: PASS for save strategies, failures, conflicts, stale work, watching, flush, and dispose.

### Task 5: Migrate the Editor Session to a String Adapter

**Files:**
- Modify: `src/views/editor/hooks/useSession.ts`
- Modify: `test/views/editor/use-session-save-dialog.test.ts`
- Modify: `src/views/editor/index.vue` only if the returned action name changes at the call site

**Interfaces:**
- Consumes: `useFileController<string>()` and all controller event contexts.
- Produces: the existing Editor page return shape with common actions delegated to the controller.

- [x] **Step 1: Rewrite Editor integration tests against the controller boundary**

Remove mocks for `useFileAutoSave`, legacy `useSavePolicy`, `useFileState`, and `useFileWatcher`. Mock `useFileController` only for page wiring tests, and retain real-controller integration coverage for first save, existing-path save, missing-file recovery, save-as cancel, rename, and in-flight edits.

- [x] **Step 2: Run the Editor session tests and verify adapter failures**

Run: `pnpm test -- test/views/editor/use-session-save-dialog.test.ts test/views/editor/reconcile-file-content.test.ts`

Expected: FAIL until `useSession.ts` delegates to `useFileController`.

- [x] **Step 3: Build the Editor event adapter inside `useSession.ts`**

Use `TData = string`:

```ts
const controller = useFileController<string>({
  fileId,
  events: {
    onCreate: onCreateFile,
    onLoad: onLoadFile,
    onParse: ({ content }: FileParseContext): string => content,
    onSerialize: ({ data }: FileSerializeContext<string>): string => data,
    onBuildRecord: onBuildRecord,
    onWriteFile: ({ path, content }: FileWriteContext): Promise<void> => native.writeFile(path, content),
    onSaveAs: onSaveAsFile,
    onRename: onRenameFile,
    onResolveConflict
  }
});
```

Keep route/cache/title synchronization, duplicate, show-in-folder, clipboard, view mode, activation, and navigation in the Editor session. Map common actions directly from `controller.actions`.

- [x] **Step 4: Verify the Editor adapter**

Run: `pnpm test -- test/views/editor/use-session-save-dialog.test.ts test/views/editor/use-bindings.test.ts test/views/editor/index-scroll-position.test.ts`

Expected: PASS with unchanged page behavior and controller-owned save state.

### Task 6: Migrate the Widget Session to a JSON Adapter

**Files:**
- Modify: `src/views/widget/hooks/useSession.ts`
- Modify: `src/views/widget/index.vue`
- Modify: `test/views/widget/use-session.test.ts`
- Modify: `test/views/widget/index.test.ts`

**Interfaces:**
- Consumes: `useFileController<WidgetData>()`.
- Produces: Widget session return shape with `data`, `fileState`, `isLoading`, `loadError`, `currentTitle`, and `actions.onReload`.

- [x] **Step 1: Update Widget tests to assert controller semantics**

Keep coverage for installed Widget path resolution, recent-record fallback, disk/draft conflict, parse failure, serialization failure, external change, write suppression, save strategies, first save, save-as, rename restriction, delete, and KeepAlive activation. Remove direct mocks and expectations tied to `useFileAutoSave` and legacy `useSavePolicy`.

- [x] **Step 2: Run the Widget session suite and verify migration failures**

Run: `pnpm test -- test/views/widget/use-session.test.ts test/views/widget/index.test.ts`

Expected: FAIL until the Widget session uses the common controller and `session.reload` becomes `session.actions.onReload`.

- [x] **Step 3: Build the Widget event adapter**

Use `parseWidgetJson` in `onParse`, stable `JSON.stringify(data, null, 2)` in `onSerialize`, and return `type: 'widget'` only from `onBuildRecord`. `onLoad` resolves the installed Widget path plus recent/disk candidates but does not decide conflict or mutate controller state. Preserve Widget Store initialization, bindings, clipboard helpers, page title, and Widget-only rename policy outside generic controller internals.

- [x] **Step 4: Update the Widget retry binding**

Replace:

```vue
@click="session.reload"
```

with:

```vue
@click="session.actions.onReload"
```

- [x] **Step 5: Verify the Widget adapter and dependent tests**

Run: `pnpm test -- test/views/widget/use-session.test.ts test/views/widget/index.test.ts test/views/widget/use-multi-selection.test.ts`

Expected: PASS with Widget JSON parsing/serialization provided through events and persistence owned by the controller.

### Task 7: Remove Legacy Layers, Update Copy and Documentation, Then Verify

**Files:**
- Delete: `src/hooks/useFileAutoSave.ts`
- Delete: `src/hooks/useSavePolicy.ts`
- Delete: `src/views/editor/hooks/useFileState.ts`
- Delete: `src/views/editor/hooks/useFileWatcher.ts`
- Delete: `src/views/editor/hooks/useSavePolicy.ts`
- Delete: `test/hooks/use-file-auto-save.test.ts`
- Delete: `test/hooks/use-save-policy.test.ts`
- Delete: `test/views/editor/use-file-state.test.ts`
- Delete: `test/views/editor/use-file-watcher.test.ts`
- Modify: `src/views/settings/basic/index.vue`
- Modify: `CONTEXT.md`
- Modify: `changelog/2026-07-17.md`

**Interfaces:**
- Consumes: fully migrated Editor and Widget adapters.
- Produces: one supported file-controller architecture with no legacy imports.

- [x] **Step 1: Prove legacy modules have no remaining consumers**

Run:

```bash
rg -n "useFileAutoSave|useSavePolicy|useFileState|useFileWatcher" src test
```

Expected: matches only in the legacy files and tests listed for deletion. If a live consumer remains, migrate that explicit match before deleting the referenced module.

- [x] **Step 2: Delete only the proven-unused legacy files**

Use `apply_patch` deletion patches. Preserve `src/hooks/types.ts` and all unrelated working-tree changes.

- [x] **Step 3: Correct the settings description**

Change the `off` option to:

```ts
{ value: 'off', label: '关闭', tips: '关闭自动写入磁盘，草稿仍会自动保存' }
```

- [x] **Step 4: Update architecture documentation and changelog**

Document `useFileController`, its `events` adapter boundary, the two-state public save status, and the “off disables disk only” rule in `CONTEXT.md`. Add a `Changed` entry to `changelog/2026-07-17.md` describing the unified Editor/Widget file lifecycle and stale-operation protection. Repository documentation must use repository-relative paths.

- [x] **Step 5: Run focused file-session tests**

Run:

```bash
pnpm test -- test/hooks/use-file-controller.test.ts test/hooks/use-draft-persistence.test.ts test/hooks/use-disk-save.test.ts test/hooks/use-file-watch.test.ts test/views/editor/use-session-save-dialog.test.ts test/views/widget/use-session.test.ts test/views/widget/index.test.ts
```

Expected: PASS.

- [x] **Step 6: Run the full test suite**

Run: `pnpm test`

Expected: all tests pass; existing intentional skips remain skips.

- [x] **Step 7: Run TypeScript and lint verification without modifying source**

Run:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx
pnpm exec stylelint 'src/**/*.{vue,less,css}'
```

Expected: all commands exit with code 0.

- [x] **Step 8: Inspect the final working tree without staging or committing**

Run:

```bash
git status --short
git diff --check
```

Expected: only intended existing cleanup plus file-controller implementation changes are present; no whitespace errors, staged files, or commits were created by this work.

### Task 8: Group Internal Controller Runtime State

**Files:**
- Modify: `src/hooks/useFileController.ts`

**Interfaces:**
- Consumes: the existing `useFileController<TData>` public contract and internal lifecycle checks.
- Produces: identical controller behavior with non-reactive internals grouped under `status`, `tasks`, and `runtime`.

- [x] **Step 1: Run the controller characterization tests**

Run:

```bash
pnpm exec vitest run test/hooks/use-file-controller.test.ts
```

Expected: PASS before refactoring.

- [x] **Step 2: Group lifecycle booleans under `status`**

Replace the separate `syncingData`, `disposing`, `deleting`, and `disposed` variables with:

```ts
const status = {
  syncingData: false,
  disposing: false,
  deleting: false,
  disposed: false
}
```

Update every lifecycle read and write to use `status.*` without changing conditions or transition order.

- [x] **Step 3: Group task handles under `tasks`**

Replace `disposeTask` and `externalTask` with:

```ts
const tasks = {
  dispose: null as Promise<void> | null,
  external: Promise.resolve()
}
```

Preserve the current external-event serialization and idempotent dispose behavior.

- [x] **Step 4: Group internal resources under `runtime`**

Replace `stopFileIdWatch`, `pauseReasonSeed`, and `activeLoadPause` with:

```ts
const runtime = {
  stopFileIdWatch: null as (() => void) | null,
  pauseReasonSeed: 0,
  activeLoadPause: null as string | null
}
```

Keep all public and shared reactive values as their existing standalone refs.

- [x] **Step 5: Verify behavior and static checks**

Run:

```bash
pnpm exec vitest run test/hooks/use-file-controller.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/hooks/useFileController.ts
git diff --check
```

Expected: all commands exit with code 0. Do not stage or commit; the user will commit the working tree.
