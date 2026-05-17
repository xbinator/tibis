# File Utils 重构设计

## Summary

将 `src/utils/` 下分散的三个文件/目录——`fileTitle.ts`、`recentFile.ts`、`fileReference/`——统一收敛到 `src/utils/file/` 模块中，构建职责清晰、边界明确的一级文件工具模块。

## Motivation

当前 `src/utils/` 下文件相关工具存在以下问题：

1. **层级不一致**：`fileTitle.ts` 和 `recentFile.ts` 是独立文件，`fileReference/` 是唯一用到子目录的工具，但三者同属"文件"语义域
2. **命名不统一**：`fileTitle`、`recentFile`、`fileReference` 三种命名风格混用，缺少统一前缀
3. **隐式耦合**：`recentFile.ts` → `fileTitle.ts`，`parseToken.ts` → `unsavedPath.ts`，但文件系统层级没有体现这种关系
4. **`recentFile.ts` 过度单薄**：仅 1 行包装函数，独立成文件维护成本高于收益

## Target Structure

```
src/utils/file/
  index.ts       — 统一 barrel，导出所有公开 API
  title.ts       — 文件展示命名（resolveFileTitle + getRecentFileLabel + FileTitleParts）
  unsaved.ts     — 未保存文档虚拟路径（build/parse/is + UnsavedPathParts + ParsedUnsavedPath）
  reference.ts   — 聊天文件引用解析（parseFileReferenceToken + ParsedFileReference + FileReferenceNavigationTarget）
```

**删除**：
- `src/utils/fileTitle.ts`
- `src/utils/recentFile.ts`
- `src/utils/fileReference/` 整个目录（`types.ts`、`parseToken.ts`、`unsavedPath.ts`）

## File Responsibilities

### `title.ts`

| 导出 | 说明 |
|------|------|
| `resolveFileTitle(parts: FileTitleParts): string` | 从 name+ext 生成 `name.ext` 展示名 |
| `getRecentFileLabel(file: Pick<StoredFile, 'name' \| 'ext'>): string` | 最近文件标签 thin wrapper（从 `recentFile.ts` 移入） |
| `FileTitleParts` | 接口，`{ name, ext }` |

`getRecentFileLabel` 不再独立成文件，作为 `resolveFileTitle` 的同级导出，对外语义更完整。

### `unsaved.ts`

| 导出 | 说明 |
|------|------|
| `buildUnsavedPath(parts: UnsavedPathParts): string` | 构建 `unsaved://id/name.ext` 虚拟路径 |
| `parseUnsavedPath(rawPath: string): ParsedUnsavedPath \| null` | 解析虚拟路径为 `{ fileId, fileName }` |
| `isUnsavedPath(path: string): boolean` | 判断是否 `unsaved://` 前缀 |
| `UnsavedPathParts` | 构建参数接口 |
| `ParsedUnsavedPath` | 解析结果接口 |

纯迁移，API 不变。私有辅助函数（`sanitizeUnsavedPathSegment`、`hasFileExtension`）保持模块内可见。

### `reference.ts`

| 导出 | 说明 |
|------|------|
| `parseFileReferenceToken(tokenContent: string): ParsedFileReference \| null` | 解析 `#path 1-10\|5-9` 格式的聊天文件引用 token |
| `ParsedFileReference` | 完整解析结果接口（从原 `fileReference/types.ts` 并入） |
| `FileReferenceNavigationTarget` | 导航目标接口（从原 `fileReference/types.ts` 并入） |

内部依赖 `parseUnsavedPath` 从同级 `./unsaved` 导入。原 `extractFileName` 作为模块内私有函数保留。

### `index.ts`

Barrel 导出所有上述公开 API。不导出内部辅助函数。

## Consumer Migration

所有 import 路径统一改为 `@/utils/file`，共约 12 个文件需修改：

| 原导入来源 | 改为 |
|------------|------|
| `@/utils/fileTitle` | `@/utils/file` |
| `@/utils/recentFile` | `@/utils/file` |
| `@/utils/fileReference/parseToken` | `@/utils/file` |
| `@/utils/fileReference/unsavedPath` | `@/utils/file` |
| `@/utils/fileReference/types` | `@/utils/file` |

**无函数签名变更，无逻辑变更。**

### Affected Files

1. `src/utils/recentFile.ts` → 删除（内容移入 `file/title.ts`）
2. `src/views/editor/drivers/markdown.ts` — 改 `resolveFileTitle` 和 `buildUnsavedPath` 导入源
3. `src/views/editor/hooks/useSession.ts` — 改 `resolveFileTitle` 导入源
4. `src/views/welcome/index.vue` — 改 `getRecentFileLabel` 导入源
5. `src/components/BSearchRecent/index.vue` — 改 `getRecentFileLabel` 导入源
6. `src/components/BChatSidebar/utils/chipResolver.ts` — 改 `parseFileReferenceToken` + types 导入源
7. `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue` — 改 `parseFileReferenceToken` 导入源
8. `src/components/BChatSidebar/hooks/useFileReference.ts` — 改 `buildUnsavedPath` 导入源
9. `src/components/BChatSidebar/utils/fileReferenceContext.ts` — 改 `isUnsavedPath` + `parseUnsavedPath` 导入源
10. `src/hooks/useOpenDraft.ts` — 改 `buildUnsavedPath` 导入源
11. `src/ai/tools/builtin/DocumentTool/index.ts` — 改 `buildUnsavedPath` 导入源
12. `src/ai/tools/builtin/FileReadTool/index.ts` — 改 `isUnsavedPath` + `parseUnsavedPath` 导入源
13. `src/ai/tools/builtin/FileWriteTool/index.ts` — 改 `parseUnsavedPath` 导入源
14. `src/ai/tools/builtin/FileEditTool/index.ts` — 改 `parseUnsavedPath` 导入源
15. `src/ai/tools/shared/fileTool.ts` — 改 `isUnsavedPath` 导入源
16. `src/components/BChatSidebar/index.vue` — 改 `FileReferenceNavigationTarget` 导入源

## Migration Strategy

一次性原子提交，三步走：

| 步骤 | 操作 |
|------|------|
| 1 | 新建 `src/utils/file/` 目录及 4 个文件（`index.ts`、`title.ts`、`unsaved.ts`、`reference.ts`） |
| 2 | 批量更新所有消费文件的 import 路径 |
| 3 | 删除旧文件：`fileTitle.ts`、`recentFile.ts`、`fileReference/` 目录 |

**风险控制**：
- 先建新、再改引用、最后删旧，保证每一步 TypeScript 都能编译通过
- 所有改动是 import 路径的纯文本替换，无逻辑变更
- `index.ts` barrel 模式使消费者只需改一个路径前缀

## Verification

```bash
pnpm typecheck    # TypeScript 类型检查
pnpm lint         # ESLint 检查
```

无需新增测试——所有函数签名和行为完全不变。
