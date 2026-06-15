# Tibis 文件会话与 .tibis 画图保存设计

## 背景

`BDrawing` 当前作为独立页面存在于 `src/views/drawing/index.vue`，页面内直接维护空的 `DrawingData`，关闭页面后数据丢失。`src/views/editor` 已经具备比较完整的文件会话能力，包括最近文件存储、自动保存、真实磁盘保存策略、dirty 状态、外部文件变化监听、另存为、重命名和路径操作。

下一步目标是让画图能力支持 `.tibis` 文件，并为后续工作流能力预留同一套文件容器和文件会话基础设施。文件会话底层应放在 `src/hooks`，业务页面只使用封装后的能力，不直接处理最近文件存储、磁盘读写和打开分流细节。

## 目标

1. 支持 `.tibis` 文件作为 Tibis 业务文档容器。
2. `.tibis` 第一版支持 `type: "drawing"` 的画图文档，后续支持 `type: "workflow"` 等类型。业务数据直接铺在顶层，不再嵌套到 `data` 字段。
3. 画图页面支持和 editor 一致的自动保存策略：本地最近文件自动保存；已有磁盘路径时跟随 editor 保存策略写回磁盘。
4. `src/components/BSearchRecent`、`src/views/welcome/index.vue`、欢迎页拖拽入口、菜单打开入口都通过统一打开逻辑支持 `.tibis`。
5. 未知 `type`、不支持 `version` 或 JSON 解析失败的 `.tibis` 文件使用 editor 打开，作为普通文本查看和修复。
6. 不新增 `src/utils/tibis/document.ts`；`.tibis` 容器解析和序列化收口在 `src/hooks/useFileSession.ts` 或其同目录 hook 内部模块。

## 非目标

1. 本轮不实现 workflow 页面和 workflow 数据模型。
2. 本轮不重构 `BDrawing` 内部元素模型。
3. 本轮不把 editor 全量改成泛型数据编辑器；editor 仍然消费字符串内容。
4. 本轮不提交单独设计文档 commit，等代码实现完成后统一提交。

## 文件格式

`.tibis` 是统一业务文档容器，第一版采用 JSON 文本格式。`type` 和 `version` 是固定元信息，其余字段是当前业务类型的数据：

```json
{
  "type": "drawing",
  "version": 1,
  "elements": [],
  "edges": [],
  "viewport": {
    "center": { "x": 0, "y": 0 },
    "zoom": 1
  }
}
```

字段说明：

- `type`：业务文档类型。第一版支持 `drawing`，未来可增加 `workflow`。
- `version`：该业务类型的数据版本。第一版 drawing 使用 `1`。
- 其它顶层字段：业务数据。`drawing` 类型中直接保存 `DrawingData` 的字段，例如 `elements`、`edges`、`viewport`。

未来 workflow 文件可使用同一容器：

```json
{
  "type": "workflow",
  "version": 1
}
```

## 核心架构

新增通用 hook：

```text
src/hooks/useFileSession.ts
```

如果单文件过大，可以拆到：

```text
src/hooks/file-session/useFileSession.ts
src/hooks/file-session/types.ts
src/hooks/file-session/tibisDocument.ts
```

即使拆分，也仍归属 `src/hooks` 文件会话封装层，不放到 `src/utils/tibis`。

### 职责边界

`useFileSession` 负责：

- 加载和初始化 `StoredFile`。
- 维护 `fileState`、`data`、dirty 状态和已保存内容基线。
- 自动保存当前内容到最近文件存储。
- 按 editor 偏好设置执行真实磁盘保存策略。
- 保存、另存为、重命名、删除、复制路径、显示文件夹。
- 外部文件变化监听、保存时 suppress 自写入回调、缺失文件恢复。
- `.tibis` 容器解析、序列化、支持性判断和打开路由分流。

业务页面负责：

- 提供默认数据。
- 声明业务类型和版本。
- 渲染业务组件。
- 只通过 `session.data` 修改业务数据。

## useFileSession API 草案

```typescript
import type { File } from '@/shared/platform/native/types';

/**
 * 文件会话业务模式。
 */
type FileSessionKind = 'text' | 'tibis';

/**
 * 文件会话状态，替代 editor 专属的 EditorFile 命名。
 */
interface FileSessionState extends File {
  /** 文件唯一 ID */
  id: string;
}

/**
 * .tibis 文档容器。
 */
type TibisDocument<TData extends object> = TData & {
  /** 业务文档类型 */
  type: string;
  /** 业务数据版本 */
  version: number;
};

/**
 * 通用文件会话配置。
 */
interface UseFileSessionOptions<TData> {
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
  /** .tibis 业务类型，仅 kind 为 tibis 时使用 */
  type?: string;
  /** .tibis 业务版本，仅 kind 为 tibis 时使用 */
  version?: number;
  /** 当前业务路由名称 */
  routeName: string;
  /** 不支持当前内容时的兜底路由名称 */
  fallbackRouteName: string;
}

/**
 * 通用文件会话返回值。
 */
interface UseFileSessionReturn<TData> {
  /** 当前文件元信息和原始字符串内容 */
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
  };
}
```

`kind: "text"` 时，`data` 是 `fileState.content` 的字符串别名，不维护第二份副本。`kind: "tibis"` 时，hook 内部把业务数据和 `fileState.content` 同步：用户编辑只走 `data -> content` 单向序列化；初始化、打开文件、外部文件变化和 fallback 场景才走 `content -> data` 反序列化，避免循环触发。序列化时通过 `{ type, version, ...data }` 生成 `.tibis` 内容；反序列化时从顶层剥离 `type` 和 `version`，其余字段作为业务数据。

## Drawing 页面用法

`src/views/drawing/index.vue` 改为文件会话页面。路由升级为 `drawing/:id?`，类似 `editor/:id?` 自动补齐 ID。

页面中只保留业务关注点：

```typescript
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

模板：

```vue
<BDrawing v-model="drawingData" />
```

页面不再展示试用提示；保存能力由文件会话统一提供。

## 打开分流

统一在 `src/hooks/useOpenFile.ts` 收口文件打开路由。

分流规则：

1. 非 `.tibis` 文件继续进入 `editor`。
2. `.tibis` 文件读取或从最近文件缓存恢复成功后，使用 `StoredFile.content` 解析容器，不只依赖 `ext`。
3. `type: "drawing"` 且 `version: 1` 进入 `drawing/:id`。
4. 未知 `type`、不支持 `version`、JSON 解析失败，进入 `editor/:id`。
5. 未来支持 `workflow` 后，在同一分流表里增加 `workflow/:id`。

`useOpenFile` 增加一个内部路由解析函数：

```typescript
/**
 * 根据最近文件记录解析目标路由。
 * @param file - 最近文件记录
 * @returns 目标路由
 */
function resolveFileRoute(file: StoredFile): { name: string; params: { id: string } } {
  if (file.ext !== 'tibis') {
    return { name: 'editor', params: { id: file.id } };
  }

  const target = resolveTibisDocumentRoute(file.content);

  return { name: target.routeName, params: { id: file.id } };
}
```

`resolveTibisDocumentRoute` 从 `src/hooks/useFileSession.ts` 导出，仍归属文件会话 hook 层，不放到 `src/utils/tibis`。打开路径时先通过 `openOrRefreshByPathFromDisk` 得到最新 `StoredFile`，再调用 `resolveFileRoute`；打开最近无路径草稿时直接使用缓存中的 `StoredFile.content` 解析。

为了避免组件重复判断，以下入口都只调用 `useOpenFile`：

- `src/components/BSearchRecent/index.vue`
- `src/views/welcome/index.vue`
- `src/views/welcome/components/DropZone.vue`
- `src/layouts/default/hooks/useFileActive.ts`

`useOpenFile` 同时补充创建业务文件的 API，避免继续把 `createNewFile()` 硬编码为 Markdown：

```typescript
/**
 * 创建新的 .tibis drawing 草稿并打开。
 * @returns 创建后的文件记录
 */
async function createNewDrawingFile(): Promise<StoredFile>;
```

后续 workflow 可增加 `createNewWorkflowFile()`，或抽成带业务类型参数的创建函数。

## 入口改造

### BSearchRecent

`src/components/BSearchRecent/index.vue` 当前已经通过 `openFile` 和 `openFileByPath` 打开记录和绝对路径候选。保持这种方式，不在组件内新增 `.tibis` 判断。

需要调整：

- 搜索内容包含 `ext`，所以 `.tibis` 可被搜索。
- 当前激活态不能只判断 `route.name === "editor"`，需要让 drawing 文件也能识别当前 active 文件 ID。

### 欢迎页

`src/views/welcome/index.vue` 需要支持：

- “打开文件”继续调用 `openNativeFile`。
- 最近记录点击继续调用 `openFileById`。
- “画图”入口改为调用 `createNewDrawingFile()` 创建新的 `drawing` `.tibis` 草稿，并打开 `drawing/:id`。
- 最近记录图标可按扩展名区分：`.tibis` 使用 `lucide:pen-line`，普通文本继续 `lucide:file-text`。

### DropZone

`src/views/welcome/components/DropZone.vue` 需要支持：

- `OPEN_FILE_EXTENSIONS` 增加 `tibis`。
- 有真实磁盘路径时继续调用 `openFileByPath`。
- 无真实磁盘路径时创建草稿记录后，不再硬编码跳 `editor`，而是调用 `openFile(createdFile)` 交给统一分流。

### 扩展名常量

`src/constants/extensions.ts` 调整：

- `OPEN_FILE_EXTENSIONS` 增加 `tibis`。
- 打开过滤器名称从 `Markdown` 调整为包含 Tibis 文档的通用名称。
- `.tibis` 保存对话框不应影响 editor 默认保存 `.md`。`useFileSession` 保存 `.tibis` 时传入 `defaultPath`，并可按需要传入 `.tibis` filter。

## 自动保存与磁盘保存

保存行为跟随 editor：

1. 内容变化后 debounce 写入最近文件存储，避免页面关闭丢失。
2. 文件有磁盘路径时，跟随 `useEditorPreferencesStore().saveStrategy`：
   - `off`：不自动写回磁盘，只保存到最近文件存储，用户手动保存时才写盘。
   - `onChange`：内容变化后延迟写回磁盘。
   - `onBlur`：业务页面触发 blur 保存事件时写回磁盘。
3. 手动保存始终可用：
   - 已有路径：写回原路径。
   - 无路径：弹出保存对话框，默认 `Untitled.tibis`。

`useFileSession` 应复用 `src/views/editor/hooks/useSavePolicy.ts` 的策略逻辑。为避免 `src/hooks/useFileSession.ts` 反向依赖视图目录，实施时先把保存策略迁移为 `src/hooks/useSavePolicy.ts`，然后同步更新 editor 侧 import。

`src/views/editor/hooks/useAutoSave.ts` 当前耦合 editor 的文件类型命名。实施时删除该兼容包装，editor 直接使用共享的 `src/hooks/useFileAutoSave.ts`：

- 将自动保存逻辑迁移为 `src/hooks/useFileAutoSave.ts`，入参收窄为 `Ref<FileSessionState>` 或 `Ref<{ id: string; content: string }>` 加元信息读取函数。
- `src/views/editor/hooks/useSession.ts` 直接 import `useFileAutoSave`，不再保留 `useAutoSave` 二次包装。

Dirty 判定继续使用序列化后的字符串内容：

- `fileState.content` 是当前可保存字符串。
- `savedContent` 是最近一次成功写盘或外部回填的字符串基线。
- `.tibis` 模式不做 `DrawingData` 深比较，避免对象字段顺序和响应式引用影响 dirty 逻辑。

Drawing 页面下的 `onBlur` 策略定义为：画图根容器失去焦点、文本编辑器提交或页面停用时调用 `savePolicy.handleEditorBlur()`。这样行为接近 editor 的失焦保存，又不会要求 `BDrawing` 内部模拟文本编辑器事件。

## 外部文件变化

沿用 editor 当前策略：

- 自己写盘后 suppress 下一次 change。
- 文件外部变化且当前无 dirty：自动回填。
- 文件外部变化且当前 dirty：弹窗询问是否使用磁盘内容。
- 文件被删除：沿用全局 watcher 的 missing 标签状态，保存时优先恢复原路径。

对于 `.tibis`：

- 外部变化后如果仍是支持的 drawing 文档，回填剥离 `type` 和 `version` 后的 drawing 业务字段。
- 外部变化后变成未知类型或解析失败，当前 drawing 页面应跳转到 editor 兜底打开，避免业务组件持有非法数据。
- 如果跳转 editor 前当前 drawing 会话仍有未保存 dirty 内容，先把当前 `data` 序列化到 `fileState.content` 并写回最近文件存储，确保 editor 兜底打开时能看到用户的最新草稿，而不是只看到外部非法内容。

## 标签页与标题

Drawing 文件会话接入现有 tabs store：

- `drawing/:id` 使用文件 ID 作为 tab ID。
- KeepAlive cache key 使用 `drawing:${id}`。
- tab 标题使用 `resolveFileTitle(fileState.value)`，例如 `Untitled.tibis`。
- dirty、missing 和删除行为沿用 editor 的标签状态模型。

`src/router/routes/modules/drawing.ts` 需要从固定单例 tab 改为类似 editor 的参数化路由配置。`src/components/BSearchRecent/index.vue` 的 active 判断也需要从 `route.name === "editor"` 扩展为 `editor` 和 `drawing` 都按 `route.params.id` 判断。

## 错误处理

`.tibis` 解析失败不阻塞打开文件：

- 从打开入口进入时，fallback 到 editor。
- 在 drawing 会话运行中解析失败，保留原始字符串内容，并提示用户该文件已不再是有效 drawing 文档，然后跳转 editor。
- 保存时如果数据序列化失败，阻止写盘并记录错误，不覆盖已有磁盘内容。

## 测试计划

单元测试：

- `useFileSession` 可以创建默认 `.tibis` drawing 内容。
- `useFileSession` 能把 `DrawingData` 序列化为 `{ type, version, ...drawingData }`。
- `useFileSession` 从 `.tibis` 反序列化时只剥离 `type` 和 `version`，其余顶层字段进入业务数据。
- `data -> content` 同步不会因 `content -> data` 回填产生循环更新。
- `kind: "text"` 时 `data` 是 `fileState.content` 的字符串别名。
- 打开 `type: "drawing", version: 1` 的 `.tibis` 路由到 drawing。
- 打开未知 `type`、高版本、非法 JSON 的 `.tibis` 路由到 editor。
- `.tibis` dirty 判定使用序列化字符串和 `savedContent` 比较。
- `DropZone` 无路径草稿调用统一 `openFile` 后可分流。

组件或集成测试：

- welcome 最近记录点击 `.tibis` 进入 drawing。
- `BSearchRecent` 点击 `.tibis` 最近记录进入 drawing。
- `BSearchRecent` 在 drawing 路由下能高亮当前文件。
- 欢迎页“画图”创建 `Untitled.tibis` 草稿并进入 drawing。
- drawing 页面修改画布后最近文件存储内容更新。
- 已保存 `.tibis` 在 onChange 策略下写回磁盘。
- drawing 页面在 onBlur 策略下由画图根容器失焦或页面停用触发写盘。

回归测试：

- `.md` 新建、打开、保存、另存为仍进入 editor。
- editor 原有 dirty、rename、save as、external change 行为保持不变。

## 实施顺序建议

1. 将 `useSavePolicy` 迁移到 `src/hooks/useSavePolicy.ts`，并更新 editor import。
2. 将 editor 自动保存逻辑抽成 `src/hooks/useFileAutoSave.ts`，入参使用最小文件会话接口。
3. 新增 `src/hooks/useFileSession.ts`，覆盖 drawing 所需的 `.tibis` 模式、最近文件保存、dirty 和磁盘保存策略。
4. 在 `useFileSession` 中加入 `.tibis` 容器解析、序列化和路由支持，并导出 `resolveTibisDocumentRoute` 给 `useOpenFile` 使用。
5. 修改 `useOpenFile` 的统一分流逻辑，新增 `createNewDrawingFile()`。
6. 升级 drawing 路由为 `drawing/:id?`，接入 tab ID、cache key、title。
7. 改造 `src/views/drawing/index.vue` 使用 `useFileSession<DrawingData>`。
8. 改造 welcome、DropZone、BSearchRecent active 状态和图标细节。
9. 补测试并跑 lint、typecheck。
