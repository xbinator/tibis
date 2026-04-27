# 文件引用 line 字段拆分为 startLine/endLine 修改方案

## 背景

`handleFileReferenceInsert` 插入文件引用时，目前使用单一 `line` 字段表示行号。为了支持更精确的范围引用，需拆分为 `startLine` 和 `endLine` 两个独立字段。

## 修改范围

### 1. `src/shared/chat/fileReference.ts`

**ChatFileReferenceInsertPayload 接口**
```diff
- line: number | string;
+ startLine: number;
+ endLine: number;
```

**getLineRangeFromTextBeforeSelection 函数** — 返回类型从 `string` 改为对象，空字符串视为第 1 行开头
```diff
- ): string {
+ ): { startLine: number, endLine: number } {
    const startLine = textBeforeStart.split(/\r?\n/).length;
    const endLine = textBeforeEnd.split(/\r?\n/).length;
-   return startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
+   return { startLine, endLine };
  }
```

**isChatFileReferenceInsertPayload 守卫函数** — 同步更新校验逻辑，允许 `{0, 0}` 表示"无行号"
```diff
-  (typeof candidate.line === 'number' || (typeof candidate.line === 'string' && candidate.line.length > 0))
+  typeof candidate.startLine === 'number' &&
+  typeof candidate.endLine === 'number' &&
+  candidate.startLine >= 0 &&
+  (candidate.startLine === candidate.endLine || (candidate.startLine > 0 && candidate.endLine >= candidate.startLine))
```

---

### 2. `src/components/BChatSidebar/types.ts`

**FileReferenceChip 接口**
```diff
- /** 行号或行范围标签 */
- line: number | string;
+ /** 起始行号（1-based） */
+ startLine: number;
+ /** 结束行号（1-based），等于 startLine 时表示单行 */
+ endLine: number;
```

---

### 3. `src/components/BChatSidebar/index.vue`

**FileRefWidget 类**
```diff
- constructor(private fileName: string, private line: string) {
+ constructor(private fileName: string, private startLine: number, private endLine: number) {
```
- `eq()` 比较逻辑同步更新：
```diff
-  return this.fileName === other.fileName && this.line === other.line;
+  return this.fileName === other.fileName && this.startLine === other.startLine && this.endLine === other.endLine;
```
- `toDOM()` 更新，考虑行号为 0 的边界情况（粘贴文件无行号时只显示文件名）：
```diff
-  span.textContent = this.line ? `${this.fileName}:${this.line}` : this.fileName;
+  if (this.startLine > 0) {
+    span.textContent = this.startLine === this.endLine
+      ? `${this.fileName}:${this.startLine}`
+      : `${this.fileName}:${this.startLine}-${this.endLine}`;
+  } else {
+    span.textContent = this.fileName;
+  }
```

**chipResolver 函数** — 显式检测字段数，兼容旧 3 字段格式与当前 4 字段格式
```diff
-  const line = parts[2] || '';
-  return { widget: new FileRefWidget(fileName, line) };
+
+  // 旧格式（3 字段）: id|name|line  → parts.length === 3
+  // 新格式（4 字段）: id|name|startLine|endLine  → parts.length >= 4
+  if (parts.length >= 4) {
+    const rawStart = parts[2] !== undefined && parts[2] !== '' ? Number(parts[2]) : NaN;
+    const rawEnd = parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : NaN;
+    const startLine = Number.isNaN(rawStart) ? 0 : rawStart;
+    // endLine < startLine 时为异常数据，退化为单行引用
+    const endLine = Number.isNaN(rawEnd) || rawEnd < startLine ? startLine : rawEnd;
+    return { widget: new FileRefWidget(fileName, startLine, endLine) };
+  }
+
+  // 旧格式降级解析，line 为 "10" 或 "10-20" 字符串
+  const raw = parts[2] || '';
+  const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(raw);
+  if (rangeMatch) {
+    const start = Number(rangeMatch[1]);
+    const end = rangeMatch[2] !== undefined ? Number(rangeMatch[2]) : start;
+    return { widget: new FileRefWidget(fileName, start, end) };
+  }
+  // 格式损坏：降级为仅显示文件名（在 dev 模式下打印警告便于排查）
+  if (import.meta.env.DEV) {
+    console.warn('[chipResolver] 无法解析文件引用 token body:', body);
+  }
+  return { widget: new FileRefWidget(fileName, 0, 0) };
```

**onPasteFiles 函数** — token 格式增加 endLine 占位（粘贴文件无选区，均为 0）
```diff
-  .map((file) => `{{file-ref:${encodeURIComponent(file.name)}|${file.name}|}} `)
+  .map((file) => `{{file-ref:${encodeURIComponent(file.name)}|${file.name}|0|0}} `)
```

**handleFileReferenceInsert 函数**
```diff
-  line: reference.line
+  startLine: reference.startLine,
+  endLine: reference.endLine
```

**handleChatInsertFileReference 函数** — token 格式与 draftReferences 同步更新
```diff
-  const token = `{{file-ref:${reference.referenceId}|${reference.fileName}|${reference.line}}}`;
+  const token = `{{file-ref:${reference.referenceId}|${reference.fileName}|${reference.startLine}|${reference.endLine}}}`;
```
- draftReferences 中 `line` 字段（`ChatMessageFileReference.line` 保持 string 类型）需从 startLine/endLine 反算，`startLine === 0` 时为空字符串，下游 `parseLineRange` 对空字符串返回 `null`：
```diff
-      line: String(reference.line),
+      line: reference.startLine > 0
+        ? (reference.startLine === reference.endLine
+            ? String(reference.startLine)
+            : `${reference.startLine}-${reference.endLine}`)
+        : '',
```

---

### 4. `src/components/BEditor/components/SelectionToolbar.vue`（唯一调用方）

`getLineRangeFromTextBeforeSelection` 返回类型改为对象后，调用处需解构传入：
```diff
+  const range = getLineRangeFromTextBeforeSelection(textBeforeStart, textBeforeEnd);
   emitChatFileReferenceInsert({
     filePath: filePath ?? null,
     fileName: props.fileName || getFileNameFromPath(filePath ?? '未保存文件'),
-    line: getLineRangeFromTextBeforeSelection(textBeforeStart, textBeforeEnd)
+    startLine: range.startLine,
+    endLine: range.endLine
   });
```

---

### 5. 测试文件

**`test/components/BChatSidebar/file-reference-insert.test.ts`**

- `getLineRangeFromTextBeforeSelection` 测试断言需调整（覆盖空字符串边界）：
```diff
-  expect(getLineRangeFromTextBeforeSelection('first line', 'first line')).toBe('1');
-  expect(getLineRangeFromTextBeforeSelection('first\nsecond', 'first\nsecond\nthird')).toBe('2-3');
+  expect(getLineRangeFromTextBeforeSelection('first line', 'first line')).toEqual({ startLine: 1, endLine: 1 });
+  expect(getLineRangeFromTextBeforeSelection('first\nsecond', 'first\nsecond\nthird')).toEqual({ startLine: 2, endLine: 3 });
+  // 空字符串视为第 1 行开头
+  expect(getLineRangeFromTextBeforeSelection('', '')).toEqual({ startLine: 1, endLine: 1 });
```

- payload 验证测试需更新（覆盖正常、无行号、非法三种场景）：
```diff
-  expect(isChatFileReferenceInsertPayload({ filePath: 'src/foo/file.ts', fileName: 'file.ts', line: '12-14' })).toBe(true);
-  expect(isChatFileReferenceInsertPayload({ filePath: null, fileName: '临时笔记', line: '3' })).toBe(true);
-  expect(isChatFileReferenceInsertPayload({ filePath: 'src/foo/file.ts', fileName: 'file.ts', line: '' })).toBe(false);
+  expect(isChatFileReferenceInsertPayload({ filePath: 'src/foo/file.ts', fileName: 'file.ts', startLine: 12, endLine: 14 })).toBe(true);
+  expect(isChatFileReferenceInsertPayload({ filePath: null, fileName: '临时笔记', startLine: 3, endLine: 3 })).toBe(true);
+  // 无行号场景允许 startLine === endLine === 0（粘贴文件路径映射）
+  expect(isChatFileReferenceInsertPayload({ filePath: null, fileName: '临时笔记', startLine: 0, endLine: 0 })).toBe(true);
+  // startLine=0 但 endLine>0 歧义，拒绝
+  expect(isChatFileReferenceInsertPayload({ filePath: null, fileName: '临时笔记', startLine: 0, endLine: 5 })).toBe(false);
+  // startLine > endLine 非法
+  expect(isChatFileReferenceInsertPayload({ filePath: 'src/foo/file.ts', fileName: 'file.ts', startLine: 5, endLine: 2 })).toBe(false);
```

- 新增 `chipResolver` 向后兼容测试（`chipResolver` 定义在 index.vue 内，为便于单元测试建议将其提取到独立模块 `src/components/BChatSidebar/utils/chipResolver.ts` 并导出，再导入到测试中）：
```typescript
import { chipResolver } from '@/components/BChatSidebar/utils/chipResolver';
// 旧格式单行 → startLine=10, endLine=10
expect(chipResolver('file-ref:abc123|file.ts|10')).toStrictEqual({
  widget: expect.objectContaining({ fileName: 'file.ts', startLine: 10, endLine: 10 })
});
// 旧格式范围 → startLine=10, endLine=20
expect(chipResolver('file-ref:abc123|file.ts|10-20')).toStrictEqual({
  widget: expect.objectContaining({ fileName: 'file.ts', startLine: 10, endLine: 20 })
});
// 新格式范围 → startLine=5, endLine=15
expect(chipResolver('file-ref:abc123|file.ts|5|15')).toStrictEqual({
  widget: expect.objectContaining({ fileName: 'file.ts', startLine: 5, endLine: 15 })
});
// 新格式无行号 → startLine=0, endLine=0
expect(chipResolver('file-ref:abc123|file.ts|0|0')).toStrictEqual({
  widget: expect.objectContaining({ fileName: 'file.ts', startLine: 0, endLine: 0 })
});
// endLine < startLine 异常数据 → 退化为单行引用
expect(chipResolver('file-ref:abc123|file.ts|5|2')).toStrictEqual({
  widget: expect.objectContaining({ fileName: 'file.ts', startLine: 5, endLine: 5 })
});
```

- `FileRefWidget.toDOM()` 边界渲染测试（建议独立测试，`FileRefWidget` 为 index.vue 内定义类，可将测试放在组件级别测试文件中或通过 DOM 断言）：
```typescript
// 单行
expect(new FileRefWidget('file.ts', 5, 5).toDOM().textContent).toBe('file.ts:5');
// 范围
expect(new FileRefWidget('file.ts', 5, 15).toDOM().textContent).toBe('file.ts:5-15');
// 无行号
expect(new FileRefWidget('file.ts', 0, 0).toDOM().textContent).toBe('file.ts');
```

---

## 不需要修改的文件

| 文件 | 原因 |
|------|------|
| `components/MessageBubble/BubblePartText.vue` | 读取 `ChatMessageFileReference.line`（string），`"10"` 和 `"10-20"` 格式展示效果不变 |
| `utils/messageHelper.ts:expandFileReferencesForModel` | 使用 JSON 格式 `{{file-ref:{...}}}` token，独立于管道分隔格式，本次不改动 |
| `utils/fileReferenceContext.ts` | `parseLineRange` 已支持 `"10"` 和 `"10-20"` 格式解析，无需修改 |
| `test/components/BChat/message.test.ts` | 测试 JSON 格式 token，不涉及管道分隔格式 |

## 兼容性说明

- `ChatMessageFileReference.line`（`types/chat.d.ts`）保持 `string` 类型，用于存储和解析，支持 `"10"` 或 `"10-20"` 格式
- 新的 `FileReferenceChip` 和 `ChatFileReferenceInsertPayload` 使用独立的 `startLine`/`endLine` 数值类型
- `handleChatInsertFileReference` 中通过 `startLine === endLine` 判断单行/范围，将转换后的字符串写入 `ChatMessageFileReference.line`；`startLine === 0` 时写入空字符串
- Token 格式从 `{{file-ref:id|name|line}}` 升级为 `{{file-ref:id|name|startLine|endLine}}`，`chipResolver` 通过 `parts.length` 自动检测并降级解析旧 3 字段格式，避免静默出错
- `startLine === endLine === 0` 表示"无行号"语义（粘贴文件、无选区引用），`toDOM` 对此仅显示文件名
- `isChatFileReferenceInsertPayload` 允许 `startLine === 0 && endLine === 0` 通过校验（无行号路径），但拒绝 `startLine > endLine` 及 `startLine < 0` 等非法组合
