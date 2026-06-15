# Tibis File Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared file-session layer under `src/hooks`, make `.tibis` drawing files auto-save like editor files, and route supported `.tibis` documents into `drawing/:id` while falling back to `editor/:id` for unsupported content.

**Architecture:** Move reusable save policy and autosave behavior into `src/hooks`, then add `useFileSession` as the business-facing wrapper for text and `.tibis` sessions. Keep `.tibis` parsing and serialization in the hook layer, and keep all open-entry routing centralized in `src/hooks/useOpenFile.ts` so Welcome, DropZone, BSearchRecent, and menu shortcuts share one path.

**Tech Stack:** Vue 3 Composition API, Pinia, Vue Router, Vitest, `lodash-es` debounce/isEqual patterns, existing native file APIs, existing recent-files storage.

---

## Coordination Notes

Do not make per-task commits. The user wants one unified commit after the implementation is complete. Each task still has a verification step so regressions are caught early.

Use the existing project rules:

- Add file headers and JSDoc for new functions, interfaces, and non-trivial logic.
- Do not use `any`; use specific types or `unknown`.
- Keep B-prefixed components globally resolved unless importing types or dynamic modules.
- Add a `changelog/2026-06-15.md` entry during implementation.

## File Map

Create:

- `src/hooks/useSavePolicy.ts`: shared real-disk save policy moved from editor.
- `src/hooks/useFileAutoSave.ts`: shared recent-file debounce autosave with a minimal file-state shape.
- `src/hooks/useFileSession.ts`: shared file session, `.tibis` parse/stringify, fallback route resolver, file actions.
- `test/hooks/use-save-policy.test.ts`: shared save policy tests.
- `test/hooks/use-file-auto-save.test.ts`: shared autosave tests.
- `test/hooks/use-file-session.test.ts`: `.tibis` serialization, routing, dirty, and sync tests.

Modify:

- `src/views/editor/hooks/useSession.ts`: no direct edit required because editor hook files remain compatibility wrappers.
- `src/views/editor/hooks/useAutoSave.ts`: remove the editor-only wrapper and use `src/hooks/useFileAutoSave.ts` directly from editor session code.
- `src/views/drawing/index.vue`: load drawing data from `useFileSession<DrawingData>`.
- `src/router/routes/modules/drawing.ts`: convert drawing route to `drawing/:id?` with per-file tab metadata.
- `src/hooks/useOpenFile.ts`: route by `.tibis` content and expose `createNewDrawingFile`.
- `src/constants/extensions.ts`: add `tibis` to open extensions and filters.
- `src/views/welcome/index.vue`: call `createNewDrawingFile`; render `.tibis` icon.
- `src/views/welcome/components/DropZone.vue`: support `.tibis`; use `openFile(createdFile)` for no-path drafts.
- `src/components/BSearchRecent/index.vue`: active-file detection for drawing route; no `.tibis` business logic inside component.
- `src/layouts/default/hooks/useFileActive.ts`: keep menu paths going through `useOpenFile`; no special `.tibis` logic needed unless adding a drawing menu item.
- `test/router/drawing-route.test.ts`: update parameterized route expectations.
- `test/views/welcome/index.test.ts`: update drawing quick action expectation.
- `test/views/welcome/drop-zone.test.ts`: add no-path `.tibis` draft routing coverage.

## Task 1: Move Save Policy To Shared Hooks

**Files:**

- Create: `src/hooks/useSavePolicy.ts`
- Modify: `src/views/editor/hooks/useSavePolicy.ts`
- Modify: `src/views/editor/hooks/useSession.ts`
- Test: `test/hooks/use-save-policy.test.ts`

- [ ] **Step 1: Write shared save policy tests**

Create `test/hooks/use-save-policy.test.ts`:

```typescript
/**
 * @file use-save-policy.test.ts
 * @description 验证共享真实磁盘保存策略。
 */
import { effectScope, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useSavePolicy } from '@/hooks/useSavePolicy';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';

/**
 * 等待指定毫秒数。
 * @param ms - 等待时间
 * @returns Promise
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('useSavePolicy', (): void => {
  it('skips automatic disk save when strategy is off', async (): Promise<void> => {
    const scope = effectScope();
    const strategy = ref<EditorSaveStrategy>('off');
    const saveCurrentFileToDisk = vi.fn().mockResolvedValue({ status: 'saved' });

    scope.run((): void => {
      const policy = useSavePolicy({
        saveStrategy: strategy,
        hasFilePath: ref(true),
        isDirty: (): boolean => true,
        saveCurrentFileToDisk
      });

      policy.notifyContentChanged();
    });

    await wait(900);
    scope.stop();

    expect(saveCurrentFileToDisk).not.toHaveBeenCalled();
  });

  it('runs disk save on blur when strategy is onBlur', async (): Promise<void> => {
    const scope = effectScope();
    const strategy = ref<EditorSaveStrategy>('onBlur');
    const saveCurrentFileToDisk = vi.fn().mockResolvedValue({ status: 'saved' });

    await scope.run(async (): Promise<void> => {
      const policy = useSavePolicy({
        saveStrategy: strategy,
        hasFilePath: ref(true),
        isDirty: (): boolean => true,
        saveCurrentFileToDisk
      });

      await policy.handleEditorBlur();
    });
    scope.stop();

    expect(saveCurrentFileToDisk).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/hooks/use-save-policy.test.ts`

Expected: FAIL because `@/hooks/useSavePolicy` does not exist.

- [ ] **Step 3: Create shared hook**

Copy the implementation from `src/views/editor/hooks/useSavePolicy.ts` into `src/hooks/useSavePolicy.ts`, keeping the file header. Preserve `EditorSaveStrategy` import from `@/stores/editor/preferences`, because the preference store is already shared by editor and drawing save policy.

The exported API must remain:

```typescript
export interface SaveToDiskResult {
  /** 本次写盘状态 */
  status: 'saved' | 'skipped' | 'failed';
  /** 写盘失败时的错误对象 */
  error?: Error;
}

export interface SavePolicyOptions {
  /** 当前保存策略 */
  saveStrategy: Ref<EditorSaveStrategy>;
  /** 当前文件是否已有磁盘路径 */
  hasFilePath: Ref<boolean>;
  /** 当前文档是否处于 dirty 状态 */
  isDirty: () => boolean;
  /** 执行一次真实磁盘写盘 */
  saveCurrentFileToDisk: () => Promise<SaveToDiskResult>;
}
```

- [ ] **Step 4: Preserve editor compatibility**

Replace `src/views/editor/hooks/useSavePolicy.ts` with a compatibility re-export:

```typescript
/**
 * @file useSavePolicy.ts
 * @description 兼容层，委托到共享真实磁盘保存策略 hook。
 */
export type { SavePolicyOptions, SaveToDiskResult } from '@/hooks/useSavePolicy';
export { useSavePolicy } from '@/hooks/useSavePolicy';
```

Keep `src/views/editor/hooks/useSession.ts` importing `./useSavePolicy`; the local compatibility wrapper delegates to `@/hooks/useSavePolicy`.

- [ ] **Step 5: Run tests**

Run: `pnpm test test/hooks/use-save-policy.test.ts`

Expected: PASS.

Run: `pnpm test test/views/editor/use-bindings.test.ts`

Expected: PASS, confirming editor imports still compile around nearby hooks.

## Task 2: Add Shared Recent-File Auto Save

**Files:**

- Create: `src/hooks/useFileAutoSave.ts`
- Delete: `src/views/editor/hooks/useAutoSave.ts`
- Modify: `src/views/editor/hooks/useSession.ts`
- Test: `test/hooks/use-file-auto-save.test.ts`

- [ ] **Step 1: Write shared auto-save tests**

Create `test/hooks/use-file-auto-save.test.ts`:

```typescript
/**
 * @file use-file-auto-save.test.ts
 * @description 验证共享最近文件自动保存 hook。
 */
import { effectScope, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileAutoSave } from '@/hooks/useFileAutoSave';
import type { FileSessionState } from '@/hooks/useFileSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    getFileById: getFileByIdMock,
    updateFile: updateFileMock,
    addFile: addFileMock
  })
}));

/**
 * 创建文件会话状态。
 * @param content - 文件内容
 * @returns 文件会话状态
 */
function createState(content: string): FileSessionState {
  return {
    id: 'file-1',
    name: 'Untitled',
    ext: 'tibis',
    path: null,
    content
  };
}

describe('useFileAutoSave', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    updateFileMock.mockReset();
    addFileMock.mockReset();
    getFileByIdMock.mockResolvedValue({ id: 'file-1', type: 'file' });
  });

  it('updates an existing recent file with modifiedAt', async (): Promise<void> => {
    const scope = effectScope();
    const fileState = ref<FileSessionState>(createState('one'));

    await scope.run(async (): Promise<void> => {
      const autoSave = useFileAutoSave(fileState, { delay: 0 });

      fileState.value = { ...fileState.value, content: 'two' };
      await nextTick();
      await autoSave.save();
    });
    scope.stop();

    expect(updateFileMock).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({
        content: 'two',
        modifiedAt: expect.any(Number)
      })
    );
  });

  it('does not save while paused', async (): Promise<void> => {
    const scope = effectScope();
    const fileState = ref<FileSessionState>(createState('one'));

    await scope.run(async (): Promise<void> => {
      const autoSave = useFileAutoSave(fileState, { delay: 0 });

      autoSave.pause();
      fileState.value = { ...fileState.value, content: 'two' };
      await nextTick();
      await autoSave.save();
    });
    scope.stop();

    expect(updateFileMock).not.toHaveBeenCalled();
    expect(addFileMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/hooks/use-file-auto-save.test.ts`

Expected: FAIL because `@/hooks/useFileAutoSave` and `FileSessionState` are not created yet.

- [ ] **Step 3: Add exported `FileSessionState` stub**

Create `src/hooks/useFileSession.ts` with only shared types for now:

```typescript
/**
 * @file useFileSession.ts
 * @description 通用文件会话 hook 与 .tibis 文件容器工具。
 */
import type { File } from '@/shared/platform/native/types';

/**
 * 文件会话状态。
 */
export interface FileSessionState extends File {
  /** 文件唯一 ID */
  id: string;
}
```

- [ ] **Step 4: Implement `useFileAutoSave`**

Create `src/hooks/useFileAutoSave.ts`:

```typescript
/**
 * @file useFileAutoSave.ts
 * @description 处理通用文件会话的最近文件自动保存。
 */
import type { Ref } from 'vue';
import { onUnmounted, ref, watch } from 'vue';
import { debounce } from 'lodash-es';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFilesStore } from '@/stores/workspace/files';
import type { FileSessionState } from './useFileSession';

/**
 * 自动保存配置。
 */
export interface FileAutoSaveOptions {
  /** debounce 延迟 */
  delay?: number;
}

/**
 * 创建可写入最近文件存储的记录。
 * @param fileState - 当前文件会话状态
 * @param timestamp - 时间戳
 * @returns 最近文件记录
 */
function createStoredFile(fileState: FileSessionState, timestamp: number): StoredFile {
  return {
    ...fileState,
    type: 'file',
    createdAt: timestamp,
    modifiedAt: timestamp
  };
}

/**
 * 创建最近文件自动保存 hook。
 * @param fileState - 当前文件状态
 * @param options - 自动保存配置
 * @returns 自动保存控制器
 */
export function useFileAutoSave(fileState: Ref<FileSessionState>, options: FileAutoSaveOptions = {}) {
  const { delay = 500 } = options;
  const filesStore = useFilesStore();
  const isPaused = ref<boolean>(false);

  /**
   * 将当前文件状态保存到最近文件存储。
   */
  async function saveToStorage(): Promise<void> {
    if (isPaused.value) {
      return;
    }

    const current = fileState.value;
    const modifiedAt = Date.now();
    const stored = await filesStore.getFileById(current.id);

    if (stored) {
      await filesStore.updateFile(current.id, { ...current, modifiedAt });
      return;
    }

    await filesStore.addFile(createStoredFile(current, modifiedAt));
  }

  const debouncedSave = debounce(saveToStorage, delay);
  const stopWatch = watch(
    () => fileState.value.content,
    (): void => {
      if (!isPaused.value) {
        debouncedSave();
      }
    }
  );

  /**
   * 暂停自动保存。
   */
  function pause(): void {
    isPaused.value = true;
  }

  /**
   * 恢复自动保存。
   */
  function resume(): void {
    isPaused.value = false;
  }

  onUnmounted((): void => {
    stopWatch();
    debouncedSave.cancel();

    if (!isPaused.value) {
      void saveToStorage();
    }
  });

  return {
    save: saveToStorage,
    debouncedSave,
    isPaused,
    pause,
    resume
  };
}
```

- [ ] **Step 5: Let editor use the shared auto-save hook directly**

Delete `src/views/editor/hooks/useAutoSave.ts`, then update `src/views/editor/hooks/useSession.ts` to import `useFileAutoSave` and `FileAutoSaveController` from `@/hooks/useFileAutoSave`. Do not keep a second wrapper around the shared hook.

- [ ] **Step 6: Run tests**

Run: `pnpm test test/hooks/use-file-auto-save.test.ts test/views/editor/use-bindings.test.ts`

Expected: PASS.

## Task 3: Implement Tibis Document Helpers In `useFileSession`

**Files:**

- Modify: `src/hooks/useFileSession.ts`
- Test: `test/hooks/use-file-session.test.ts`

- [ ] **Step 1: Write document helper tests**

Create `test/hooks/use-file-session.test.ts`:

```typescript
/**
 * @file use-file-session.test.ts
 * @description 验证通用文件会话和 .tibis 容器工具。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingData } from '@/components/BDrawing/types';
import {
  createTibisDocumentContent,
  parseTibisDocumentContent,
  resolveTibisDocumentRoute
} from '@/hooks/useFileSession';

/**
 * 创建测试画图数据。
 * @returns 画图数据
 */
function createDrawingData(): DrawingData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

describe('tibis document helpers', (): void => {
  it('serializes drawing data as flat top-level tibis JSON', (): void => {
    const content = createTibisDocumentContent({
      type: 'drawing',
      version: 1,
      data: createDrawingData()
    });

    expect(JSON.parse(content)).toEqual({
      type: 'drawing',
      version: 1,
      elements: [],
      edges: [],
      viewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    });
  });

  it('parses flat tibis JSON and strips type and version from data', (): void => {
    const parsed = parseTibisDocumentContent<DrawingData>(
      JSON.stringify({
        type: 'drawing',
        version: 1,
        elements: [],
        edges: [],
        viewport: {
          center: { x: 1, y: 2 },
          zoom: 1.5
        }
      })
    );

    expect(parsed.supported).toBe(true);
    expect(parsed.type).toBe('drawing');
    expect(parsed.version).toBe(1);
    expect(parsed.data).toEqual({
      elements: [],
      edges: [],
      viewport: {
        center: { x: 1, y: 2 },
        zoom: 1.5
      }
    });
  });

  it('routes supported drawing documents to drawing and invalid content to editor', (): void => {
    expect(resolveTibisDocumentRoute('{"type":"drawing","version":1,"elements":[],"edges":[],"viewport":{"center":{"x":0,"y":0},"zoom":1}}')).toEqual({
      routeName: 'drawing'
    });

    expect(resolveTibisDocumentRoute('{broken')).toEqual({
      routeName: 'editor'
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm test test/hooks/use-file-session.test.ts`

Expected: FAIL because the exported helper functions are not implemented.

- [ ] **Step 3: Add Tibis helper types and functions**

Extend `src/hooks/useFileSession.ts`:

```typescript
/**
 * .tibis 文档解析结果。
 */
export interface TibisDocumentParseResult<TData> {
  /** 是否是当前支持的 Tibis 文档 */
  supported: boolean;
  /** 文档类型 */
  type: string;
  /** 文档版本 */
  version: number;
  /** 业务数据 */
  data: TData;
  /** 原始解析错误 */
  error?: Error;
}

/**
 * .tibis 文档序列化参数。
 */
export interface CreateTibisDocumentContentOptions<TData extends object> {
  /** 业务文档类型 */
  type: string;
  /** 业务数据版本 */
  version: number;
  /** 业务数据 */
  data: TData;
}

/**
 * Tibis 路由解析结果。
 */
export interface TibisDocumentRouteTarget {
  /** 目标路由名称 */
  routeName: 'drawing' | 'editor';
}

/**
 * 判断值是否为普通对象。
 * @param value - 待判断值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 将业务数据序列化为扁平 .tibis 文档内容。
 * @param options - 序列化参数
 * @returns JSON 字符串
 */
export function createTibisDocumentContent<TData extends object>(options: CreateTibisDocumentContentOptions<TData>): string {
  return JSON.stringify(
    {
      type: options.type,
      version: options.version,
      ...options.data
    },
    null,
    2
  );
}

/**
 * 解析 .tibis 文档内容。
 * @param content - 原始文件内容
 * @returns 解析结果
 */
export function parseTibisDocumentContent<TData extends object>(content: string): TibisDocumentParseResult<TData> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return {
        supported: false,
        type: '',
        version: 0,
        data: {} as TData,
        error: new Error('Tibis document must be an object')
      };
    }

    const { type, version, ...data } = parsed;
    return {
      supported: type === 'drawing' && version === 1,
      type: typeof type === 'string' ? type : '',
      version: typeof version === 'number' ? version : 0,
      data: data as TData
    };
  } catch (error: unknown) {
    return {
      supported: false,
      type: '',
      version: 0,
      data: {} as TData,
      error: error instanceof Error ? error : new Error('Failed to parse Tibis document')
    };
  }
}

/**
 * 解析 .tibis 文档对应的目标路由。
 * @param content - 原始文件内容
 * @returns 路由目标
 */
export function resolveTibisDocumentRoute(content: string): TibisDocumentRouteTarget {
  const parsed = parseTibisDocumentContent<Record<string, unknown>>(content);

  return {
    routeName: parsed.supported ? 'drawing' : 'editor'
  };
}
```

- [ ] **Step 4: Run helper tests**

Run: `pnpm test test/hooks/use-file-session.test.ts`

Expected: PASS for helper tests.

## Task 4: Implement `useFileSession` Core

**Files:**

- Modify: `src/hooks/useFileSession.ts`
- Test: `test/hooks/use-file-session.test.ts`

- [ ] **Step 1: Add core session tests**

Append to `test/hooks/use-file-session.test.ts`:

```typescript
import { effectScope, nextTick, ref } from 'vue';
import { vi } from 'vitest';
import { useFileSession } from '@/hooks/useFileSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const setDirtyMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    getFileById: getFileByIdMock,
    addFile: addFileMock,
    updateFile: updateFileMock
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    clearDirty: clearDirtyMock,
    setDirty: setDirtyMock,
    isDirty: () => false,
    clearMissing: vi.fn()
  })
}));

vi.mock('@/stores/editor/preferences', () => ({
  useEditorPreferencesStore: () => ({
    saveStrategy: 'off'
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    writeFile: vi.fn(),
    saveFile: vi.fn(),
    readFile: vi.fn(),
    renameFile: vi.fn(),
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn()
  }
}));

describe('useFileSession', (): void => {
  it('creates default drawing tibis content when no stored file exists', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    const scope = effectScope();
    const fileId = ref('drawing-1');
    let content = '';

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<DrawingData>({
        fileId,
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });

      await nextTick();
      content = session.fileState.value.content;
    });
    scope.stop();

    expect(JSON.parse(content)).toEqual({
      type: 'drawing',
      version: 1,
      elements: [],
      edges: [],
      viewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/hooks/use-file-session.test.ts`

Expected: FAIL because `useFileSession` is not implemented.

- [ ] **Step 3: Implement session options and return types**

Add to `src/hooks/useFileSession.ts`:

```typescript
import type { Ref } from 'vue';
import { computed, ref, watch } from 'vue';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFilesStore } from '@/stores/workspace/files';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file/title';
import { useFileAutoSave } from './useFileAutoSave';

/**
 * 文件会话业务模式。
 */
export type FileSessionKind = 'text' | 'tibis';

/**
 * 通用文件会话配置。
 */
export interface UseFileSessionOptions<TData> {
  /** 当前文件 ID */
  fileId: Ref<string>;
  /** 文件会话类型 */
  kind: FileSessionKind;
  /** 默认文件名主体 */
  defaultName: string;
  /** 默认扩展名 */
  defaultExt: string;
  /** 默认业务数据 */
  defaultData: TData;
  /** .tibis 业务类型 */
  type?: string;
  /** .tibis 业务版本 */
  version?: number;
  /** 当前业务路由名称 */
  routeName: string;
  /** 不支持当前内容时的兜底路由名称 */
  fallbackRouteName: string;
}

/**
 * 通用文件会话返回值。
 */
export interface UseFileSessionReturn<TData> {
  /** 当前文件状态 */
  fileState: Ref<FileSessionState>;
  /** 当前业务数据 */
  data: Ref<TData>;
  /** 当前文件标题 */
  currentTitle: Ref<string>;
  /** 文件操作 */
  actions: {
    onSave: () => Promise<void>;
    onSaveAs: () => Promise<void>;
    onRename: () => Promise<void>;
    onDelete: () => Promise<void>;
    onShowInFolder: () => Promise<void>;
    onCopyPath: () => Promise<void>;
    onCopyRelativePath: () => Promise<void>;
    onBlur: () => Promise<void>;
  };
}
```

- [ ] **Step 4: Implement load, data/content sync, and action function declarations**

Add functions inside `useFileSession`:

```typescript
/**
 * 创建默认文件状态。
 * @param options - 文件会话配置
 * @returns 文件状态
 */
function createDefaultFileState<TData>(options: UseFileSessionOptions<TData>): FileSessionState {
  const content =
    options.kind === 'tibis'
      ? createTibisDocumentContent({
          type: options.type ?? '',
          version: options.version ?? 1,
          data: options.defaultData as object
        })
      : String(options.defaultData ?? '');

  return {
    id: options.fileId.value,
    name: options.defaultName,
    ext: options.defaultExt,
    path: null,
    content
  };
}

/**
 * 从文件内容创建业务数据。
 * @param options - 文件会话配置
 * @param content - 文件内容
 * @returns 业务数据
 */
function createDataFromContent<TData>(options: UseFileSessionOptions<TData>, content: string): TData {
  if (options.kind === 'text') {
    return content as TData;
  }

  const parsed = parseTibisDocumentContent<object>(content);
  if (!parsed.supported) {
    return options.defaultData;
  }

  return parsed.data as TData;
}

/**
 * 创建通用文件会话。
 * @param options - 文件会话配置
 * @returns 文件会话
 */
export function useFileSession<TData>(options: UseFileSessionOptions<TData>): UseFileSessionReturn<TData> {
  const filesStore = useFilesStore();
  const tabsStore = useTabsStore();
  const fileState = ref<FileSessionState>(createDefaultFileState(options)) as Ref<FileSessionState>;
  const data = ref<TData>(createDataFromContent(options, fileState.value.content)) as Ref<TData>;
  const savedContent = ref<string>(fileState.value.content);
  const syncingContentToData = ref<boolean>(false);
  const autoSave = useFileAutoSave(fileState);
  const currentTitle = computed<string>(() => resolveFileTitle(fileState.value));

  watch(
    data,
    (nextData: TData): void => {
      if (syncingContentToData.value) {
        return;
      }

      fileState.value = {
        ...fileState.value,
        content:
          options.kind === 'tibis'
            ? createTibisDocumentContent({
                type: options.type ?? '',
                version: options.version ?? 1,
                data: nextData as object
              })
            : String(nextData ?? '')
      };

      if (fileState.value.content !== savedContent.value) {
        tabsStore.setDirty(options.fileId.value);
      } else {
        tabsStore.clearDirty(options.fileId.value);
      }
    },
    { deep: true }
  );

  async function load(): Promise<void> {
    autoSave.pause();
    const stored = await filesStore.getFileById(options.fileId.value);
    fileState.value = stored
      ? { id: stored.id, name: stored.name, ext: stored.ext, path: stored.path, content: stored.content }
      : createDefaultFileState(options);
    savedContent.value = stored?.savedContent ?? fileState.value.content;
    syncingContentToData.value = true;
    data.value = createDataFromContent(options, fileState.value.content);
    syncingContentToData.value = false;
    await filesStore.addFile({ ...fileState.value, type: 'file', savedContent: savedContent.value });
    autoSave.resume();
  }

  void load();

  async function onSave(): Promise<void> {
    await autoSave.save();
  }

  async function onSaveAs(): Promise<void> {
    await autoSave.save();
  }

  async function onRename(): Promise<void> {
    await autoSave.save();
  }

  async function onDelete(): Promise<void> {
    await filesStore.removeFile(options.fileId.value);
  }

  async function onShowInFolder(): Promise<void> {
    await autoSave.save();
  }

  async function onCopyPath(): Promise<void> {
    await autoSave.save();
  }

  async function onCopyRelativePath(): Promise<void> {
    await autoSave.save();
  }

  async function onBlur(): Promise<void> {
    await autoSave.save();
  }

  return {
    fileState,
    data,
    currentTitle,
    actions: {
      onSave,
      onSaveAs,
      onRename,
      onDelete,
      onShowInFolder,
      onCopyPath,
      onCopyRelativePath,
      onBlur
    }
  };
}
```

Task 5 replaces these storage-only action bodies with disk save, save-as, rename, clipboard, and blur-save behavior.

- [ ] **Step 5: Run session tests**

Run: `pnpm test test/hooks/use-file-session.test.ts`

Expected: PASS for helper and default-load tests.

## Task 5: Complete File Actions And Disk Save In `useFileSession`

**Files:**

- Modify: `src/hooks/useFileSession.ts`
- Test: `test/hooks/use-file-session.test.ts`

- [ ] **Step 1: Add save action tests**

Append tests:

```typescript
const writeFileMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/platform', () => ({
  native: {
    writeFile: writeFileMock,
    saveFile: saveFileMock,
    readFile: vi.fn(),
    renameFile: vi.fn(),
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn()
  }
}));

describe('useFileSession actions', (): void => {
  it('writes to existing disk path on save', async (): Promise<void> => {
    const content = createTibisDocumentContent({ type: 'drawing', version: 1, data: createDrawingData() });
    getFileByIdMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content,
      savedContent: content
    });
    writeFileMock.mockResolvedValue(undefined);
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<DrawingData>({
        fileId: ref('drawing-1'),
        kind: 'tibis',
        defaultName: 'Untitled',
        defaultExt: 'tibis',
        defaultData: createDrawingData(),
        type: 'drawing',
        version: 1,
        routeName: 'drawing',
        fallbackRouteName: 'editor'
      });
      await nextTick();
      await session.actions.onSave();
    });
    scope.stop();

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/board.tibis', content);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/hooks/use-file-session.test.ts`

Expected: FAIL because `onSave` has no implementation.

- [ ] **Step 3: Implement action helpers**

Add imports:

```typescript
import { native } from '@/shared/platform';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import { Modal } from '@/utils/modal';
import { getDefaultSavePath, getRecoveredSavePath, parseFileName, replaceFileName } from '@/views/editor/utils/filePath';
import { useSavePolicy } from './useSavePolicy';
```

Add inside `useFileSession`:

```typescript
const editorPreferencesStore = useEditorPreferencesStore();
const savePolicy = useSavePolicy({
  saveStrategy: computed(() => editorPreferencesStore.saveStrategy),
  hasFilePath: computed((): boolean => Boolean(fileState.value.path)),
  isDirty: (): boolean => fileState.value.content !== savedContent.value,
  saveCurrentFileToDisk
});

/**
 * 标记当前内容已保存。
 * @param savedAt - 保存时间
 */
async function markCurrentContentSaved(savedAt = Date.now()): Promise<void> {
  savedContent.value = fileState.value.content;
  tabsStore.clearDirty(options.fileId.value);
  await filesStore.updateFile(options.fileId.value, {
    ...fileState.value,
    savedContent: fileState.value.content,
    savedAt
  });
}

/**
 * 写回已有磁盘路径。
 * @returns 保存结果
 */
async function saveCurrentFileToDisk(): Promise<SaveToDiskResult> {
  const filePath = fileState.value.path;
  if (!filePath) {
    return { status: 'skipped' };
  }

  try {
    await native.writeFile(filePath, fileState.value.content);
    await markCurrentContentSaved();
    return { status: 'saved' };
  } catch (error: unknown) {
    return { status: 'failed', error: error instanceof Error ? error : new Error('save to disk failed') };
  }
}

/**
 * 通过保存对话框保存文件。
 * @returns 是否保存成功
 */
async function saveWithDialog(): Promise<boolean> {
  const defaultPath = fileState.value.path || getDefaultSavePath(fileState.value);
  const savedPath = await native.saveFile(fileState.value.content, undefined, { defaultPath });
  if (!savedPath) {
    return false;
  }

  const { name, ext } = parseFileName(savedPath);
  fileState.value = {
    ...fileState.value,
    path: savedPath,
    name: name || fileState.value.name,
    ext: ext || fileState.value.ext
  };
  await markCurrentContentSaved();
  return true;
}
```

Add real action implementations:

```typescript
async function onSave(): Promise<void> {
  if (fileState.value.path) {
    await saveCurrentFileToDisk();
    return;
  }

  await saveWithDialog();
}

async function onSaveAs(): Promise<void> {
  await saveWithDialog();
}

async function onRename(): Promise<void> {
  const [cancelled, newName] = await Modal.input('重命名', { defaultValue: fileState.value.name, placeholder: '请输入文件名' });
  const normalizedName = String(newName || '').trim();
  if (cancelled || !normalizedName || normalizedName === fileState.value.name) {
    return;
  }

  if (fileState.value.path) {
    const nextPath = replaceFileName(fileState.value.path, normalizedName, fileState.value.ext);
    await native.renameFile(fileState.value.path, nextPath);
    fileState.value = { ...fileState.value, path: nextPath };
  }
  fileState.value = { ...fileState.value, name: normalizedName };
  await autoSave.save();
}

async function onShowInFolder(): Promise<void> {
  if (fileState.value.path) {
    await native.showItemInFolder(fileState.value.path);
  }
}

async function onCopyPath(): Promise<void> {
  if (fileState.value.path) {
    await clipboard(fileState.value.path, { successMessage: '已复制路径', trim: false });
  }
}

async function onCopyRelativePath(): Promise<void> {
  if (!fileState.value.path) {
    return;
  }

  const relativePath = await native.getRelativePath(fileState.value.path);
  await clipboard(relativePath || fileState.value.path, { successMessage: '已复制相对路径', trim: false });
}

async function onBlur(): Promise<void> {
  await savePolicy.handleEditorBlur();
}
```

Use `useClipboard` at the top:

```typescript
import { useClipboard } from '@/hooks/useClipboard';
const { clipboard } = useClipboard();
```

Keep `onDelete` focused on removing the recent-file record:

```typescript
async function onDelete(): Promise<void> {
  await filesStore.removeFile(options.fileId.value);
}
```

- [ ] **Step 4: Wire returned actions**

Return the real functions:

```typescript
actions: {
  onSave,
  onSaveAs,
  onRename,
  onDelete,
  onShowInFolder,
  onCopyPath,
  onCopyRelativePath,
  onBlur
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test test/hooks/use-file-session.test.ts`

Expected: PASS.

## Task 6: Route `.tibis` Files Through `useOpenFile`

**Files:**

- Modify: `src/hooks/useOpenFile.ts`
- Test: `test/hooks/use-open-file.test.ts`

- [ ] **Step 1: Write open-file routing tests**

Create `test/hooks/use-open-file.test.ts`:

```typescript
/**
 * @file use-open-file.test.ts
 * @description 验证统一文件打开入口对 .tibis 文件的路由分流。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useOpenFile } from '@/hooks/useOpenFile';

const routerPushMock = vi.hoisted(() => vi.fn());
const getFileByPathMock = vi.hoisted(() => vi.fn());
const getFileByIdMock = vi.hoisted(() => vi.fn());
const openOrRefreshByPathFromDiskMock = vi.hoisted(() => vi.fn());
const openExistingFileMock = vi.hoisted(() => vi.fn());
const createAndOpenMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock })
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    ensureLoaded: vi.fn(),
    recentFiles: [],
    getFileByPath: getFileByPathMock,
    getFileById: getFileByIdMock,
    openOrRefreshByPathFromDisk: openOrRefreshByPathFromDiskMock,
    openExistingFile: openExistingFileMock,
    createAndOpen: createAndOpenMock,
    removeFile: vi.fn()
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    tabs: []
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    openFile: vi.fn()
  }
}));

describe('useOpenFile', (): void => {
  beforeEach((): void => {
    routerPushMock.mockReset();
    getFileByPathMock.mockReset();
    getFileByIdMock.mockReset();
    openOrRefreshByPathFromDiskMock.mockReset();
    openExistingFileMock.mockReset();
    createAndOpenMock.mockReset();
  });

  it('routes supported drawing tibis files to drawing', async (): Promise<void> => {
    openOrRefreshByPathFromDiskMock.mockResolvedValue({
      type: 'file',
      id: 'drawing-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content: '{"type":"drawing","version":1,"elements":[],"edges":[],"viewport":{"center":{"x":0,"y":0},"zoom":1}}',
      savedContent: ''
    });

    const { openFileByPath } = useOpenFile();
    await openFileByPath('/tmp/board.tibis');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'drawing', params: { id: 'drawing-1' } });
  });

  it('routes invalid tibis files to editor', async (): Promise<void> => {
    openOrRefreshByPathFromDiskMock.mockResolvedValue({
      type: 'file',
      id: 'bad-1',
      path: '/tmp/bad.tibis',
      name: 'bad',
      ext: 'tibis',
      content: '{broken',
      savedContent: ''
    });

    const { openFileByPath } = useOpenFile();
    await openFileByPath('/tmp/bad.tibis');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'editor', params: { id: 'bad-1' } });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test test/hooks/use-open-file.test.ts`

Expected: FAIL because `useOpenFile` still routes all files to editor.

- [ ] **Step 3: Modify `useOpenFile` route resolution**

In `src/hooks/useOpenFile.ts`, import:

```typescript
import { createTibisDocumentContent, resolveTibisDocumentRoute } from '@/hooks/useFileSession';
import type { DrawingData } from '@/components/BDrawing/types';
```

Add helpers:

```typescript
/**
 * 创建空画图数据。
 * @returns 空画图数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 根据文件内容解析目标路由。
 * @param file - 最近文件记录
 * @returns 路由位置
 */
function resolveFileRoute(file: StoredFile): { name: string; params: { id: string } } {
  if (file.ext !== 'tibis') {
    return { name: 'editor', params: { id: file.id } };
  }

  const route = resolveTibisDocumentRoute(file.content);

  return { name: route.routeName, params: { id: file.id } };
}
```

Replace all hard-coded editor pushes:

```typescript
await router.push({ name: 'editor', params: { id: openedFile.id } });
```

with:

```typescript
await router.push(resolveFileRoute(openedFile));
```

Add the new API:

```typescript
/**
 * 创建一个新的未保存画图文件并打开。
 * @returns 创建后的文件记录
 */
async function createNewDrawingFile(): Promise<StoredFile> {
  const drawingData = createEmptyDrawingData();
  const createdFile = await filesStore.createAndOpen({
    type: 'file',
    id: createFileId(),
    path: null,
    name: 'Untitled',
    ext: 'tibis',
    content: createTibisDocumentContent({
      type: 'drawing',
      version: 1,
      data: drawingData
    }),
    savedContent: ''
  });

  await router.push(resolveFileRoute(createdFile));
  return createdFile;
}
```

Return it:

```typescript
return { openFile, openFileById, openFileByPath, openNativeFile, createNewFile, createNewDrawingFile };
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/hooks/use-open-file.test.ts`

Expected: PASS.

## Task 7: Upgrade Drawing Route And Page

**Files:**

- Modify: `src/router/routes/modules/drawing.ts`
- Modify: `src/views/drawing/index.vue`
- Test: `test/router/drawing-route.test.ts`

- [ ] **Step 1: Update route test**

Replace `test/router/drawing-route.test.ts` expectations with:

```typescript
/**
 * @file drawing-route.test.ts
 * @description 验证文件化画图页面路由注册。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import routes from '@/router/routes/modules/drawing';

describe('drawing route', (): void => {
  it('registers a parameterized drawing file route', (): void => {
    const drawingRoute = routes[0];
    const route = {
      params: {
        id: 'drawing-1'
      }
    } as unknown as RouteLocationNormalizedLoaded;

    expect(drawingRoute).toBeTruthy();
    expect(drawingRoute?.path).toBe('drawing/:id?');
    expect(drawingRoute?.name).toBe('drawing');
    expect(drawingRoute?.meta?.hideTab).toBe(true);
    expect(drawingRoute?.meta?.tab?.id?.(route)).toBe('drawing-1');
    expect(drawingRoute?.meta?.tab?.cacheKey?.(route)).toBe('drawing:drawing-1');
  });
});
```

- [ ] **Step 2: Run route test to verify failure**

Run: `pnpm test test/router/drawing-route.test.ts`

Expected: FAIL because route is still `drawing` with a fixed tab.

- [ ] **Step 3: Modify drawing route**

Update `src/router/routes/modules/drawing.ts`:

```typescript
/**
 * @file drawing.ts
 * @description 定义文件化画图工具页面路由。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { customAlphabet } from 'nanoid';
import type { AppRouteRecordRaw } from '../../type';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 将路由参数值规范为单个字符串。
 * @param value - Vue Router 参数值
 * @returns 参数字符串，不存在时返回 undefined
 */
function normalizeRouteParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 解析画图文件标签页 ID。
 * @param route - 当前路由
 * @returns 画图文件 ID
 */
function resolveDrawingTabId(route: RouteLocationNormalizedLoaded): string | undefined {
  return normalizeRouteParam(route.params.id);
}

/**
 * 解析画图 KeepAlive 缓存 key。
 * @param route - 当前路由
 * @returns 缓存 key
 */
function resolveDrawingCacheKey(route: RouteLocationNormalizedLoaded): string | undefined {
  const drawingId = resolveDrawingTabId(route);

  return drawingId ? `drawing:${drawingId}` : undefined;
}

const routes: AppRouteRecordRaw[] = [
  {
    path: 'drawing/:id?',
    name: 'drawing',
    component: () => import('@/views/drawing/index.vue'),
    meta: {
      hideTab: true,
      tab: {
        id: resolveDrawingTabId,
        cacheKey: resolveDrawingCacheKey
      }
    },
    beforeEnter: (to) => {
      if (!to.params.id) {
        return { name: 'drawing', params: { id: nanoid() }, replace: true };
      }
    }
  }
];

export default routes;
```

- [ ] **Step 4: Refactor drawing page**

Update `src/views/drawing/index.vue` script:

```typescript
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import type { DrawingData } from '@/components/BDrawing/types';
import { useFileSession } from '@/hooks/useFileSession';

const route = useRoute();
const fileId = ref(String(route.params.id || ''));

/**
 * 创建空画图数据。
 * @returns 空画图数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    elements: [],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

const session = useFileSession<DrawingData>({
  fileId,
  kind: 'tibis',
  defaultName: 'Untitled',
  defaultExt: 'tibis',
  defaultData: createEmptyDrawingData(),
  type: 'drawing',
  version: 1,
  routeName: 'drawing',
  fallbackRouteName: 'editor'
});

const drawingData = session.data;
```

Update template:

```vue
<main class="drawing-page" tabindex="0" @blur="session.actions.onBlur">
  <BDrawing v-model="drawingData" />
</main>
```

- [ ] **Step 5: Run route test**

Run: `pnpm test test/router/drawing-route.test.ts`

Expected: PASS.

## Task 8: Update Welcome, DropZone, Search Recent, Extensions

**Files:**

- Modify: `src/constants/extensions.ts`
- Modify: `src/views/welcome/index.vue`
- Modify: `src/views/welcome/components/DropZone.vue`
- Modify: `src/components/BSearchRecent/index.vue`
- Test: `test/views/welcome/index.test.ts`
- Test: `test/views/welcome/drop-zone.test.ts`

- [ ] **Step 1: Update welcome test**

Modify `test/views/welcome/index.test.ts` mocks:

```typescript
const createNewDrawingFileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'drawing-1' }));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    createNewFile: vi.fn(),
    createNewDrawingFile: createNewDrawingFileMock,
    openFileById: vi.fn(),
    openNativeFile: vi.fn()
  })
}));
```

Replace assertion:

```typescript
expect(createNewDrawingFileMock).toHaveBeenCalledTimes(1);
expect(routerPushMock).not.toHaveBeenCalledWith({ name: 'drawing' });
```

- [ ] **Step 2: Update DropZone test**

Modify `test/views/welcome/drop-zone.test.ts` useOpenFile mock:

```typescript
const openFileMock = vi.hoisted(() => vi.fn<(_file: unknown) => Promise<unknown>>().mockResolvedValue({ id: 'opened-file' }));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFile: openFileMock,
    openFileByPath: openFileByPathMock
  })
}));
```

Add test:

```typescript
it('creates and opens a dropped tibis draft when no native path is available', async (): Promise<void> => {
  getPathForFileMock.mockReturnValue(null);
  createAndOpenMock.mockResolvedValue({
    type: 'file',
    id: 'draft-1',
    path: null,
    name: 'board',
    ext: 'tibis',
    content: '{"type":"drawing","version":1}',
    savedContent: '{"type":"drawing","version":1}'
  });

  const wrapper = shallowMount(DropZone, {
    slots: {
      default: '<div>content</div>'
    }
  });

  await wrapper.element.dispatchEvent(createDropEvent(new File(['{"type":"drawing","version":1}'], 'board.tibis', { type: 'application/json' })));

  expect(createAndOpenMock).toHaveBeenCalledWith(expect.objectContaining({ ext: 'tibis', name: 'board' }));
  expect(openFileMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1', ext: 'tibis' }));
  expect(routerPushMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run updated tests to verify failure**

Run: `pnpm test test/views/welcome/index.test.ts test/views/welcome/drop-zone.test.ts`

Expected: FAIL because production code is not updated.

- [ ] **Step 4: Update extensions**

Modify `src/constants/extensions.ts`:

```typescript
/** 打开文件时支持的扩展名列表 */
export const OPEN_FILE_EXTENSIONS: string[] = ['md', 'markdown', 'json', 'tibis'];

/** 保存文件时默认的扩展名列表 */
export const SAVE_FILE_EXTENSIONS: string[] = ['md'];

/** Tibis 文件保存扩展名列表 */
export const TIBIS_FILE_EXTENSIONS: string[] = ['tibis'];

/** 打开文件对话框默认过滤器 */
export const OPEN_FILE_FILTER = { name: 'Tibis / Markdown', extensions: OPEN_FILE_EXTENSIONS };

/** 保存文件对话框默认过滤器 */
export const SAVE_FILE_FILTER = { name: 'Markdown', extensions: SAVE_FILE_EXTENSIONS };

/** Tibis 文件保存过滤器 */
export const TIBIS_FILE_FILTER = { name: 'Tibis', extensions: TIBIS_FILE_EXTENSIONS };
```

- [ ] **Step 5: Update welcome page**

In `src/views/welcome/index.vue`, remove direct router dependency for drawing quick action. Destructure:

```typescript
const { createNewFile, createNewDrawingFile, openFileById, openNativeFile } = useOpenFile();
```

Change:

```typescript
async function handleOpenDrawing(): Promise<void> {
  await createNewDrawingFile();
}
```

Add helper for icon:

```typescript
/**
 * 读取最近记录图标。
 * @param record - 最近记录
 * @returns 图标名称
 */
function getRecentRecordIcon(record: RecentRecord): string {
  if (record.type === 'webview') {
    return 'lucide:globe';
  }

  return record.ext === 'tibis' ? 'lucide:pen-line' : 'lucide:file-text';
}
```

Use it in template:

```vue
<Icon :icon="getRecentRecordIcon(record)" width="14" height="14" />
```

- [ ] **Step 6: Update DropZone**

In `src/views/welcome/components/DropZone.vue`, remove `useRouter`; destructure:

```typescript
const { openFile, openFileByPath } = useOpenFile();
```

Change the no-path branch:

```typescript
async function createDroppedDraft(file: File, ext: string): Promise<StoredFile> {
  const content = await file.text();
  const name = file.name.split('.').slice(0, -1).join('.') || file.name;

  return filesStore.createAndOpen({
    type: 'file',
    id: nanoid(),
    path: null,
    name,
    ext,
    content,
    savedContent: content
  });
}
```

Then:

```typescript
const createdFile = await createDroppedDraft(file, ext);
await openFile(createdFile);
```

- [ ] **Step 7: Update BSearchRecent active state**

In `src/components/BSearchRecent/index.vue`, change:

```typescript
const activeId = computed<string>(() => (route.name === 'editor' ? (route.params.id as string) || '' : ''));
```

to:

```typescript
const activeId = computed<string>(() => {
  if (route.name !== 'editor' && route.name !== 'drawing') {
    return '';
  }

  return (route.params.id as string) || '';
});
```

- [ ] **Step 8: Run tests**

Run: `pnpm test test/views/welcome/index.test.ts test/views/welcome/drop-zone.test.ts`

Expected: PASS.

## Task 9: Changelog And Verification

**Files:**

- Create or modify: `changelog/2026-06-15.md`

- [ ] **Step 1: Add changelog**

Add this bullet under the existing `## Changed` section in `changelog/2026-06-15.md`:

```markdown
- 新增通用文件会话封装，支持 `.tibis` 画图文件的最近文件自动保存、磁盘保存策略和打开分流。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/hooks/use-save-policy.test.ts test/hooks/use-file-auto-save.test.ts test/hooks/use-file-session.test.ts test/hooks/use-open-file.test.ts test/router/drawing-route.test.ts test/views/welcome/index.test.ts test/views/welcome/drop-zone.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Run BDrawing regression tests**

Run:

```bash
pnpm test test/components/BDrawing/use-model-sync.test.ts test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-canvas.component.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exits with code 0.

- [ ] **Step 5: Run lint**

Run:

```bash
pnpm lint
```

Expected: exits with code 0. If lint modifies files, inspect the diff before final summary.

- [ ] **Step 6: Final git status**

Run:

```bash
git status --short
```

Expected: changed files include the implementation, tests, changelog, this plan, and the spec. Do not commit until the user asks for the unified commit.
