# File Utils 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/utils/` 下 `fileTitle.ts`、`recentFile.ts`、`fileReference/` 统一收敛到 `src/utils/file/` 模块

**Architecture:** 新建 `src/utils/file/` 目录，包含 4 个文件（`index.ts` barrel、`title.ts`、`unsaved.ts`、`reference.ts`）。所有 API 签名不变，纯 import 路径迁移。

**Tech Stack:** TypeScript, Vue 3

---

### Task 1: 创建 `src/utils/file/` 目录及 4 个新文件

**Files:**
- Create: `src/utils/file/index.ts`
- Create: `src/utils/file/title.ts`
- Create: `src/utils/file/unsaved.ts`
- Create: `src/utils/file/reference.ts`

- [ ] **Step 1: 创建 barrel 入口文件**

```typescript
/**
 * @file index.ts
 * @description 文件工具模块统一导出入口。
 */

export { resolveFileTitle, getRecentFileLabel, type FileTitleParts } from './title';
export { buildUnsavedPath, parseUnsavedPath, isUnsavedPath, type UnsavedPathParts, type ParsedUnsavedPath } from './unsaved';
export { parseFileReferenceToken, type ParsedFileReference, type FileReferenceNavigationTarget } from './reference';
```

- [ ] **Step 2: 创建 `title.ts`——合并 `fileTitle.ts` + `recentFile.ts`**

```typescript
/**
 * @file title.ts
 * @description 统一生成文件展示标题与最近文件标签。
 */

import type { StoredFile } from '@/shared/storage/files/types';

/**
 * 文件标题解析参数。
 */
export interface FileTitleParts {
  /** 文件名主体。 */
  name: string;
  /** 文件扩展名。 */
  ext: string;
}

/**
 * 生成统一文件标题，优先展示"文件名.扩展名"。
 * @param parts - 文件名与扩展名
 * @returns 文件展示标题
 */
export function resolveFileTitle(parts: FileTitleParts): string {
  const normalizedName = parts.name.trim();
  const normalizedExt = parts.ext.trim();

  if (normalizedName && normalizedExt) {
    return `${normalizedName}.${normalizedExt}`;
  }

  if (normalizedName) {
    return normalizedName;
  }

  return normalizedExt ? `Untitled.${normalizedExt}` : 'Untitled';
}

/**
 * 生成最近文件展示名称，优先展示真实文件名与扩展名。
 * @param file - 最近文件记录
 * @returns 展示名称
 */
export function getRecentFileLabel(file: Pick<StoredFile, 'name' | 'ext'>): string {
  return resolveFileTitle(file);
}
```

- [ ] **Step 3: 创建 `unsaved.ts`——从 `fileReference/unsavedPath.ts` 迁移**

```typescript
/**
 * @file unsaved.ts
 * @description 未保存文档虚拟路径的构建、判断与解析工具。
 */

/**
 * 未保存文档路径构建参数。
 */
export interface UnsavedPathParts {
  /** 未保存文档 ID。 */
  id: string;
  /** 展示用文件名，可包含扩展名。 */
  fileName: string;
  /** 可选扩展名；当 fileName 未携带扩展名时使用，默认 `md`。 */
  ext?: string;
}

/**
 * 未保存文档路径解析结果。
 */
export interface ParsedUnsavedPath {
  /** 未保存文档 ID。 */
  fileId: string;
  /** 展示用文件名。 */
  fileName: string;
}

/**
 * 清洗虚拟路径片段，避免出现路径分隔符等非法字符。
 * @param value - 原始片段
 * @param fallback - 兜底值
 * @returns 清洗后的片段
 */
function sanitizeUnsavedPathSegment(value: string, fallback: string): string {
  const sanitizedValue = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ');

  return sanitizedValue || fallback;
}

/**
 * 判断文件名是否已携带扩展名。
 * @param fileName - 展示用文件名
 * @returns 是否已包含扩展名
 */
function hasFileExtension(fileName: string): boolean {
  return /\.[A-Za-z0-9_-]+$/.test(fileName);
}

/**
 * 判断给定路径是否为未保存文档虚拟路径。
 * @param path - 路径字符串
 * @returns 是否为 `unsaved://` 虚拟路径
 */
export function isUnsavedPath(path: string): boolean {
  return path.startsWith('unsaved://');
}

/**
 * 构建未保存文档虚拟路径。
 * @param parts - 路径片段
 * @returns `unsaved://{id}/{fileName}.{ext}` 形式的虚拟路径
 */
export function buildUnsavedPath(parts: UnsavedPathParts): string {
  const fileId = sanitizeUnsavedPathSegment(parts.id, 'unknown');
  const sanitizedFileName = sanitizeUnsavedPathSegment(parts.fileName, 'Untitled');
  const normalizedExtension = sanitizeUnsavedPathSegment(parts.ext ?? 'md', 'md').replace(/^\.+/, '');
  const normalizedFileName = hasFileExtension(sanitizedFileName) ? sanitizedFileName : `${sanitizedFileName}.${normalizedExtension}`;

  return `unsaved://${fileId}/${normalizedFileName}`;
}

/**
 * 解析未保存文档虚拟路径。
 * @param rawPath - 原始路径字符串
 * @returns 草稿 ID 与文件名；非未保存路径时返回 null
 */
export function parseUnsavedPath(rawPath: string): ParsedUnsavedPath | null {
  const matched = rawPath.match(/^unsaved:\/\/([^/]+)\/(.+)$/);
  if (!matched) {
    return null;
  }

  const [, fileId, fileName] = matched;
  return {
    fileId,
    fileName
  };
}
```

- [ ] **Step 4: 创建 `reference.ts`——合并 `fileReference/types.ts` + `fileReference/parseToken.ts`**

```typescript
/**
 * @file reference.ts
 * @description 聊天与输入框共用的文件引用 token 解析及类型定义。
 */

import { parseUnsavedPath } from './unsaved';

/**
 * 文件引用解析结果
 */
export interface ParsedFileReference {
  /** 原始路径字符串 */
  rawPath: string;
  /** 已保存文件的绝对路径；未保存草稿时为 null */
  filePath: string | null;
  /** 未保存草稿的文件 ID；已保存文件时为 null */
  fileId: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 源码起始行号（1-based） */
  startLine: number;
  /** 源码结束行号（1-based） */
  endLine: number;
  /** 渲染起始行号（1-based） */
  renderStartLine: number;
  /** 渲染结束行号（1-based） */
  renderEndLine: number;
  /** 展示用源码行号文本 */
  lineText: string;
  /** 是否为未保存草稿引用 */
  isUnsaved: boolean;
}

/**
 * 文件引用导航目标
 */
export interface FileReferenceNavigationTarget {
  /** 原始路径字符串 */
  rawPath: string;
  /** 已保存文件的绝对路径；未保存草稿时为 null */
  filePath: string | null;
  /** 未保存草稿的文件 ID；已保存文件时为 null */
  fileId: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 源码起始行号（1-based） */
  startLine: number;
  /** 源码结束行号（1-based） */
  endLine: number;
}

/** 文件引用 token 正则表达式。 */
const FILE_REFERENCE_TOKEN_PATTERN = /^#(\S+)\s+(\d+)-(\d+)(?:\|(\d+)-(\d+))?$/;

/**
 * 从路径字符串中提取展示用文件名。
 * @param rawPath - 原始路径字符串
 * @returns 文件名
 */
function extractFileName(rawPath: string): string {
  return rawPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rawPath;
}

/**
 * 解析文件引用 token。
 * @param tokenContent - token 内容，包含 `#`
 * @returns 结构化解析结果；非法格式返回 null
 */
export function parseFileReferenceToken(tokenContent: string): ParsedFileReference | null {
  const matched = tokenContent.match(FILE_REFERENCE_TOKEN_PATTERN);
  if (!matched) {
    return null;
  }

  const [, rawPathText, startLineText, endLineText, renderStartLineText, renderEndLineText] = matched;
  const rawPath = rawPathText.trim();
  const unsavedReference = parseUnsavedPath(rawPath);
  const startLine = Number(startLineText);
  const endLine = Number(endLineText);

  return {
    rawPath,
    filePath: unsavedReference ? null : rawPath,
    fileId: unsavedReference?.fileId ?? null,
    fileName: unsavedReference?.fileName ?? extractFileName(rawPath),
    startLine,
    endLine,
    renderStartLine: renderStartLineText ? Number(renderStartLineText) : startLine,
    renderEndLine: renderEndLineText ? Number(renderEndLineText) : endLine,
    lineText: `${startLine}-${endLine}`,
    isUnsaved: Boolean(unsavedReference)
  };
}
```

---

### Task 2: 迁移 `fileTitle.ts` 的消费者

**Files:**
- Modify: `src/views/editor/drivers/markdown.ts`
- Modify: `src/views/editor/hooks/useSession.ts`

- [ ] **Step 1: 更新 `markdown.ts` 导入**

`markdown.ts` 同时引入了 `resolveFileTitle` 和 `buildUnsavedPath`，需合并为统一导入：

改为：
```typescript
import { resolveFileTitle, buildUnsavedPath } from '@/utils/file';
```
（删除原来分开的 `from '@/utils/fileTitle'` 和 `from '@/utils/fileReference/unsavedPath'` 两条 import）

- [ ] **Step 2: 更新 `useSession.ts` 导入**

将 `import { resolveFileTitle } from '@/utils/fileTitle'` 改为：
```typescript
import { resolveFileTitle } from '@/utils/file';
```

---

### Task 3: 迁移 `recentFile.ts` 的消费者

**Files:**
- Modify: `src/views/welcome/index.vue`
- Modify: `src/components/BSearchRecent/index.vue`

- [ ] **Step 1: 更新 `welcome/index.vue` 导入**

将 `import { getRecentFileLabel } from '@/utils/recentFile'` 改为：
```typescript
import { getRecentFileLabel } from '@/utils/file';
```

- [ ] **Step 2: 更新 `BSearchRecent/index.vue` 导入**

将 `import { getRecentFileLabel } from '@/utils/recentFile'` 改为：
```typescript
import { getRecentFileLabel } from '@/utils/file';
```

---

### Task 4: 迁移 `fileReference/parseToken` 的消费者

**Files:**
- Modify: `src/components/BChatSidebar/utils/chipResolver.ts`
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue`

- [ ] **Step 1: 更新 `chipResolver.ts` 导入**

将：
```typescript
import { parseFileReferenceToken } from '@/utils/fileReference/parseToken'
import type { FileReferenceNavigationTarget, ParsedFileReference } from '@/utils/fileReference/types'
```
改为：
```typescript
import { parseFileReferenceToken, type FileReferenceNavigationTarget, type ParsedFileReference } from '@/utils/file';
```

- [ ] **Step 2: 更新 `BubblePartUserInput.vue` 导入**

将 `import { parseFileReferenceToken } from '@/utils/fileReference/parseToken'` 改为：
```typescript
import { parseFileReferenceToken } from '@/utils/file';
```

---

### Task 5: 迁移 `fileReference/unsavedPath` 的消费者

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useFileReference.ts`
- Modify: `src/components/BChatSidebar/utils/fileReferenceContext.ts`
- Modify: `src/hooks/useOpenDraft.ts`
- Modify: `src/ai/tools/builtin/DocumentTool/index.ts`
- Modify: `src/ai/tools/builtin/FileReadTool/index.ts`
- Modify: `src/ai/tools/builtin/FileWriteTool/index.ts`
- Modify: `src/ai/tools/builtin/FileEditTool/index.ts`
- Modify: `src/ai/tools/shared/fileTool.ts`
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: 更新 `useFileReference.ts`**

将 `import { buildUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { buildUnsavedPath } from '@/utils/file';
```

- [ ] **Step 2: 更新 `fileReferenceContext.ts`**

将 `import { isUnsavedPath, parseUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { isUnsavedPath, parseUnsavedPath } from '@/utils/file';
```

- [ ] **Step 3: 更新 `useOpenDraft.ts`**

将 `import { buildUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { buildUnsavedPath } from '@/utils/file';
```

- [ ] **Step 4: 更新 `DocumentTool/index.ts`**

将 `import { buildUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { buildUnsavedPath } from '@/utils/file';
```

- [ ] **Step 5: 更新 `FileReadTool/index.ts`**

将 `import { isUnsavedPath, parseUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { isUnsavedPath, parseUnsavedPath } from '@/utils/file';
```

- [ ] **Step 6: 更新 `FileWriteTool/index.ts`**

将 `import { parseUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { parseUnsavedPath } from '@/utils/file';
```

- [ ] **Step 7: 更新 `FileEditTool/index.ts`**

将 `import { parseUnsavedPath } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { parseUnsavedPath } from '@/utils/file';
```

- [ ] **Step 8: 更新 `fileTool.ts`**

将 `import { isUnsavedPath as isUnsavedPathUtil } from '@/utils/fileReference/unsavedPath'` 改为：
```typescript
import { isUnsavedPath as isUnsavedPathUtil } from '@/utils/file';
```

- [ ] **Step 9: 更新 `BChatSidebar/index.vue`**

将 `import type { FileReferenceNavigationTarget } from '@/utils/fileReference/types'` 改为：
```typescript
import type { FileReferenceNavigationTarget } from '@/utils/file';
```

---

### Task 6: 删除旧文件，验证编译

- [ ] **Step 1: 使用 grep 确认旧路径无残留引用**

```bash
rg "@/utils/fileTitle|@/utils/recentFile'|@/utils/fileReference/" src/ --files-with-matches
```
预期：输出为空（无匹配结果）

- [ ] **Step 2: 删除旧文件**

```bash
rm src/utils/fileTitle.ts
rm src/utils/recentFile.ts
rm -rf src/utils/fileReference/
```

- [ ] **Step 3: TypeScript 类型检查**

```bash
pnpm exec vue-tsc --noEmit
```
预期：无类型错误

- [ ] **Step 4: ESLint 检查**

```bash
pnpm lint
```
预期：通过，无错误

- [ ] **Step 5: Commit**

```bash
git add src/utils/file/ src/views/ src/components/ src/hooks/ src/ai/
git add src/utils/fileTitle.ts src/utils/recentFile.ts src/utils/fileReference/  # git rm
git commit -m "refactor: 统一文件工具模块到 src/utils/file"
```
