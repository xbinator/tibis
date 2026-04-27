# file-ref 文件内容查找方案重构

## 背景

当前 `{{file-ref:...}}` 令牌的快照内容收集依赖 `editorToolContextRegistry.getCurrentContext()`（当前活动编辑器），存在以下问题：

1. **只能快照当前活动编辑器的文件**：`persistReferenceSnapshots` 中通过 `reference.documentId === toolContext.document.id` 过滤，引用到非活动编辑器文件的引用会被直接跳过，不生成快照
2. **不读取磁盘文件**：内容来源是 `toolContext.document.getContent()`（内存中的编辑器状态），而非磁盘上的实际文件
3. **引用跨文件场景覆盖不全**：一条消息中可能同时引用多个文件，当前只处理当前编辑器中的那一个

---

## 现状分析

### 1. 核心数据链路

```
handleFileReferenceInsert
    ├── 从 editorToolContextRegistry.getCurrentContext() 获取 documentId
    ├── 设置 reference.filePath = 编辑器中的绝对路径
    └── 生成 {{file-ref:...}} 令牌插入编辑器
            ↓
用户点击发送 → handleChatSubmit
    └── handleBeforeSend → persistReferenceSnapshots(message)
            ├── toolContext = editorToolContextRegistry.getCurrentContext()
            ├── 过滤：仅保留 reference.documentId === toolContext.document.id
            ├── content = toolContext.document.getContent()  ← 内存内容
            └── upsertReferenceSnapshots([snapshot])  → SQLite
```

### 2. reference.path 来源链

```
SelectionToolbar.vue
    └── emitChatFileReferenceInsert({ filePath: BEditor的props.filePath })
            ↓
handleFileReferenceInsert (index.vue:396)
    └── filePath: reference.filePath ?? toolContext?.document.path ?? null
            ↓
handleChatInsertFileReference (index.vue:379)
    └── path: reference.filePath  → ChatMessageFileReference.path
```

**结论**：`reference.path` 在文件已保存时就是**绝对文件系统路径**（如 `/Users/name/Documents/myfile.md`），在未保存时为 `null`。

### 3. 文件系统读取能力

项目已有 `native.readFile(path)` 能力：

```typescript
// src/shared/platform/native/index.ts
export const native: Native = hasElectronAPI() ? new ElectronNative() : new WebNative();

// src/shared/platform/native/types.ts
export interface Native {
  readFile(path: string): Promise<ReadFileResult>;
}
// ReadFileResult = { content: string; name: string; ext: string }
```

`BChatSidebar/index.vue` 当前**未导入 `native`**，无文件系统访问能力。

### 4. 关键类型

```typescript
// types/ai.d.ts — 编辑器上下文
interface AIToolContext {
  document: {
    id: string;           // nanoid
    title: string;        // 文件名
    path: string | null;  // 绝对路径，未保存时为 null
    getContent: () => string;  // 从内存中获取
  };
  editor: { getSelection, insertAtCursor, replaceSelection, replaceDocument };
}

// types/chat.d.ts
interface ChatMessageFileReference {
  id: string;           // referenceId
  token: string;        // {{file-ref:...}}
  documentId: string;   // nanoid
  fileName: string;
  line: string;         // 格式化行号 "3" 或 "3-5"
  path: string | null;  // 绝对路径
  snapshotId: string;   // 快照 ID，初始为 ""
}

interface ChatReferenceSnapshot {
  id: string;            // 快照 ID (nanoid)
  documentId: string;
  title: string;
  content: string;       // 全文
  createdAt: string;
}
```

### 5. SQLite 快照存储

```sql
-- 表结构（sqlite.ts）
INSERT OR REPLACE INTO chat_reference_snapshots
  (id, document_id, title, content, created_at)
VALUES (?, ?, ?, ?, ?)

SELECT id, document_id, title, content, created_at
FROM chat_reference_snapshots
WHERE id IN (...)
```

---

## 修改方案

### 整体思路

将 `persistReferenceSnapshots` 改为**三向获取策略**：

1. **优先从编辑器上下文获取**：遍历 `message.references`，通过 `editorToolContextRegistry` 按 `documentId` 查找是否在活动编辑器中打开。若匹配到 → 使用 `getContent()` 从内存获取内容（零 I/O）
2. **编辑器未打开则从磁盘读取**：编辑器未打开的引用，按 `reference.path` 调用 `native.readFile(path)` 从磁盘读取文件内容
3. **磁盘读取失败回退 SQLite**：磁盘文件无法读取时，按 `documentId` 查询 SQLite 中该文件的最新历史快照作为降级兜底
4. **未保存文件**（`path === null` 且编辑器也未激活）→ 跳过，不生成快照
5. 按内容来源分组去重，同文件多个引用只生成一个快照

### 修改范围

- `src/components/BChatSidebar/index.vue`（主要改动：`persistReferenceSnapshots` 重写，新增 SQLite 降级逻辑）
- `src/ai/tools/editor-context.ts`（补充改动：新增 `getContext` 方法，按 `documentId` 查找上下文）
- `src/shared/storage/chats/sqlite.ts`（补充改动：新增 `getReferenceSnapshotByDocumentId` 方法，按 `documentId` 查找最新历史快照）

### 实现细节

```typescript
/**
 * 为消息中的所有引用持久化文件内容快照
 *
 * 获取策略（按优先级）：
 * 1. 编辑器已激活 → 从 editorToolContextRegistry 内存获取（零 I/O）
 * 2. 编辑器未激活 → 从磁盘读取（native.readFile）
 * 3. 磁盘读取失败 → 从 SQLite 历史快照降级（getReferenceSnapshotByDocumentId）
 * 4. 未保存文件且编辑器未激活 → 跳过
 *
 * 按 (来源 + 标识符) 分组去重，同文件多引用只生成一个快照
 *
 * @param message - 待发送的消息
 */
async function persistReferenceSnapshots(message: Message): Promise<void> {
  if (!message.references?.length) return;

  const snapshots: ChatReferenceSnapshot[] = [];

  // 按 (来源 + 标识符) 分组，同文件多引用只生成一个快照。
  // 返回 null 表示该引用无法获取内容，跳过。
  // 若来自编辑器，在同一分组中缓存 context，避免后续重复查找。
  const buildGroupKey = (
    ref: ChatMessageFileReference
  ): { key: string; context: AIToolContext | null } | null => {
    // 优先：编辑器已打开，通过 documentId 查找内存内容
    const context = editorToolContextRegistry.getContext(ref.documentId);
    if (context) {
      return { key: `editor|${ref.documentId}`, context };
    }
    // 降级：编辑器未打开，从磁盘读取
    if (ref.path) {
      return { key: `disk|${ref.path}`, context: null };
    }
    // 未保存文件且编辑器未激活，无法获取内容
    return null;
  };

  // key → { refs, context }，context 仅在 editor 来源时非 null
  const groups = new Map<string, { refs: ChatMessageFileReference[]; context: AIToolContext | null }>();
  for (const ref of message.references) {
    const result = buildGroupKey(ref);
    if (!result) continue;

    if (!groups.has(result.key)) {
      // 同一分组的首个 ref 负责初始化，后续同组 ref 仅追加引用记录。
      // 同一 documentId 必然关联同一个 context（registry 的 key 即为 documentId），
      // 因此后续 ref 的 context 值虽然被丢弃，但语义一致。
      groups.set(result.key, { refs: [], context: result.context });
    }
    groups.get(result.key)!.refs.push(ref);
  }

  // 按分组生成快照
  for (const [key, group] of groups) {
    if (key.startsWith('editor|')) {
      // 优先：从编辑器内存获取 — 零 I/O，context 已在分组阶段缓存
      // 此处 guard 为防御性代码 + TypeScript narrowing，正常情况下不可达
      const { context } = group;
      if (!context) continue;

      const snapshot: ChatReferenceSnapshot = {
        id: nanoid(),
        documentId: context.document.id,
        title: context.document.title,
        content: context.document.getContent(),
        createdAt: new Date().toISOString()
      };
      group.refs.forEach((ref) => { ref.snapshotId = snapshot.id; });
      snapshots.push(snapshot);
    } else {
      // 降级：从磁盘读取
      // 进入 disk 分组的 ref 必然有 path（buildGroupKey 中 path 非空才返回 disk|...）
      try {
        const filePath = group.refs[0].path!;
        const result = await native.readFile(filePath);
        const snapshot: ChatReferenceSnapshot = {
          id: nanoid(),
          documentId: group.refs[0].documentId,
          title: result.name,
          content: result.content,
          createdAt: new Date().toISOString()
        };
        group.refs.forEach((ref) => { ref.snapshotId = snapshot.id; });
        snapshots.push(snapshot);
      } catch (e) {
        console.warn(`[persistReferenceSnapshots] 读取文件失败，尝试从 SQLite 历史快照降级: ${group.refs[0].path}`, e);
        // 磁盘读取失败，降级到 SQLite 历史快照
        const cachedSnapshot = await chatStorage.getReferenceSnapshotByDocumentId(group.refs[0].documentId);
        if (cachedSnapshot) {
          group.refs.forEach((ref) => { ref.snapshotId = cachedSnapshot.id; });
          snapshots.push(cachedSnapshot);
        }
      }
    }
  }

  if (snapshots.length > 0) {
    await chatStorage.upsertReferenceSnapshots(snapshots);
  }
}
```

### 新增 import

```typescript
// 在 BChatSidebar/index.vue 顶部新增
import { native } from '@/shared/platform';
```

### 关键逻辑详解

#### 三向获取策略

每个 reference 按以下优先级获取内容：

| 优先级 | 条件 | 获取方式 | 开销 |
|---|---|---|---|
| 1 | `editorToolContextRegistry.getContext(ref.documentId)` 命中 | `context.document.getContent()` | 零 I/O |
| 2 | 优先级 1 未命中 且 `ref.path` 非空 | `native.readFile(ref.path)` | 磁盘 I/O |
| 3 | 优先级 2 失败（文件不存在/不可读） | `chatStorage.getReferenceSnapshotByDocumentId(ref.documentId)` | SQLite 查询 |
| 4 | 以上均不满足 | 跳过，不生成快照 | -- |

#### 按来源分组去重

同一文件可能有多个引用（如用户在同一消息中多次引用 `foo.ts` 的不同行），分组去重后只获取一次内容，多个 reference 共享同一个 snapshot。

`buildGroupKey` 在分组阶段同步缓存 `AIToolContext`（编辑器来源）到分组结构中，后续生成快照时直接取用，避免 `getContext` 重复调用。

```
message.references: [
  { documentId: 'a1b2', path: '/a/foo.ts', line: '3' },   // foo.ts 在编辑器中打开
  { documentId: 'a1b2', path: '/a/foo.ts', line: '10' },  // foo.ts 在编辑器中打开
  { documentId: 'c3d4', path: '/a/bar.ts', line: '5' },   // bar.ts 未打开
]

分组结果:
  editor|a1b2  → { refs: [ref1, ref2], context: AIToolContext }  // 从内存获取一次，共享快照
  disk|/a/bar.ts → { refs: [ref3], context: null }               // 从磁盘读取一次
```

#### 未保存文件处理

未保存文件（`path === null`）：
- 若编辑器已激活 → 通过 `getContext(documentId)` 匹配，从内存获取
- 若编辑器未激活 → 跳过，不生成快照（无内容来源）

#### 异常容错

| 场景 | 处理 | 说明 |
|---|---|---|
| 文件不存在或无法读取 | 降级到 SQLite 历史快照，若仍无数据则跳过，`console.warn` 记录 | `try/catch` 包裹 `native.readFile`，catch 中调用 `getReferenceSnapshotByDocumentId` |
| 无有效引用生成快照 | 不调用 `upsertReferenceSnapshots` | `snapshots.length === 0` 时直接跳过 |
| 快照未生成 → `snapshotId` 仍为 `""` | `buildModelReadyMessages` 中保留原令牌 | SQLite 降级也失败时的最终兜底 |

### 和原实现的对比

| 维度 | 原实现 | 新实现 |
|---|---|---|---|
| 内容来源 | `toolContext.document.getContent()`（内存） | 编辑器激活 → 内存；未激活 → 磁盘；磁盘失败 → SQLite 降级 |
| 覆盖范围 | 仅当前活动编辑器中的文件 | 所有引用（编辑器打开、磁盘可读、或 SQLite 有历史快照） |
| 筛选条件 | `reference.documentId === toolContext.document.id` | 无筛选（所有引用都尝试处理） |
| 未保存文件 | 依赖 `documentId` 匹配当前编辑器 | 编辑器激活 → 内存；未激活 → 跳过 |
| 同文件多引用 | 合并为单快照 | 同（按来源+标识分组去重） |
| 失败处理 | 静默跳过 | `console.warn` + SQLite 降级 + 跳过 |

### 编辑器注册表补充改动

当前 `editorToolContextRegistry` 仅有 `getCurrentContext()`（返回当前活动编辑器），需要新增按 `documentId` 查找的方法。

注册时调用方传入的 `editorId` 实际就是 `documentId`（见 `src/views/editor/index.vue:69`：`register(documentId, { document: { id: documentId }, ... })`），因此 `contexts` 内部 Map 的 key 即为 `documentId`，新增方法直接按 `documentId` 查询即可，无需额外映射。

**修改文件**：`src/ai/tools/editor-context.ts`

**1. 接口新增方法**：

```typescript
// 在 EditorToolContextRegistry 接口中新增
getContext: (documentId: string) => AIToolContext | undefined;
```

**2. 实现新增行**（在 `createEditorToolContextRegistry` 返回值对象中新增）：

```typescript
getContext(documentId: string): AIToolContext | undefined {
  return contexts.get(documentId);
},
```

**改动量**：接口 +2 行，实现 +3 行。

### SQLite 降级查询补充改动

当磁盘文件读取失败时，需要从 SQLite 查找该文件的历史快照作为兜底。

**修改文件**：`src/shared/storage/chats/sqlite.ts`

**新增 SQL**：

```sql
SELECT id, document_id, title, content, created_at
FROM chat_reference_snapshots
WHERE document_id = ?
ORDER BY created_at DESC
LIMIT 1
```

**新增方法**：

```typescript
/**
 * 按 documentId 查找最新的一条历史快照，用于磁盘文件读取失败时的降级兜底。
 * @param documentId - 文档标识
 * @returns 最新快照，不存在时返回 undefined
 */
async getReferenceSnapshotByDocumentId(documentId: string): Promise<ChatReferenceSnapshot | undefined> {
  if (!isDatabaseAvailable()) {
    const snapshots = loadFallbackReferenceSnapshots();
    let latest: ChatReferenceSnapshot | undefined;
    for (const snapshot of Object.values(snapshots)) {
      if (snapshot && snapshot.documentId === documentId) {
        if (!latest || snapshot.createdAt > latest.createdAt) {
          latest = snapshot;
        }
      }
    }
    return latest;
  }
  const rows = await dbSelect<ChatReferenceSnapshotRow>(SELECT_LATEST_REFERENCE_SNAPSHOT_BY_DOCUMENT_ID_SQL, [documentId]);
  return rows.length > 0 ? mapReferenceSnapshotRow(rows[0]) : undefined;
}
```

**降级行为说明**：SQLite 历史快照会直接复用原有 `id`（不生成新 ID），这样已有的 `loadReferenceSnapshotMap` 无需修改，通过 `getReferenceSnapshots(uniqueSnapshotIds)` 即可正常加载。

---

## 测试要点

### 需要验证的场景

1. **编辑器已打开的文件引用**：引用一个已在编辑器中打开的文件，内容从编辑器内存获取，无磁盘 I/O
2. **编辑器未打开的文件引用**：引用一个未在编辑器中打开的文件（`path` 非空），内容从磁盘读取
3. **同文件多引用**：同一消息中多次引用同一文件，多个 reference 共享同一个快照
4. **多文件混合引用**：一条消息中同时引用编辑器打开的文件和未打开的文件，各自走不同的获取路径
5. **未保存文件已激活**：引用一个未保存文件（`path === null`）且编辑器已打开，从内存获取
6. **未保存文件未激活**：引用一个未保存文件且编辑器未打开，跳过不生成快照
7. **磁盘文件不存在但有历史快照**：引用路径指向已删除的文件，但 SQLite 中存有该文件的历史快照，降级到历史快照，引用正常解析
8. **磁盘文件不存在且无历史快照**：引用路径指向已删除的文件，且 SQLite 中无历史快照，跳过该引用不生成快照
9. **无引用**：普通消息无引用，不执行任何快照逻辑
10. **所有引用都失败**：所有引用都无法获取内容且无历史快照，`snapshots` 为空，不调用 `upsertReferenceSnapshots`
11. **editorToolContextRegistry.getContext() 注册表验证**：确认 `getContext(documentId)` 能正确返回已注册的编辑器上下文，且未注册的返回 `undefined`
12. **SQLite getReferenceSnapshotByDocumentId 验证**：确认能正确返回匹配 documentId 的最新历史快照，无匹配时返回 `undefined`

### 集成验证

- 发送带引用的消息后，检查 SQLite 中 `chat_reference_snapshots` 表的记录
- 流式响应中 `buildModelReadyMessages` 正确替换了令牌
- 后续轮次的消息中，引用仍能正确加载快照（`loadReferenceSnapshotMap` 不受影响）
