# 最近记录（Recent Records）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"最近文件"扩展为"最近记录"，支持混合展示文件记录和 WebView 网页记录。

**Architecture:** 在现有 `StoredFile` 类型上追加 `type` 判别字段，新增 `WebviewRecord` 类型，组成 `RecentRecord` 联合类型。存储层、files store、UI 组件逐层适配。WebView 导航完成时自动写入记录。

**Tech Stack:** TypeScript, Vue 3, Pinia, electron-store, Vitest

---

### Task 1: 类型系统 — 新增 `WebviewRecord` 和 `RecentRecord`

**Files:**
- Modify: `src/shared/storage/files/types.ts`
- Modify: `src/shared/storage/files/index.ts`

- [ ] **Step 1: 在 `types.ts` 中添加新类型定义**

在 `StoredFile` 接口中添加 `type: 'file'` 字段，新增 `WebviewRecord` 接口和 `RecentRecord` 联合类型：

```typescript
/**
 * @file types.ts
 * @description 定义最近文件存储记录及其时间元数据结构。
 */

/**
 * 文件主记录。
 */
export interface StoredFile {
  /** 记录类型 */
  type: 'file';
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
 * WebView 网页记录。
 */
export interface WebviewRecord {
  /** 记录类型 */
  type: 'webview';
  /** 记录唯一标识（URL 的 hash 值，用于去重） */
  id: string;
  /** 打开的 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 首次打开该 URL 的时间戳（记录首次进入列表的时刻） */
  createdAt: number;
  /** 最近一次打开/跳转到该 URL 的时间戳 */
  openedAt: number;
  /** 网站 favicon URL，预留字段，当前版本不写入 */
  favicon?: string;
}

/**
 * 最近记录联合类型（文件 + WebView 网页）。
 */
export type RecentRecord = StoredFile | WebviewRecord;
```

- [ ] **Step 2: 更新 `index.ts` 导出**

```typescript
export * from './recent';
export type * from './types';
```

（无需改动，`export type *` 已覆盖所有类型导出）

- [ ] **Step 3: 运行 TypeScript 类型检查**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/storage/files/types.ts src/shared/storage/files/index.ts
git commit -m "feat: add WebviewRecord and RecentRecord types for mixed recent records"
```

---

### Task 2: 存储层 — `recentFilesStorage` 支持 webview 记录

**Files:**
- Modify: `src/shared/storage/files/recent.ts`
- Create: `test/shared/storage/files/recent-webview.test.ts`

- [ ] **Step 1: 编写测试 — webview 记录的添加、去重、排序**

创建 `test/shared/storage/files/recent-webview.test.ts`：

```typescript
/**
 * @file recent-webview.test.ts
 * @description 验证 recentFilesStorage 对 webview 记录的添加、去重、touch 和混合排序。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredFile, WebviewRecord } from '@/shared/storage/files/types';

interface LocalforageMock {
  config: ReturnType<typeof vi.fn>;
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

const mockState = vi.hoisted(() => {
  return {
    files: [] as (StoredFile | WebviewRecord)[]
  };
});

const localforageMock = vi.hoisted<LocalforageMock>(() => {
  return {
    config: vi.fn(),
    getItem: vi.fn(async () => mockState.files),
    setItem: vi.fn(async (_key: string, value: (StoredFile | WebviewRecord)[]) => {
      mockState.files = value.map((record) => ({ ...record }));
      return value;
    }),
    clear: vi.fn(async () => {
      mockState.files = [];
    })
  };
});

vi.mock('localforage', () => ({
  default: localforageMock
}));

vi.mock('@/shared/platform/electron-api', () => ({
  hasElectronAPI: (): boolean => false,
  getElectronAPI: (): never => {
    throw new Error('Electron API is not available');
  }
}));

describe('recentFilesStorage webview support', () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.files = [];
    localforageMock.config.mockClear();
    localforageMock.getItem.mockClear();
    localforageMock.setItem.mockClear();
    localforageMock.clear.mockClear();
  });

  it('adds a webview record via addWebviewRecord', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const { recentFilesStorage } = await import('@/shared/storage/files/recent');

    await recentFilesStorage.addWebviewRecord('https://example.com', 'Example Site');

    expect(mockState.files).toHaveLength(1);
    expect(mockState.files[0]?.type).toBe('webview');
    expect((mockState.files[0] as WebviewRecord).url).toBe('https://example.com');
    expect((mockState.files[0] as WebviewRecord).title).toBe('Example Site');
    expect(mockState.files[0]?.openedAt).toBe(1000);
    expect(mockState.files[0]?.createdAt).toBe(1000);

    nowSpy.mockRestore();
  });

  it('deduplicates webview records by id (same URL = same record)', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const { recentFilesStorage } = await import('@/shared/storage/files/recent');

    await recentFilesStorage.addWebviewRecord('https://example.com', 'Example Site');
    await recentFilesStorage.addWebviewRecord('https://example.com', 'Updated Title');

    expect(mockState.files).toHaveLength(1);
    expect((mockState.files[0] as WebviewRecord).title).toBe('Updated Title');
    expect(mockState.files[0]?.openedAt).toBe(2000);

    nowSpy.mockRestore();
  });

  it('touchWebviewRecord updates openedAt', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(3000);
    const { recentFilesStorage } = await import('@/shared/storage/files/recent');

    await recentFilesStorage.addWebviewRecord('https://example.com', 'Example Site');
    const id = (mockState.files[0] as WebviewRecord).id;
    const touched = await recentFilesStorage.touchWebviewRecord(id);

    expect(touched.openedAt).toBe(3000);
    expect(mockState.files[0]?.openedAt).toBe(3000);

    nowSpy.mockRestore();
  });

  it('sorts mixed file and webview records by openedAt desc', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2000);
    const { recentFilesStorage } = await import('@/shared/storage/files/recent');

    await recentFilesStorage.addWebviewRecord('https://a.com', 'Site A');
    nowSpy.mockReturnValue(3000);
    await recentFilesStorage.addWebviewRecord('https://b.com', 'Site B');

    const allRecords = await recentFilesStorage.getAllRecentFiles();
    expect(allRecords.map((r) => (r as WebviewRecord).url)).toEqual(['https://b.com', 'https://a.com']);

    nowSpy.mockRestore();
  });

  it('migrates legacy records without type field to type: file', async () => {
    mockState.files = [
      {
        id: 'legacy',
        path: '/old.md',
        name: 'old',
        ext: 'md',
        content: 'content',
        openedAt: 100
      } as unknown as StoredFile
    ];

    const { recentFilesStorage } = await import('@/shared/storage/files/recent');
    const files = await recentFilesStorage.getAllRecentFiles();

    expect(files[0]?.type).toBe('file');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm exec vitest run test/shared/storage/files/recent-webview.test.ts
```

预期：失败，因为 `addWebviewRecord` / `touchWebviewRecord` 尚未实现。

- [ ] **Step 3: 实现存储层 webview 方法**

修改 `src/shared/storage/files/recent.ts`：

在最顶部导入区域，将类型导入改为：

```typescript
import type { StoredFile, WebviewRecord, RecentRecord } from './types';
import { isEqual, isNumber, noop } from 'lodash-es';
import { getElectronAPI } from '../../platform/electron-api';
import { hashString } from '../../utils/hash';
```

在 `readRecentFiles` 函数中添加迁移逻辑（在 `normalizeStoredFiles` 调用之后）：

```typescript
/**
 * 读取原始最近记录数组并执行必要的模型归一化。
 * 若归一化后数据有变化，立即回写以保持存储一致性。
 * 对缺失 type 字段的旧记录自动补 'file'。
 */
async function readRecentFiles(): Promise<RecentRecord[]> {
  const stored = (await getElectronStoreValue<(StoredFile | WebviewRecord)[]>(RECENT_FILES_KEY)) ?? [];
  const { files, changed } = normalizeStoredFiles(stored as StoredFile[]);
  // 迁移：旧记录补 type: 'file'
  let migrated = false;
  const patchedFiles = files.map((file) => {
    if (!('type' in file) || !file.type) {
      migrated = true;
      return { ...file, type: 'file' as const };
    }
    return file;
  });
  if (changed || migrated) {
    await setElectronStoreValue(RECENT_FILES_KEY, patchedFiles);
  }
  return patchedFiles;
}
```

修改 `sortRecentFiles` 签名和排序逻辑，支持 webview 记录：

```typescript
/**
 * 依据 openedAt 降序排列记录。file 记录回退到 modifiedAt → createdAt；
 * webview 记录仅按 openedAt 排序（无 modifiedAt），缺失时按 0 处理。
 */
export function sortRecentFiles(records: RecentRecord[]): RecentRecord[] {
  return [...records].sort((a, b) => {
    const aTime = normalizeTime(a.openedAt);
    const bTime = normalizeTime(b.openedAt);
    const diff = bTime - aTime;

    if (diff !== 0) return diff;

    // file 记录有 modifiedAt / createdAt 回退，webview 记录没有
    if (a.type === 'file' && b.type === 'file') {
      return (
        normalizeTime(b.modifiedAt) - normalizeTime(a.modifiedAt) ||
        normalizeTime(b.createdAt) - normalizeTime(a.createdAt)
      );
    }

    return 0;
  });
}
```

在 `recentFilesStorage` 对象中，修改 `addRecentFile` 方法，确保新记录自带 `type: 'file'`：

```typescript
async addRecentFile(file: StoredFile): Promise<void> {
    await enqueueWrite(async () => {
      const files = await readRecentFiles();
      const now = Date.now();
      const normalized = normalizeStoredFile({
        ...file,
        type: 'file', // 确保 type 字段存在
        createdAt: file.createdAt ?? now,
        openedAt: file.openedAt ?? now
      });
      // ... 去重前置逻辑不变
    });
},
```

然后新增 `addWebviewRecord` 和 `touchWebviewRecord` 方法：

```typescript
/**
 * 添加或覆盖 webview 记录。
 * 根据 URL 生成 hash id，同 URL 自动去重（更新 title 和 openedAt）。
 */
async addWebviewRecord(url: string, title: string): Promise<WebviewRecord> {
  return enqueueWrite(async () => {
    const files = await readRecentFiles();
    const id = hashString(url);
    const now = Date.now();

    // 查找是否已有该 URL 的记录
    const existingIndex = files.findIndex((item) => item.type === 'webview' && (item as WebviewRecord).id === id);
    if (existingIndex !== -1) {
      // 更新已有记录
      const existing = files[existingIndex] as WebviewRecord;
      const updated: WebviewRecord = { ...existing, title, openedAt: now };
      files[existingIndex] = updated;
      await writeRecentFiles(files);
      return updated;
    }

    // 新建记录
    const record: WebviewRecord = {
      type: 'webview',
      id,
      url,
      title,
      createdAt: now,
      openedAt: now
    };
    files.unshift(record);
    await writeRecentFiles(files);
    return record;
  });
},

/**
 * 更新 webview 记录的 openedAt 为当前时间。
 * @param id - webview 记录 ID
 * @returns 更新后的记录
 */
async touchWebviewRecord(id: string): Promise<WebviewRecord> {
  return enqueueWrite(async () => {
    const files = await readRecentFiles();
    const index = files.findIndex((item) => item.type === 'webview' && item.id === id);

    if (index === -1) throw new Error(`Webview record not found: ${id}`);

    const record = files[index] as WebviewRecord;
    const touched: WebviewRecord = { ...record, openedAt: Date.now() };
    files.splice(index, 1);
    files.unshift(touched);
    await writeRecentFiles(files);
    return touched;
  });
},
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm exec vitest run test/shared/storage/files/recent-webview.test.ts
```

预期：全部通过。

- [ ] **Step 5: 确保已有测试仍然通过**

```bash
pnpm exec vitest run test/shared/storage/files/recent-opened-at-sort.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage/files/recent.ts test/shared/storage/files/recent-webview.test.ts
git commit -m "feat: add webview record support to recentFilesStorage with migration"
```

---

### Task 3: files store — 新增 webview actions 和 getter

**Files:**
- Modify: `src/stores/workspace/files.ts`

- [ ] **Step 1: 运行已有测试确认基线**

```bash
pnpm exec vitest run test/stores/files-opened-at-actions.test.ts
```

- [ ] **Step 2: 修改 files store 添加 webview 支持**

修改 `src/stores/workspace/files.ts`：

更新导入：

```typescript
import type { StoredFile, WebviewRecord, RecentRecord } from '@/shared/storage';
import { recentFilesStorage, sortRecentFiles } from '@/shared/storage';
import { hashString } from '@/shared/utils/hash';
```

修改 `FilesState` 接口，recentFiles 改为 recentRecords：

```typescript
export interface FilesState {
  /** 最近记录列表（文件 + webview），始终来自 storage 派生排序结果。 */
  recentRecords: RecentRecord[] | null;
}
```

修改 state 初始值：

```typescript
state: (): FilesState => ({
  recentRecords: null
}),
```

新增 getter（用于计算属性）：

注意：Pinia 的 `state` 和 `getters` 是分开的，不能用 Vue 的 `computed`。在 options API 风格的 defineStore 中，getter 定义在 `getters` 对象中：

```typescript
getters: {
  /**
   * 仅 file 类型的记录（兼容旧调用方）。
   */
  recentFiles(state: FilesState): StoredFile[] | null {
    return state.recentRecords
      ? (state.recentRecords.filter((r): r is StoredFile => r.type === 'file'))
      : null;
  },

  /**
   * 前 3 条混合记录（供欢迎页使用）。
   */
  topRecentRecords(state: FilesState): RecentRecord[] {
    return state.recentRecords?.slice(0, 3) ?? [];
  }
},
```

修改所有 actions 中的 `this.recentFiles` 为 `this.recentRecords`：

`refreshRecentFiles`：

```typescript
async refreshRecentFiles(): Promise<RecentRecord[]> {
  const files = await recentFilesStorage.getAllRecentFiles();
  this.recentRecords = files;
  return files;
},
```

`patchCache`：

```typescript
patchCache(updatedFile: RecentRecord): void {
  if (this.recentRecords === null) return;
  const filtered = this.recentRecords.filter((f) => f.id !== updatedFile.id);
  filtered.unshift(updatedFile);
  this.recentRecords = sortRecentFiles(filtered);
},
```

`removeCacheEntries`：

```typescript
removeCacheEntries(ids: string[]): void {
  if (this.recentRecords === null) return;
  const idSet = new Set(ids);
  this.recentRecords = this.recentRecords.filter((f) => !idSet.has(f.id));
},
```

`ensureLoaded`：

```typescript
async ensureLoaded(): Promise<void> {
  if (this.recentRecords !== null) return;

  await this.refreshRecentFiles();
  await this.syncRecentFiles();
},
```

`getFileById` — 使用 `recentFiles` getter（仅 file 类型）：

```typescript
async getFileById(id: string): Promise<StoredFile | undefined> {
  await this.ensureLoaded();

  return this.recentFiles?.find((file) => file.id === id);
},
```

`getFileByPath` — 使用 `recentFiles` getter：

```typescript
async getFileByPath(path: string): Promise<StoredFile | undefined> {
  await this.ensureLoaded();

  return this.recentFiles?.find((file) => file.path === path);
},
```

`openExistingFile` — 返回值类型改为显式 `Promise<RecentRecord>`，保持方法体不变：

`openOrCreateByPath` — 方法体中 `findOpenTabPathByFilePath` 使用 `recentFiles` getter：

```typescript
const matchedFileId = this.recentFiles?.find((f) => f.path === path)?.id;
```

注意 `openOrCreateByPath` 和 `openOrRefreshByPathFromDisk` 内部使用的 `this.getFileByPath` 已经用 `recentFiles` getter，不受影响。

新增 `addWebviewRecord` action：

```typescript
/**
 * 添加或更新 webview 记录。
 * @param url - 打开的 URL
 * @param title - 页面标题
 * @returns 创建或更新后的 webview 记录
 */
async addWebviewRecord(url: string, title: string): Promise<WebviewRecord> {
  const result = await recentFilesStorage.addWebviewRecord(url, title);
  this.patchCache(result);
  this.syncRecentFiles();
  return result;
},
```

新增 `touchWebviewRecord` action：

```typescript
/**
 * 更新 webview 记录的 openedAt。
 * @param id - webview 记录 ID
 * @returns 更新后的 webview 记录
 */
async touchWebviewRecord(id: string): Promise<WebviewRecord> {
  const result = await recentFilesStorage.touchWebviewRecord(id);
  this.patchCache(result);
  this.syncRecentFiles();
  return result;
},
```

修改 `syncRecentFiles` — 只同步 file 类型给系统：

```typescript
async syncRecentFiles(): Promise<void> {
  if (!native.syncRecentFiles || this.recentRecords === null) return;

  const fileRecords = this.recentRecords.filter((r): r is StoredFile => r.type === 'file');

  await native.syncRecentFiles(
    fileRecords.map((file) => ({
      id: file.id,
      name: file.name,
      ext: file.ext,
      path: file.path
    }))
  );
},
```

`clearFiles` 中的 `this.recentFiles = []` 改为 `this.recentRecords = []`。

- [ ] **Step 3: 更新测试文件**

修改 `test/stores/files-opened-at-actions.test.ts`：

存储状态中的文件记录添加 `type: 'file'` 字段。将所有 `storageState.files` 中的 `StoredFile[]` 类型改为包含 `type: 'file'`。

修改 mock storage 的 `getAllRecentFiles`：

```typescript
getAllRecentFiles: vi.fn(async () => {
  return storageState.files
    .slice()
    .sort((left, right) => (right.openedAt ?? 0) - (left.openedAt ?? 0))
    .map((file) => ({ ...file, type: 'file' as const }));
}),
```

测试中访问 `store.recentFiles` 改为 `store.recentRecords` 并过滤 file 类型，或改用 `store.recentFiles`（getter）。由于我们添加了 `recentFiles` getter 作为便捷访问器，测试中使用 `store.recentFiles` 应该正常工作（Pinia getter 在 options API 风格中通过 `store.recentFiles` 访问）。

更新断言中 `store.recentFiles?.map(...)` 行 — 保持原样，因为 `recentFiles` getter 仅返回 file 类型。

- [ ] **Step 4: 运行测试验证**

```bash
pnpm exec vitest run test/stores/files-opened-at-actions.test.ts
```

- [ ] **Step 5: TypeScript 类型检查**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/workspace/files.ts test/stores/files-opened-at-actions.test.ts
git commit -m "feat: add webview actions and mixed records support to files store"
```

---

### Task 4: 补充适配 — 其他引用 `StoredFile` / `RecentRecord` 的文件

**Files:**
- Modify: `src/hooks/useOpenFile.ts`
- Modify: `src/components/BChatSidebar/utils/fileReferenceContext.ts`

- [ ] **Step 1: `useOpenFile.ts` 添加 `type: 'file'` 到新记录**

修改 `createNewFile` 中的 `StoredFile` 对象，添加 `type: 'file'`：

```typescript
async function createNewFile(): Promise<StoredFile> {
  const createdFile = await filesStore.createAndOpen({
    type: 'file',
    id: createFileId(),
    path: null,
    name: 'Untitled',
    ext: 'md',
    content: '',
    savedContent: ''
  });
  // ...
}
```

- [ ] **Step 2: `fileReferenceContext.ts` 处理类型联合**

修改 `extractFileReferenceLines` 中 `getAllRecentFiles` 的返回值处理。由于返回类型变为 `RecentRecord[]`，需要确保 `file.path` 访问安全：

```typescript
// 通过文件路径查找（仅 file 类型记录有 path 字段）
const files = await recentFilesStorage.getAllRecentFiles();
storedFile = (files.find((item) => item.type === 'file' && item.path === path) as StoredFile | undefined) || null;
```

- [ ] **Step 3: TypeScript 类型检查**

```bash
pnpm exec tsc --noEmit
```

预期：零错误。

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useOpenFile.ts src/components/BChatSidebar/utils/fileReferenceContext.ts
git commit -m "fix: add type:file to new records and filter by type in fileReferenceContext"
```

---

### Task 5: 欢迎页 — 「最近文件」→「最近记录」

**Files:**
- Modify: `src/views/welcome/index.vue`

- [ ] **Step 1: 修改欢迎页 UI**

修改 `src/views/welcome/index.vue`：

模板中，将 `topRecentFiles` 改为 `topRecentRecords`（来自 store getter）；

```html
<div v-if="topRecentRecords.length" class="recent-files-section">
  <div class="recent-files-title">最近记录</div>
  <div class="recent-files-list">
    <div
      v-for="record in topRecentRecords"
      :key="record.id"
      class="recent-file-item"
      @click="record.type === 'file' ? handleOpenRecentFile(record.id) : handleOpenWebview(record.url)"
    >
      <div class="recent-file-icon">
        <Icon :icon="record.type === 'file' ? 'lucide:file-text' : 'lucide:globe'" width="14" height="14" />
      </div>
      <div class="recent-file-info">
        <div class="recent-file-name">{{ record.type === 'file' ? resolveFileTitle(record) : record.title }}</div>
        <div class="recent-file-path">{{ record.type === 'file' ? (record.path || '未保存文件') : record.url }}</div>
      </div>
    </div>
  </div>
```

script 中，修改 computed 和新增方法：

```typescript
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import BSearchRecent from '@/components/BSearchRecent/index.vue';
import { useOpenFile } from '@/hooks/useOpenFile';
import { useFilesStore } from '@/stores/workspace/files';
import { resolveFileTitle } from '@/utils/file/title';
import DropZone from './components/DropZone.vue';

const router = useRouter();
const filesStore = useFilesStore();
const { createNewFile, openFileById, openNativeFile } = useOpenFile();
const visibleSearchRecent = ref(false);

const topRecentRecords = computed(() => filesStore.topRecentRecords);
```

新增 webview 打开方法：

```typescript
/**
 * 在 webview 中打开 URL。
 * @param url - 目标 URL
 */
function handleOpenWebview(url: string): void {
  router.push({ name: 'webview-web', query: { url: encodeURIComponent(url) } });
}
```

- [ ] **Step 2: 运行已有测试（欢迎页无测试，跳过这一步）**

- [ ] **Step 3: TypeScript 类型检查 + Lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add src/views/welcome/index.vue
git commit -m "feat: update welcome page to show mixed recent records"
```

---

### Task 6: BSearchRecent — 支持混合记录搜索与展示

**Files:**
- Modify: `src/components/BSearchRecent/index.vue`
- Modify: `src/components/BSearchRecent/types.ts`
- Modify: `test/components/BSearchRecent/index.test.ts`

- [ ] **Step 1: 先运行已有测试确认基线**

```bash
pnpm exec vitest run test/components/BSearchRecent/index.test.ts
```

- [ ] **Step 2: 修改 BSearchRecent 组件**

修改 `src/components/BSearchRecent/index.vue`：

更新导入：

```typescript
import type { BSearchRecentProps, AbsolutePathSearchResult, NormalizedItem, UrlSearchResult } from './types';
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BModal from '@/components/BModal/index.vue';
import BScrollbar from '@/components/BScrollbar/index.vue';
import { useOpenFile } from '@/hooks/useOpenFile';
import { native } from '@/shared/platform';
import type { RecentRecord, StoredFile, WebviewRecord } from '@/shared/storage';
import { useFilesStore } from '@/stores/workspace/files';
import { useTabsStore } from '@/stores/workspace/tabs';
import { resolveFileTitle } from '@/utils/file/title';
import { createNamespace } from '@/utils/namespace';
```

修改搜索 placeholder：

```html
<AInput v-model:value="keyword" placeholder="搜索最近记录" @keydown.enter.prevent="handleEnter" @keydown.esc.prevent="handleClose" />
```

修改空状态文案：

```html
<div v-else :class="bem('empty')">没有匹配的最近记录</div>
```

修改 `filteredFiles` 计算属性为 `filteredRecords`，支持 webview 搜索：

```typescript
const filteredRecords = computed<RecentRecord[]>(() => {
  const records = filesStore.recentRecords ?? [];
  const term = keyword.value.trim();
  if (!term) return records;

  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return records.filter((record) => {
    if (record.type === 'file') {
      const searchable = [resolveFileTitle(record), record.name, record.ext, record.path, record.content].filter(Boolean).join('\0');
      return re.test(searchable);
    }
    // webview 记录按 url + title 搜索
    const searchable = [record.url, record.title].filter(Boolean).join('\0');
    return re.test(searchable);
  });
});
```

修改 enter 处理中的 `filteredFiles` 引用为 `filteredRecords`：

```typescript
const first = filteredRecords.value[0];
```

修改 `searchResultItems` computed 中的渲染逻辑，webview 记录项：

```typescript
for (const record of filteredRecords.value) {
  // 若绝对路径候选与某条文件记录路径重合，则跳过
  if (candidate && record.type === 'file' && record.path === candidate.path) continue;

  if (record.type === 'webview') {
    items.push({
      key: record.id,
      title: record.title,
      pathLabel: record.url,
      pathClass: '',
      meta: '',
      isActive: false,
      removable: true,
      onSelect: () => handleOpenUrl(record.url),
      onRemove: () => handleRemoveWebview(record.id)
    });
  } else {
    const isUnsaved = !record.path;
    items.push({
      key: record.id,
      title: resolveFileTitle(record),
      pathLabel: isUnsaved ? '未保存文件' : record.path!,
      pathClass: isUnsaved ? 'is-unsaved' : '',
      meta: '',
      isActive: record.id === activeId.value,
      removable: true,
      onSelect: () => handleSelect(record),
      onRemove: () => handleRemoveFile(record.id)
    });
  }
}
```

新增 `handleRemoveWebview` 函数（仅删除记录，不删 tab）：

```typescript
/**
 * 删除 webview 记录（webview id 与 tab id 体系不同，不调 tabsStore.removeTab）。
 * @param id - webview 记录 ID
 */
async function handleRemoveWebview(id: string): Promise<void> {
  await filesStore.removeFile(id);
  emit('remove', id);
}
```

重命名原 `handleRemove` 为 `handleRemoveFile`（保持原有 file + tab 清理逻辑）：

```typescript
async function handleRemoveFile(id: string): Promise<void> {
  await filesStore.removeFile(id);
  tabsStore.removeTab(id);
  emit('remove', id);
}
```

- [ ] **Step 3: 更新 BSearchRecent types**

修改 `types.ts`，`NormalizedItem` 中保持现有字段不变即可（webview 记录也用相同的结构，通过 `onSelect` 和 `onRemove` 闭包区分行为）。

- [ ] **Step 4: 更新测试**

修改 `test/components/BSearchRecent/index.test.ts`：

mock store 中 `recentFiles` 改为 `recentRecords` 并添加 `type: 'file'`：

```typescript
const filesStoreMock = vi.hoisted(() => ({
  recentRecords: [] as (StoredFile | { type: 'webview'; id: string; url: string; title: string; createdAt: number; openedAt: number })[],
  recentFiles: [] as StoredFile[],
  ensureLoaded: vi.fn(async () => undefined),
  removeFile: vi.fn(async () => undefined)
}));
```

更新 `createStoredFile` 添加 `type: 'file'`：

```typescript
function createStoredFile(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    type: 'file',
    id: overrides.id ?? 'file_a',
    // ...
  };
}
```

更新 `beforeEach` 中设置 mock 数据时使用 `recentRecords`：

```typescript
filesStoreMock.recentRecords = [createStoredFile()];
filesStoreMock.recentFiles = [createStoredFile()];
```

- [ ] **Step 5: 运行测试验证**

```bash
pnpm exec vitest run test/components/BSearchRecent/index.test.ts
```

- [ ] **Step 6: TypeScript + Lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
git add src/components/BSearchRecent/index.vue src/components/BSearchRecent/types.ts test/components/BSearchRecent/index.test.ts
git commit -m "feat: update BSearchRecent to support mixed file and webview records"
```

---

### Task 7: web webview — 导航时写入最近记录

**Files:**
- Modify: `src/views/webview/web/index.vue`

- [ ] **Step 1: 在 web webview 中添加写入逻辑**

修改 `src/views/webview/web/index.vue`：

添加导入：

```typescript
import { useFilesStore } from '@/stores/workspace/files';
import { debounce } from 'lodash-es';
```

在 `<script setup>` 中获取 store 并创建写入函数：

```typescript
const filesStore = useFilesStore();

/**
 * 将当前 webview 页面写入最近记录（debounce 防抖）。
 */
const writeRecentWebviewRecord = debounce(() => {
  const url = webview.state.value.url;
  const title = webview.state.value.title;
  if (!url) return;
  filesStore.addWebviewRecord(url, title || url).catch(console.error);
}, 300);
```

在已有的 `handleDidNavigate` handler 中追加写入调用。查看现有代码，`handleDidNavigate` 在第 139 行的 `webviewEventMap` 中绑定。需要在 handler 末尾追加 `writeRecentWebviewRecord()`。

由于 `handleDidNavigate` 是 `webview` 对象的方法，不能直接修改其内部。改为在 `webviewEventMap` 中追加新的事件监听器：

```typescript
const webviewEventMap: Array<{ name: string; handler: EventListener | ((event: Event) => void); useCapture?: boolean }> = [
  // ... 现有事件
  { name: 'did-navigate', handler: writeRecentWebviewRecord as EventListener },
  { name: 'did-navigate-in-page', handler: writeRecentWebviewRecord as EventListener },
];
```

等等——这样会和已有的 `did-navigate` handler 冲突。更好的方式是在 `handleDidNavigate` 调用后追加写入。由于 `handleDidNavigate` 是在 `useWebView` hook 中定义的，不能修改外部 hook。

替代方案：使用 `watch` 监听 `url` 和 `title` 变化后写入：

```typescript
/**
 * 监听 webview URL 和 title 变化，写入最近记录。
 */
watch(
  [() => webview.state.value.url, () => webview.state.value.title],
  ([url, title]) => {
    if (!url) return;
    writeRecentWebviewRecord();
  }
);
```

但这个方案可能触发过于频繁。更好的方案是使用 `watch` 监听 `isLoading` 从 true 变为 false：

```typescript
/**
 * 监听 webview 加载完成，写入最近记录。
 */
watch(
  () => webview.state.value.isLoading,
  (newVal, oldVal) => {
    if (oldVal === true && newVal === false) {
      writeRecentWebviewRecord();
    }
  }
);
```

这样 native 和 web 实现可以用一致的模式。但这也有问题——web 端 `handleDidNavigate` 更新了 state 中的 url 等，`isLoading` 不一定在 url 更新后立即变 false。

最终方案：使用 `watch` 同时监听 `url` 和 `isLoading`：

```typescript
/**
 * 将 webview 页面写入最近记录。
 * 当 isLoading 从 true 变为 false 且 url 不为空时触发，debounce 300ms 防抖。
 */
const writeRecentWebviewRecord = debounce(() => {
  const { url, title } = webview.state.value;
  if (!url) return;
  filesStore.addWebviewRecord(url, title || url).catch(console.error);
}, 300);

watch(
  () => webview.state.value.isLoading,
  (newVal, oldVal) => {
    if (oldVal === true && newVal === false) {
      writeRecentWebviewRecord();
    }
  }
);
```

- [ ] **Step 2: TypeScript + Lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/views/webview/web/index.vue
git commit -m "feat: write webview page to recent records on navigation"
```

---

### Task 8: native webview — 导航时写入最近记录

**Files:**
- Modify: `src/views/webview/native/index.vue`

- [ ] **Step 1: 在 native webview 中添加写入逻辑**

修改 `src/views/webview/native/index.vue`：

添加导入：

```typescript
import { debounce } from 'lodash-es';
import { useFilesStore } from '@/stores/workspace/files';
```

在 `<script setup>` 中添加：

```typescript
const filesStore = useFilesStore();

/**
 * 将当前 webview 页面写入最近记录。
 * 当 isLoading 从 true 变为 false 且 url 不为空时触发，debounce 300ms 防抖。
 */
const writeRecentWebviewRecord = debounce(() => {
  const { url, title } = webview.state.value;
  if (!url) return;
  filesStore.addWebviewRecord(url, title || url).catch(console.error);
}, 300);

watch(
  () => webview.state.value.isLoading,
  (newVal, oldVal) => {
    if (oldVal === true && newVal === false) {
      writeRecentWebviewRecord();
    }
  }
);
```

需要从 vue 导入 `watch`（已有）。

- [ ] **Step 2: TypeScript + Lint**

```bash
pnpm exec tsc --noEmit && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/views/webview/native/index.vue
git commit -m "feat: write native webview page to recent records on navigation"
```

---

### Task 9: 全量验证

- [ ] **Step 1: 运行全部测试**

```bash
pnpm test
```

- [ ] **Step 2: TypeScript 类型检查**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Lint**

```bash
pnpm lint && pnpm lint:style
```

- [ ] **Step 4: 检查是否有遗漏的类型引用**

```bash
pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"
```

预期为 0。

- [ ] **Step 5: 编写 changelog**

创建或更新 `changelog/2026-06-03.md`：

```markdown
# 2026-06-03

## Added
- 最近记录支持 WebView 网页记录（混合文件 + 网页）
- WebView 导航完成时自动写入最近记录
- `WebviewRecord` 类型和 `RecentRecord` 联合类型

## Changed
- 「最近文件」统一更名为「最近记录」
- `filesStore.recentFiles` 改名为 `recentRecords`，新增 `recentFiles` getter
- `recentFilesStorage` 扩展支持 webview 记录的增删改查
- 欢迎页和 BSearchRecent 搜索弹窗支持混合类型展示
```

- [ ] **Step 6: Commit changelog**

```bash
git add changelog/2026-06-03.md
git commit -m "docs: add changelog for recent records feature"
```
