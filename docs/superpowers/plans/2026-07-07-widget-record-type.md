# Widget Record Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store widget editor sessions as first-class recent records with `type: 'widget'`, without a `.tibis` content wrapper.

**Architecture:** Split file-like recent records into ordinary files and widgets, then preserve the selected record type through storage normalization, file sessions, widget settings, and recent-record UI flows. Widget sessions serialize `WidgetData` directly as JSON and route by storage record type instead of content-level `.tibis` metadata.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript strict mode, Vitest, Electron store adapter, existing `native` platform abstraction.

---

## File Structure

- Modify `src/shared/storage/files/types.ts`: add `StoredDocumentRecord`, `StoredWidget`, and file-like type guards.
- Modify `src/shared/storage/files/recent.ts`: normalize `file` and `widget` records through shared file-like helpers while preserving the record type.
- Modify `src/stores/workspace/recent.ts`: make file-like getters/actions include both `file` and `widget` records in recent lists, cache patching, path lookup, opening, and system recent-file synchronization.
- Modify `src/hooks/useFileSession.ts`: add `recordType` and direct JSON serialization mode for widget records.
- Modify `src/hooks/useOpenFile.ts`: route `type: 'widget'` records to the widget editor and create new widget files as widget records.
- Modify `src/views/settings/tools/widget/index.vue`: create/open widget records with raw widget JSON and `type: 'widget'`.
- Modify `src/views/widget/index.vue`: request `recordType: 'widget'` and direct JSON widget serialization.
- Modify recent-record surfaces: `src/components/BCommandPanel/sources/recent.ts`, `src/components/BRecent/Icon.vue`, `src/views/welcome/index.vue`.
- Modify file-reference/tool helpers: `src/utils/file/reference.ts`, `src/ai/tools/shared/fileTool.ts`, `src/components/BChat/utils/runtimeBridge.ts`.
- Update tests in `test/shared/storage/files/recent.test.ts`, `test/hooks/use-file-session.test.ts`, `test/views/settings/tools/widget/index.test.ts`.
- Update `changelog/2026-07-07.md`.

User instruction: do not commit. Do not add git commit steps.

## Task 1: Storage Types And Normalization

**Files:**
- Modify: `src/shared/storage/files/types.ts`
- Modify: `src/shared/storage/files/recent.ts`
- Test: `test/shared/storage/files/recent.test.ts`

- [ ] **Step 1: Add failing storage tests**

Add these cases to `test/shared/storage/files/recent.test.ts`:

```ts
it('preserves widget records during normalization', async (): Promise<void> => {
  mockElectronAPI.storeGet.mockResolvedValue([
    {
      type: 'widget',
      id: 'widget-weather',
      path: '/Users/demo/.tibis/widgets/weather/widget.json',
      content: '{"name":"天气"}',
      name: 'weather',
      ext: 'json',
      openedAt: 200
    }
  ]);

  const records = await recentFilesStorage.getAllRecentFiles();

  expect(records[0]).toMatchObject({
    type: 'widget',
    id: 'widget-weather',
    path: '/Users/demo/.tibis/widgets/weather/widget.json',
    content: '{"name":"天气"}',
    name: 'weather',
    ext: 'json',
    openedAt: 200
  });
  expect(mockElectronAPI.storeSet).not.toHaveBeenCalled();
});

it('migrates unknown record types to files', async (): Promise<void> => {
  mockElectronAPI.storeGet.mockResolvedValue([
    {
      type: 'unknown',
      id: 'legacy-record',
      path: '/Users/demo/Legacy.md',
      content: '# Legacy',
      openedAt: 100
    }
  ]);

  const records = await recentFilesStorage.getAllRecentFiles();

  expect(records[0]).toMatchObject({
    type: 'file',
    id: 'legacy-record',
    path: '/Users/demo/Legacy.md',
    content: '# Legacy',
    name: 'Legacy',
    ext: 'md'
  });
  expect(mockElectronAPI.storeSet).toHaveBeenCalledWith('recent_files', records);
});
```

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```bash
pnpm test -- test/shared/storage/files/recent.test.ts
```

Expected before implementation: the widget-preservation test fails because non-webview records are normalized to `type: 'file'`.

- [ ] **Step 3: Implement storage types**

In `src/shared/storage/files/types.ts`, replace the single `StoredFile` shape with this model:

```ts
/**
 * 文件型最近记录公共字段。
 */
export interface StoredDocumentRecord {
  /** 记录类型。 */
  type: 'file' | 'widget';
  /** 文件唯一标识。 */
  id: string;
  /** 文件唯一路径，未保存文件为 null。 */
  path: string | null;
  /** 当前文件内容。 */
  content: string;
  /** 最近一次与磁盘同步的内容基线。 */
  savedContent?: string;
  /** 文件名。 */
  name: string;
  /** 文件扩展名。 */
  ext: string;
  /** 本地记录首次创建时间（毫秒时间戳）。 */
  createdAt?: number;
  /** 最近一次显式打开时间。 */
  openedAt?: number;
  /** 最近一次内容变更时间。 */
  modifiedAt?: number;
  /** 最近一次成功保存时间。 */
  savedAt?: number;
  /** 文件被固定的时间（预留字段）。 */
  pinnedAt?: number;
  /** 文件所属工作区 ID（预留字段）。 */
  workspaceId?: string | null;
}

/**
 * 普通文件主记录。
 */
export interface StoredFile extends StoredDocumentRecord {
  /** 记录类型。 */
  type: 'file';
}

/**
 * Widget 文件主记录。
 */
export interface StoredWidget extends StoredDocumentRecord {
  /** 记录类型。 */
  type: 'widget';
}

/**
 * 判断最近记录是否为文件型记录。
 * @param record - 最近记录
 * @returns 是否为普通文件或 Widget 记录
 */
export function isDocumentRecord(record: RecentRecord): record is StoredFile | StoredWidget {
  return record.type === 'file' || record.type === 'widget';
}
```

Keep `RecentRecord = StoredFile | StoredWidget | WebviewRecord`.

- [ ] **Step 4: Implement normalization**

In `src/shared/storage/files/recent.ts`, rename `normalizeStoredFile` to a file-like helper and preserve the incoming record type:

```ts
/**
 * 将单个文件型记录归一化到当前存储模型。
 * @param file - 原始文件型记录
 * @param type - 目标记录类型
 * @returns 归一化后的文件型记录
 */
function normalizeStoredDocumentRecord<T extends StoredDocumentRecord>(file: T, type: T['type']): T {
  const rawFile = file as unknown as Record<string, unknown>;
  const normalizedPath = normalizePathField(rawFile.path);
  const derivedTitleParts = deriveFileTitleParts(normalizedPath);
  const normalizedFile = {
    ...file,
    type,
    path: normalizedPath,
    content: normalizeContentField(rawFile.content),
    name: normalizeTextField(rawFile.name) || derivedTitleParts.name,
    ext: normalizeTextField(rawFile.ext).replace(/^\.+/, '') || derivedTitleParts.ext
  } as T;

  if (normalizedFile.savedContent === undefined && normalizedFile.path === null) {
    return { ...normalizedFile, savedContent: normalizedFile.content };
  }
  return normalizedFile;
}
```

Update bulk normalization so `rawRecord.type === 'widget'` returns a widget record and unknown types return a file record.

- [ ] **Step 5: Run storage tests and verify pass**

Run:

```bash
pnpm test -- test/shared/storage/files/recent.test.ts
```

Expected: all tests in `recent.test.ts` pass.

## Task 2: File-Like Store And Open Routing

**Files:**
- Modify: `src/stores/workspace/recent.ts`
- Modify: `src/hooks/useOpenFile.ts`
- Modify: `src/components/BCommandPanel/sources/recent.ts`
- Modify: `src/views/welcome/index.vue`
- Modify: `src/components/BRecent/Icon.vue`

- [ ] **Step 1: Update imports and getters**

Use `StoredDocumentRecord` and `isDocumentRecord` from `@/shared/storage` where the code wants both ordinary files and widgets:

```ts
recentFiles(state: RecentState): StoredDocumentRecord[] | null {
  return state.recentRecords ? state.recentRecords.filter(isDocumentRecord) : null;
}
```

Keep method names such as `recentFiles` for compatibility, but widen the return type to include widgets.

- [ ] **Step 2: Preserve file-like cache behavior**

Update `syncRecentFiles` to sync both `file` and `widget` records:

```ts
const fileRecords = this.recentRecords.filter(isDocumentRecord);
```

Map the same `id`, `name`, `ext`, and `path` fields into `native.syncRecentFiles`.

- [ ] **Step 3: Route widgets by record type**

In `src/hooks/useOpenFile.ts`, make `resolveFileRoute` prefer storage record type:

```ts
function resolveFileRoute(file: StoredDocumentRecord): FileRouteLocation {
  if (file.type === 'widget') {
    return { name: 'widget', params: { id: file.id } };
  }

  return { name: 'editor', params: { id: file.id } };
}
```

Remove widget routing dependence on `.tibis` content helpers from this path.

- [ ] **Step 4: Update command panel and welcome page branches**

Replace `record.type === 'file'` checks with `isDocumentRecord(record)` when the behavior should apply to both `file` and `widget`.

For welcome page:

```vue
@click="isDocumentRecord(record) ? handleOpenRecentFile(record.id) : handleOpenWebview(record.url)"
```

For display text:

```vue
{{ isDocumentRecord(record) ? resolveFileTitle(record) : record.title }}
```

- [ ] **Step 5: Update recent icons**

In `src/components/BRecent/Icon.vue`, use widget-specific icon behavior only if needed. The minimal behavior is:

```ts
if (props.record && isDocumentRecord(props.record)) {
  return getFileIconByName(resolveFileTitle(props.record));
}
```

This keeps `json` widget files visually consistent until a dedicated widget icon is introduced.

## Task 3: Widget Session Direct JSON Mode

**Files:**
- Modify: `src/hooks/useFileSession.ts`
- Modify: `src/views/widget/index.vue`
- Test: `test/hooks/use-file-session.test.ts`

- [ ] **Step 1: Add failing direct-widget session tests**

Add tests that describe the new direct JSON behavior:

```ts
it('creates default widget JSON content without tibis wrapper', async (): Promise<void> => {
  getFileByIdMock.mockResolvedValue(undefined);
  addFileMock.mockResolvedValue(undefined);
  const scope = effectScope();
  let content = '';

  await scope.run(async (): Promise<void> => {
    const session = useFileSession<WidgetData>({
      fileId: ref('widget-1'),
      kind: 'widget',
      recordType: 'widget',
      defaultName: 'Untitled',
      defaultExt: 'json',
      defaultData: createWidgetData(),
      routeName: 'widget',
      fallbackRouteName: 'editor'
    });

    await flushPromises();
    content = session.fileState.value.content;
  });
  scope.stop();

  expect(JSON.parse(content)).toEqual(createWidgetData());
  expect(JSON.parse(content)).not.toHaveProperty('type');
  expect(JSON.parse(content)).not.toHaveProperty('version');
});

it('preserves widget record type when loading and saving', async (): Promise<void> => {
  const content = JSON.stringify(createWidgetData(), null, 2);
  getFileByIdMock.mockResolvedValue({
    type: 'widget',
    id: 'widget-1',
    path: '/tmp/widget.json',
    name: 'widget',
    ext: 'json',
    content,
    savedContent: content
  });
  const scope = effectScope();

  await scope.run(async (): Promise<void> => {
    const session = useFileSession<WidgetData>({
      fileId: ref('widget-1'),
      kind: 'widget',
      recordType: 'widget',
      defaultName: 'Untitled',
      defaultExt: 'json',
      defaultData: createWidgetData(),
      routeName: 'widget',
      fallbackRouteName: 'editor'
    });

    await flushPromises();
    await session.actions.onSave();
  });
  scope.stop();

  expect(updateFileMock).toHaveBeenCalledWith(
    'widget-1',
    expect.objectContaining({
      type: 'widget',
      content
    })
  );
});
```

- [ ] **Step 2: Run hook tests and verify failure**

Run:

```bash
pnpm test -- test/hooks/use-file-session.test.ts
```

Expected before implementation: `kind: 'widget'` and `recordType` are not supported.

- [ ] **Step 3: Update session option types**

In `src/hooks/useFileSession.ts`, change `FileSessionKind`:

```ts
export type FileSessionKind = 'text' | 'tibis' | 'widget';
```

Add:

```ts
/** 文件会话对应的存储记录类型。 */
recordType?: 'file' | 'widget';
```

to `UseFileSessionOptions<TData>`.

- [ ] **Step 4: Add direct JSON helpers**

Update `createDefaultFileState`, `createDataFromContent`, and `serializeDataToContent`:

```ts
if (options.kind === 'widget') {
  return JSON.stringify(options.defaultData ?? {}, null, 2);
}
```

```ts
if (options.kind === 'widget') {
  try {
    return JSON.parse(content) as TData;
  } catch {
    return options.defaultData;
  }
}
```

```ts
if (options.kind === 'widget') {
  try {
    const content = JSON.stringify(nextData ?? {}, null, 2);
    serializationError.value = null;
    return content;
  } catch (error: unknown) {
    serializationError.value = error instanceof Error ? error : new Error('serialize widget document failed');
    return null;
  }
}
```

- [ ] **Step 5: Preserve record type on writes**

Add a small helper inside `useFileSession`:

```ts
function readRecordType(): 'file' | 'widget' {
  return options.recordType ?? 'file';
}
```

Use it whenever adding or updating the current session record:

```ts
await filesStore.addFile({ ...fileState.value, type: readRecordType(), savedContent: savedContent.value });
```

and:

```ts
await filesStore.updateFile(options.fileId.value, {
  ...fileState.value,
  type: readRecordType(),
  savedContent: fileState.value.content,
  savedAt
});
```

- [ ] **Step 6: Update widget page session**

In `src/views/widget/index.vue`, call:

```ts
const session = useFileSession<WidgetData>({
  fileId,
  kind: 'widget',
  recordType: 'widget',
  defaultName: 'Untitled',
  defaultExt: 'json',
  defaultData: createDefaultWidgetData(),
  routeName: 'widget',
  fallbackRouteName: 'editor'
});
```

- [ ] **Step 7: Run hook tests and verify pass**

Run:

```bash
pnpm test -- test/hooks/use-file-session.test.ts
```

Expected: hook tests pass after updating or removing old tibis-specific widget assertions that no longer match the product direction.

## Task 4: Widget Settings Open/Create Flow

**Files:**
- Modify: `src/views/settings/tools/widget/index.vue`
- Test: `test/views/settings/tools/widget/index.test.ts`

- [ ] **Step 1: Update failing widget settings expectations**

In `test/views/settings/tools/widget/index.test.ts`, update expectations so opened records look like this:

```ts
expect(createAndOpenMock.mock.calls[0]?.[0]).toMatchObject({
  type: 'widget',
  id: 'widget-weather',
  path: '/Users/test/.tibis/widgets/weather/widget.json',
  name: 'weather',
  ext: 'json'
});
```

For opened content:

```ts
expect(createdContent).toMatchObject({
  name: '天气',
  description: '查询指定城市天气'
});
expect(createdContent).not.toHaveProperty('type');
expect(createdContent).not.toHaveProperty('version');
```

- [ ] **Step 2: Run widget settings tests and verify failure**

Run:

```bash
pnpm test -- test/views/settings/tools/widget/index.test.ts
```

Expected before implementation: tests fail because the component currently creates `type: 'file'`, `ext: 'tibis'`, and `.tibis` wrapped content.

- [ ] **Step 3: Implement raw widget content opening**

In `src/views/settings/tools/widget/index.vue`, remove `createWidgetTibisDocumentContent` from imports.

Change `openWidgetEditor` to:

```ts
async function openWidgetEditor(widget: WidgetDefinition): Promise<void> {
  const content = JSON.stringify(widget.data, null, 2);
  const openedFile = await filesStore.createAndOpen({
    type: 'widget',
    id: `widget-${widget.id}`,
    path: widget.filePath,
    name: widget.id,
    ext: 'json',
    content,
    savedContent: content
  });

  await router.push({ name: 'widget', params: { id: openedFile.id } });
}
```

Ensure `handleCreateConfirm` still writes `widget.json` to disk and then opens the raw widget record.

- [ ] **Step 4: Run widget settings tests and verify pass**

Run:

```bash
pnpm test -- test/views/settings/tools/widget/index.test.ts
```

Expected: widget settings tests pass with raw widget JSON records.

## Task 5: References, Tools, And Runtime Bridges

**Files:**
- Modify: `src/utils/file/reference.ts`
- Modify: `src/ai/tools/shared/fileTool.ts`
- Modify: `src/components/BChat/utils/runtimeBridge.ts`

- [ ] **Step 1: Widen file-like reads**

In `src/utils/file/reference.ts`, replace `item.type === 'file'` and `record?.type === 'file'` checks with `isDocumentRecord(...)`.

Expected behavior: `@` references can resolve unsaved or saved widget records the same way they resolve ordinary files.

- [ ] **Step 2: Widen AI file tool draft access**

In `src/ai/tools/shared/fileTool.ts`, make `readUnsavedDraft` accept both file and widget records:

```ts
const record = await recentFilesStorage.getRecentFile(id);
return record && isDocumentRecord(record) ? record : null;
```

Update `UnsavedDraftOptions` return/update types to `StoredDocumentRecord` where needed.

- [ ] **Step 3: Widen runtime bridge recent-file checks**

In `src/components/BChat/utils/runtimeBridge.ts`, replace strict `file.type !== 'file'` rejection with `!isDocumentRecord(file)`.

- [ ] **Step 4: Run targeted reference/tool tests**

Run:

```bash
pnpm test -- test/utils/file/reference.test.ts test/components/BChat/widget-runtime.test.ts
```

Expected: existing behavior remains passing. Add focused tests only if TypeScript changes uncover an untested behavior gap.

## Task 6: Changelog And Full Verification

**Files:**
- Modify: `changelog/2026-07-07.md`

- [ ] **Step 1: Add changelog entry**

Add a `Changed` entry:

```md
## Changed
- Widget 编辑会话统一改为 `type: 'widget'` 最近记录，移除对 `.tibis` 容器内容的依赖。
```

If the file already has a `Changed` section, append the bullet there.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test -- test/shared/storage/files/recent.test.ts test/hooks/use-file-session.test.ts test/views/settings/tools/widget/index.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run lint and type checks**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```

Expected: all commands complete without errors.

- [ ] **Step 4: Inspect git status without staging**

Run:

```bash
git status --short
```

Expected: changed files are visible, nothing is staged or committed.
