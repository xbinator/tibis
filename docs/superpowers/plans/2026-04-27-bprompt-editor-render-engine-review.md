# BPromptEditor 渲染引擎重构 - 代码审核报告

**审核日期**: 2026-04-27
**计划文档**: `docs/superpowers/plans/2026-04-27-bprompt-editor-render-engine.md`
**变更范围**: `src/components/BPromptEditor/`、`src/components/BChatSidebar/`、`test/components/`

---

## 审核结论

**修改符合计划设计，架构正确，建议合并。** 发现 2 处报告与实际代码的不一致和 1 处误导性说明，已修正。

---

## 各阶段变更对照

| 阶段 | 内容 | 文件 | 状态 |
|------|------|------|------|
| 1 | `variableChip.ts` 重构 | `extensions/variableChip.ts` | ✅ |
| 2 | `index.vue` 接口通用化 | `index.vue` | ✅ |
| 3 | `pasteHandler.ts` 回调化 | `extensions/pasteHandler.ts` | ✅ |
| 4 | BChatSidebar 实现 resolver | `BChatSidebar/index.vue` | ✅ |
| 5 | 移除 `useVariableEncoder.ts` | 删除 `hooks/` 目录 | ✅ |
| 6 | 测试更新 | `test/components/BPromptEditor/` | ✅ |

---

## 关键设计验证

### 1. StateField 状态隔离

```typescript
// variableChip.ts - 现在持有 ChipFieldState 而非 DecorationSet
interface ChipFieldState {
  resolver: ChipResolver;
  decorations: DecorationSet;
}
```

`atomicRanges` 正确取 `.decorations`（index.vue:244-247）：

```typescript
EditorView.atomicRanges.of((editorView) => {
  const chipState = editorView.state.field(variableChipField, false);
  return chipState?.decorations ?? Decoration.none;
})
```

每个 EditorView 实例独立持有 resolver，多实例 mount 时不会互相覆盖。

### 2. resolver 切换

```typescript
// index.vue:394-401
watch(
  () => props.chipResolver,
  (resolver) => {
    if (!view.value || !resolver) return;
    view.value.dispatch({
      effects: chipResolverEffect.of(resolver)
    });
  }
);
```

注意：watch 默认使用 `===` 引用相等比较，无需显式 `{ flush: 'sync' }`。当 resolver 引用不变时，watch 回调不会触发。计划要求消费者使用 `shallowRef` 包裹或定义为纯函数。

### 3. pasteHandler 异步处理

```typescript
// pasteHandler.ts
const result = onPasteFiles(Array.from(files));
if (result instanceof Promise) {
  console.warn('[pasteHandler] Async onPasteFiles not supported — position may be stale. Insertion skipped.');
  return true;
}
```

异步场景打 warning 并跳过插入，与计划同步优先策略一致。

### 4. token 构造外移到消费者

```typescript
// BChatSidebar/index.vue:408-422
function handleChatInsertFileReference(reference: FileReferenceChip): void {
  const token = `{{file-ref:${reference.referenceId}|${reference.fileName}|${reference.line}}}`;
  draftReferences.value = [
    ...draftReferences.value.filter((item) => item.id !== reference.referenceId),
    {
      id: reference.referenceId,
      token,
      documentId: reference.documentId,
      fileName: reference.fileName,
      line: String(reference.line),
      path: reference.filePath,
      snapshotId: ''
    }
  ];
  promptEditorRef.value?.insertTextAtCursor(token);
}
```

token 格式 `{{file-ref:referenceId|fileName|line}}`，与 chipResolver 解析一致。`BPromptEditor` 不再包含任何 `file-ref:` 格式知识。

### 5. FileRefWidget 迁移

从 `variableChip.ts` 移到 `BChatSidebar/index.vue:119-137`，DOM 结构和 CSS className（`b-prompt-chip b-prompt-chip--file`）保持不变：

```typescript
class FileRefWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'b-prompt-chip b-prompt-chip--file';
    span.textContent = this.line ? `${this.fileName}:${this.line}` : this.fileName;
    return span;
  }
}
```

### 6. useVariableEncoder.ts 移除

`BChatSidebar/index.vue` 已改为从 `@/components/BPromptEditor/types` 导入 `FileReferenceChip`。遗留的 `isPromptEditorEffectivelyEmpty` 函数已内联到测试文件中（`isPromptEditorContentEmpty`）。`hooks/` 目录已删除。

---

## 发现的问题

### 1. pasteHandler 不支持异步但保留 Promise 签名

`onPasteFiles` 签名包含 `Promise<string | null> | string | null`，但实现中检测到 Promise 即跳过。签名与行为不一致可能误导消费者。建议在签名上添加 JSDoc 明确说明"当前仅同步"，或直接改为同步签名。

### 2. pasteHandler 拖拽事件无 files 但触发了回调

```typescript
// pasteHandler.ts drop handler
if (files.length > 0 && onPasteFiles) {
  event.preventDefault();
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return true;  // ← 提前返回，但已经 preventDefault
  // ...
}
```

当拖拽位置无法映射到文档坐标时（`pos === null`），已经调用了 `preventDefault()` 但未插入任何内容，也没有调用 `onPasteFiles`。这是正确行为（不应在不合法位置插入），但 review 报告中未提及。

### 3. `getText()` 与 `insertTextAtCursor` lastSelection 清除不一致

`insertTextAtCursor` 插入后清除 `lastSelection.value = null`。`getText()` 是纯查询方法，无需操作 lastSelection。当前行为正确，但原始 review 报告中"`getText()` 未清除 lastSelection"这条是误导——`getText()` 本就不应清除。

---

## 测试覆盖

- `BPromptEditorRegression.test.ts`: 
  - 暴露方法检查同步更新为 `saveCursorPosition`、`insertTextAtCursor`、`getText`
  - `chipResolverEffect` 注入后验证 resolver 正确调用，覆盖 null/widget/mark 三条路径
  - 遗留的 `useVariableEncoder` 测试已移除，`isPromptEditorContentEmpty` 内联
- `file-reference-insert.test.ts`: 
  - `insertFileReference` → `insertTextAtCursor` / `handleChatInsertFileReference` 断言更新
  - 预存的 BChat 源码检查仍失败（`RichEditorHost.vue` 不存在），与本次重构无关

---

## 总结

架构重构正确，各阶段独立推进完成。BPromptEditor 现为纯渲染引擎，业务逻辑（FileRefWidget、file-ref: 格式解析）已全部迁移到 BChatSidebar。测试已同步更新。未见阻塞性问题，建议合并。
