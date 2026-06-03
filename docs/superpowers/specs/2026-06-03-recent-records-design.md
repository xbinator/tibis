# 最近记录（Recent Records）设计

## 概述

将现有"最近文件"扩展为"最近记录"，除了编辑器打开的文件外，也将 WebView 打开的网页纳入记录列表，按最近打开时间混合排序展示。

---

## 类型系统

### `src/shared/storage/files/types.ts`

保持 `StoredFile` 原名，追加 `type: 'file'` 判别字段，新增 `WebviewRecord` 和联合类型 `RecentRecord`：

```typescript
interface StoredFile {
  type: 'file'
  id: string
  path: string | null
  content: string
  savedContent?: string
  name: string
  ext: string
  createdAt?: number
  openedAt?: number
  modifiedAt?: number
  savedAt?: number
  pinnedAt?: number
  workspaceId?: string | null
}

interface WebviewRecord {
  type: 'webview'
  id: string
  url: string
  title: string
  /** 首次打开该 URL 的时间戳（记录首次进入列表的时刻） */
  createdAt: number
  /** 最近一次打开/跳转到该 URL 的时间戳 */
  openedAt: number
  /** 网站 favicon URL，预留字段，当前版本不写入 */
  favicon?: string
}

type RecentRecord = StoredFile | WebviewRecord
```

---

## 存储层

### `src/shared/storage/files/recent.ts`

- 存储 key 保持 `recent_files`（不改名）
- `readRecentFiles` 读取时自动为缺失 `type` 的记录补 `'file'`（迁移逻辑）
- 新增 `addWebviewRecord` / `touchWebviewRecord` 方法
- 现有 `addRecentFile` / `updateRecentFile` / `touchRecentFile` 仅操作 `type === 'file'` 的记录
- `sortRecentFiles` 签名扩展为接受 `RecentRecord[]`，排序逻辑：
  - file 记录：`openedAt → modifiedAt → createdAt` 三级回退（保持现有行为）
  - webview 记录：仅按 `openedAt` 排序（无 `modifiedAt` 字段），若 `openedAt` 缺失则按 `0` 处理（排到末尾）
- 导出类型更新为 `RecentRecord`

**容量上限**：`MAX_RECENT_FILES = 100` 保持不变，文件和 webview 记录共用同一上限（后续如有需要再拆分限制）。

### 数据迁移

旧数据（无 `type` 字段的记录）在首次 `readRecentFiles` 时自动添加 `type: 'file'` 并回写。

---

## files store

### `src/stores/workspace/files.ts`

**状态定义**：`recentFiles` 改名为 `recentRecords`，类型为 `RecentRecord[] | null`。

**新增 action**：

| 方法 | 职责 |
|------|------|
| `addWebviewRecord(url, title)` | 添加或更新 webview 记录（内部根据 id 去重） |
| `touchWebviewRecord(id)` | 更新 webview 记录的 `openedAt` |

**新增 getter**：

| getter | 职责 |
|--------|------|
| `recentFiles` | 仅 `type === 'file'` 的记录（兼容旧调用方） |
| `topRecentRecords` | 前 3 条混合记录（供欢迎页使用） |
| `recentRecords` | 全量混合记录（供 BSearchRecent 使用） |

**已有 action 调整**：

- `patchCache` / `removeCacheEntries` — 参数不变，操作 `recentRecords`
- `getFileById` / `getFileByPath` — 使用 `recentFiles` getter（仅 file 类型），返回 `StoredFile | undefined`
- `getRecordById(id)` — 新增通用方法，从 `recentRecords` 全量查找，返回 `RecentRecord | undefined`
- `addFile` / `updateFile` / `openExistingFile` / `createAndOpen` 等 — 签名不变，仅操作 file 记录
- `syncRecentFiles` — 只同步 `type === 'file'` 的记录给系统快捷入口

---

## UI 改动

### 欢迎页 (`src/views/welcome/index.vue`)

- 标题：「最近文件」→「最近记录」
- 数据源：`filesStore.topRecentRecords`（3 条混合）
- 渲染分流：
  - file 记录 → icon: `lucide:file-text`，名称: `resolveFileTitle(file)`，副标题: `file.path`
  - webview 记录 → icon: `lucide:globe`，名称: `title`，副标题: `url`
- 点击 file → `openFileById(id)`
- 点击 webview → `router.push({ name: 'webview-web', query: { url } })`

### BSearchRecent (`src/components/BSearchRecent/index.vue`)

- placeholder：「搜索最近文件」→「搜索最近记录」
- 空状态：「没有匹配的最近文件」→「没有匹配的最近记录」
- 数据源：`filesStore.recentRecords`（混合）
- 搜索：webview 记录按 `url` + `title` 搜索
- 删除逻辑：**区分类型处理**
  - file 记录 → `filesStore.removeFile(id)` + `tabsStore.removeTab(id)`
  - webview 记录 → 仅 `filesStore.removeFile(id)`（webview 的 id 是 `hashString(url)`，与 tab id 体系不同，不应调用 `tabsStore.removeTab`）
- `NormalizedItem` 增加 webview 类型的渲染逻辑
- `emit('select')` 参数类型：`StoredFile` → `RecentRecord`，或新增 `emit('select-webview', record: WebviewRecord)` + 保持 `emit('select', file: StoredFile)` 双 emit。推荐双 emit 方案，保持向后兼容

---

## WebView 集成

### 记录写入时机

**web 实现** (`src/views/webview/web/index.vue`)：
- 监听 `did-navigate` + `page-title-updated` 事件，当 URL 和 title 都可用时调用 `filesStore.addWebviewRecord(url, title)`
- 已有 `handleDidNavigate` 和 `handleTitleUpdated` 事件绑定，在其 handler 中追加写入逻辑
- 子路径导航（`did-navigate-in-page`）也触发写入

**native 实现** (`src/views/webview/native/index.vue`)：
- native webview 靠 IPC 事件驱动状态（`useNativeWebView`），没有单一的「导航完成」事件
- **方案**：`watch` 监听 `webview.state.value.isLoading` 从 `true` 变为 `false`，且 `url` 不为空、`title` 不为空时触发写入
- 需要对 `isLoading` 转 `false` 做 debounce（300ms），避免连续跳转时多次触发写入
- 需要引入 `useFilesStore`

### 去重

webview 记录 `id` 使用 `hashString(url)`，确保同 URL 对应同一记录。再次打开时 `addWebviewRecord` 内部自动走 `touchWebviewRecord` 路径（更新 `openedAt` + title），而非重复创建。

---

## 涉及文件清单

| 文件 | 改动类型 |
|------|----------|
| `src/shared/storage/files/types.ts` | 新增 `WebviewRecord`、`RecentRecord`，`StoredFile` 加 `type` |
| `src/shared/storage/files/recent.ts` | 新增 webview 方法，迁移逻辑，导出类型更新 |
| `src/shared/storage/files/index.ts` | 重新导出新类型 |
| `src/stores/workspace/files.ts` | 状态改名，新增 action，现有方法适配 |
| `src/views/welcome/index.vue` | 数据源 + 渲染分流 + 文案更新 |
| `src/components/BSearchRecent/index.vue` | 数据源 + 渲染分流 + 文案更新 |
| `src/components/BSearchRecent/types.ts` | `NormalizedItem` 适配 |
| `src/views/webview/web/index.vue` | 导航时写入记录 |
| `src/views/webview/native/index.vue` | 导航时写入记录 |
