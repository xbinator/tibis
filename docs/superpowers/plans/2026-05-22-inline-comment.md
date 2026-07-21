# 行内批注（Inline Comment）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 BEditor 的 Markdown 编辑器添加行内批注能力，语法为 `[被批注文本]{comment="批注内容"}`，支持创建、查看、编辑、删除，Rich/Source 双模式共用同一份文档内容。

**Architecture:** 行内批注实现为 TipTap Mark（`InlineCommentMark`），通过自定义 `markdownTokenizer` 解析 `[]{comment=""}` 语法，通过 `renderMarkdown` 回写。创建流程复用已有的 `SelectionCommentInput` + 状态机。查看/编辑/删除通过浮层 `CommentCard` 组件实现，点击批注高亮时弹出。

**Tech Stack:** TipTap Mark + 自定义 markdownTokenizer + Vue 3 组件 + useSelectionAssistant 状态机

---

## 文件结构

| 操作 | 文件路径 | 职责 |
|---|---|---|
| 新建 | `src/components/BEditor/extensions/inlineCommentMark.ts` | InlineCommentMark 定义：TipTap Mark + markdownTokenizer + renderMarkdown |
| 新建 | `src/components/BEditor/shared/CommentCard.vue` | 批注浮层卡片：展示 annotatedText + 下拉菜单（编辑/删除），卡片内编辑 |
| 修改 | `src/components/BEditor/hooks/useExtensions.ts` | 注册 InlineCommentMark 到 editorExtensions |
| 修改 | `src/components/BEditor/shared/SelectionCommentInput.vue` | 添加提交按钮，emit `submit` 事件携带批注内容 |
| 修改 | `src/components/BEditor/hooks/useSelectionAssistant.ts` | 新增 `applyComment` 方法，关闭面板时应用批注 |
| 修改 | `src/components/BEditor/Markdown.vue` | 集成 CommentCard，处理批注点击事件 |
| 修改 | `src/components/BEditor/panes/PaneRichEditor.vue` | 监听批注 mark 点击，上抛事件 |
| 修改 | `src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts` | Source 模式批注语法高亮 |

---

### Task 1: InlineCommentMark 扩展

**Files:**
- Create: `src/components/BEditor/extensions/inlineCommentMark.ts`
- Modify: `src/components/BEditor/hooks/useExtensions.ts`

- [ ] **Step 1: 创建 InlineCommentMark 扩展文件**

```ts
/**
 * @file inlineCommentMark.ts
 * @description 行内批注 TipTap Mark 扩展，支持 [text]{comment="..."} 语法的解析与渲染。
 */
import { Mark, type MarkdownParseHelpers, type MarkdownParseResult, type MarkdownToken, type MarkdownTokenizer } from '@tiptap/core';

/** 行内批注属性 */
export interface InlineCommentAttrs {
  /** 批注内容 */
  comment: string;
  /** 批注唯一标识 */
  id: string;
}

/** 生成唯一批注 ID */
function generateCommentId(): string {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const InlineCommentMark = Mark.create({
  name: 'inlineComment',

  /**
   * 行内批注不需要与其他 mark 互斥，允许与 bold/italic 等叠加。
   */
  excludes: '',

  /**
   * 允许批注内的空格和换行被继承。
   */
  inclusive: false,

  addAttributes() {
    return {
      comment: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.comment) return {};
          return { 'data-comment': attributes.comment };
        }
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.id) return {};
          return { 'data-comment-id': attributes.id };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },

  /**
   * 自定义 markdown tokenizer，识别 [text]{comment="..."} 语法。
   */
  addMarkdownTokenizer(): MarkdownTokenizer {
    return {
      name: 'inlineComment',
      level: 'inline',
      start(src: string) {
        const index = src.indexOf(']{comment=');
        return index !== -1 ? src.lastIndexOf('[', index) : -1;
      },
      tokenize(src: string) {
        const match = src.match(/^\[([^\]]*?)\]\{comment="([^"]*?)"(?:\s+id="([^"]*?)")?\}/);
        if (!match) return undefined;

        const [, text, comment, id] = match;
        return {
          type: 'inlineComment',
          raw: match[0],
          text,
          comment,
          id: id || undefined,
        };
      },
    };
  },

  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
    const text = typeof token.text === 'string' ? token.text : '';
    const comment = typeof token.comment === 'string' ? token.comment : '';
    const id = typeof token.id === 'string' && token.id ? token.id : generateCommentId();

    const content = text ? [helpers.createTextNode(text)] : [];

    return {
      mark: 'inlineComment',
      content,
      attrs: { comment, id },
    };
  },

  renderMarkdown: (node: JSONContent): string => {
    const attrs = node.attrs ?? {};
    const comment = typeof attrs.comment === 'string' ? attrs.comment : '';
    const id = typeof attrs.id === 'string' ? attrs.id : '';

    const text = Array.isArray(node.content)
      ? node.content
          .filter((child) => child.type === 'text' && typeof child.text === 'string')
          .map((child) => child.text as string)
          .join('')
      : '';

    const idPart = id ? ` id="${id}"` : '';
    return `[${text}]{comment="${comment}"${idPart}}`;
  },
});
```

- [ ] **Step 2: 在 useExtensions.ts 中注册 InlineCommentMark**

在 `useExtensions.ts` 中导入并添加到 `editorExtensions` 数组：

1. 添加 import：`import { InlineCommentMark } from '../extensions/inlineCommentMark';`
2. 在 `editorExtensions` 数组中，在 `MarkdownLink` 之前添加 `InlineCommentMark`

- [ ] **Step 3: 验证 Markdown round-trip**

在编辑器中手动输入 `[需要改写]{comment="语气太硬"}`，确认：
- Rich 模式能正确解析并显示高亮
- 切换到 Source 模式能看到原始语法
- 切换回 Rich 模式语法不丢失

---

### Task 2: SelectionCommentInput 添加提交功能

**Files:**
- Modify: `src/components/BEditor/shared/SelectionCommentInput.vue`

- [ ] **Step 1: 修改 SelectionCommentInput，添加提交按钮和 submit 事件**

当前 `SelectionCommentInput` 只有一个输入框。需要：
1. 添加"提交"按钮（Enter 键也可提交）
2. emit `submit` 事件携带批注内容字符串
3. 提交后自动关闭面板

模板改为：
```html
<div v-if="visible" ref="wrapperRef" :class="name" :style="wrapperStyle">
  <div :class="bem('input-row')">
    <AInput v-model:value="inputValue" v-focus size="large" placeholder="输入批注..." @keydown="onKeydown" />
    <BButton type="primary" size="small" :disabled="!inputValue.trim()" @click.stop="submitComment">提 交</BButton>
  </div>
</div>
```

emit 声明增加：
```ts
defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'submit', content: string): void;
}>();
```

新增 `submitComment` 方法：
```ts
function submitComment(): void {
  const trimmed = inputValue.value.trim();
  if (!trimmed) return;
  emit('submit', trimmed);
  inputValue.value = '';
  emit('update:visible', false);
}
```

修改 `onKeydown`，Enter 提交：
```ts
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePanel();
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitComment();
  }
}
```

添加样式：
```less
.b-markdown-selcomment__input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
```

---

### Task 3: useSelectionAssistant 新增 applyComment 方法

**Files:**
- Modify: `src/components/BEditor/hooks/useSelectionAssistant.ts`
- Modify: `src/components/BEditor/adapters/selectionAssistant.ts`

- [ ] **Step 1: 在 SelectionAssistantAdapter 接口中新增 applyComment 方法**

在 `selectionAssistant.ts` 的 `SelectionAssistantAdapter` 接口中添加：
```ts
/** 应用行内批注到指定范围 */
applyComment?(range: SelectionAssistantRange, comment: string): void;
```

- [ ] **Step 2: 在 useSelectionAssistant 中新增 applyComment 方法**

```ts
/**
 * 提交批注内容，应用到当前缓存选区。
 * @param comment - 批注正文
 */
function applyComment(comment: string): void {
  const range = cachedSelectionRange.value;
  const adapter = getAdapter();
  if (!range || !adapter || !adapter.applyComment) return;

  adapter.applyComment(range, comment);
  adapter.clearSelectionHighlight();
  transitionTo('idle');
  clearPositions();
}
```

在 return 中导出 `applyComment`。

---

### Task 4: Rich 适配器实现 applyComment

**Files:**
- Modify: `src/components/BEditor/adapters/richSelectionAssistant.ts`

- [ ] **Step 1: 在 richSelectionAssistant 中实现 applyComment**

找到 `createRichSelectionAssistantAdapter` 函数，在返回的 adapter 对象中添加：

```ts
applyComment(range: SelectionAssistantRange, comment: string): void {
  const editor = getEditor();
  if (!editor) return;

  // 恢复选区
  editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).run();

  // 应用 inlineComment mark
  editor.chain().setMark('inlineComment', { comment, id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }).run();
},
```

---

### Task 5: CommentCard 浮层组件

**Files:**
- Create: `src/components/BEditor/shared/CommentCard.vue`

- [ ] **Step 1: 创建 CommentCard 组件**

CommentCard 功能：
- 展示 `annotatedText`（被批注的原文）
- 下拉菜单（编辑、删除）
- 编辑模式：卡片内切换为 textarea + 保存/取消按钮
- 定位逻辑参考 SelectionAIInput，浮层定位到批注 mark 附近

```vue
<!--
  @file CommentCard.vue
  @description 行内批注浮层卡片，展示被批注文本、批注内容，支持编辑和删除。
-->
<template>
  <div v-if="visible" ref="wrapperRef" :class="name" :style="wrapperStyle" @mousedown.prevent>
    <!-- 查看模式 -->
    <template v-if="!isEditing">
      <div :class="bem('header')">
        <div :class="bem('annotated')" :title="annotatedText">{{ annotatedText }}</div>
        <BDropdown :trigger="['click']">
          <template #default>
            <BButton type="text" size="small" :class="bem('more-btn')">
              <Icon icon="lucide:more-horizontal" />
            </BButton>
          </template>
          <template #overlay>
            <BMenu>
              <BMenuItem @click="startEditing">编辑</BMenuItem>
              <BMenuItem @click="handleDelete">删除</BMenuItem>
            </BMenu>
          </template>
        </BDropdown>
      </div>
      <div :class="bem('content')">{{ comment }}</div>
    </template>

    <!-- 编辑模式 -->
    <template v-else>
      <ATextarea v-model:value="editValue" :autosize="{ minRows: 2, maxRows: 6 }" placeholder="编辑批注..." />
      <div :class="bem('edit-actions')">
        <BButton type="secondary" size="small" @click="cancelEditing">取消</BButton>
        <BButton type="primary" size="small" @click="saveEditing">保存</BButton>
      </div>
    </template>
  </div>
</template>
```

Props：
```ts
interface Props {
  visible?: boolean;
  annotatedText?: string;
  comment?: string;
  position?: SelectionAssistantPosition | null;
}
```

Events：
```ts
defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'edit', newComment: string): void;
  (e: 'delete'): void;
}>();
```

定位逻辑与 SelectionCommentInput 类似，使用 `position` prop 计算浮层位置。

---

### Task 6: PaneRichEditor 监听批注 mark 点击

**Files:**
- Modify: `src/components/BEditor/panes/PaneRichEditor.vue`

- [ ] **Step 1: 在 PaneRichEditor 中添加批注点击处理**

在 `handleEditorClick` 方法中（或新增独立处理），检测点击目标是否在 `span[data-comment]` 内：

```ts
function handleCommentMarkClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const commentSpan = target.closest('span[data-comment]') as HTMLElement | null;
  if (!commentSpan) return;

  const comment = commentSpan.getAttribute('data-comment') ?? '';
  const commentId = commentSpan.getAttribute('data-comment-id') ?? '';

  // 获取被批注的文本
  const annotatedText = commentSpan.textContent ?? '';

  // 获取 mark 在文档中的位置
  const editor = editorInstance.value;
  if (!editor) return;

  const pos = editor.view.posAtDOM(commentSpan, 0);
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;

  // 从 pos 开始查找 inlineComment mark 的精确范围
  const $pos = editor.state.doc.resolve(pos);
  const mark = editor.state.schema.marks.inlineComment;
  if (!mark) return;

  // 向后扫描找到 mark 的完整范围
  let from = pos;
  let to = pos + (node.nodeSize ?? 1);

  // 向前查找 mark 起始位置
  for (let i = pos - 1; i >= 0; i--) {
    const prevNode = editor.state.doc.nodeAt(i);
    if (!prevNode || !prevNode.marks.some((m) => m.type === mark)) break;
    from = i;
  }

  // 向后查找 mark 结束位置
  for (let i = to; i < editor.state.doc.content.size; i++) {
    const nextNode = editor.state.doc.nodeAt(i);
    if (!nextNode || !nextNode.marks.some((m) => m.type === mark)) break;
    to = i + (nextNode.nodeSize ?? 1);
  }

  emit('comment-click', { comment, commentId, annotatedText, from, to });
}
```

在 template 的 `@click` 中调用 `handleCommentMarkClick`。

新增 emit：
```ts
const emit = defineEmits<{
  // ... 已有 emits
  (e: 'comment-click', payload: { comment: string; commentId: string; annotatedText: string; from: number; to: number }): void;
}>();
```

---

### Task 7: Markdown.vue 集成 CommentCard

**Files:**
- Modify: `src/components/BEditor/Markdown.vue`

- [ ] **Step 1: 添加 CommentCard 状态和事件处理**

```ts
import CommentCard from './shared/CommentCard.vue';

/** 当前激活的批注卡片信息 */
const activeComment = ref<{
  comment: string;
  commentId: string;
  annotatedText: string;
  from: number;
  to: number;
} | null>(null);

const commentCardVisible = computed(() => activeComment.value !== null);

/** 处理 Rich 编辑器中批注 mark 的点击 */
function handleCommentClick(payload: { comment: string; commentId: string; annotatedText: string; from: number; to: number }): void {
  activeComment.value = payload;
}

/** 处理批注编辑 */
function handleCommentEdit(newComment: string): void {
  if (!activeComment.value) return;
  const editor = richEditorPaneRef.value?.editorInstance;
  if (!editor) return;

  const { from, to, commentId } = activeComment.value;
  editor.chain()
    .setTextSelection({ from, to })
    .setMark('inlineComment', { comment: newComment, id: commentId })
    .run();

  activeComment.value = null;
}

/** 处理批注删除 */
function handleCommentDelete(): void {
  if (!activeComment.value) return;
  const editor = richEditorPaneRef.value?.editorInstance;
  if (!editor) return;

  const { from, to } = activeComment.value;
  editor.chain()
    .setTextSelection({ from, to })
    .unsetMark('inlineComment')
    .run();

  activeComment.value = null;
}
```

- [ ] **Step 2: 在模板中添加 CommentCard**

在 `SelectionCommentInput` 之后添加：

```html
<CommentCard
  :visible="commentCardVisible"
  :annotated-text="activeComment?.annotatedText ?? ''"
  :comment="activeComment?.comment ?? ''"
  :position="selectionAssistant.panelPosition.value"
  @update:visible="(v) => { if (!v) activeComment = null }"
  @edit="handleCommentEdit"
  @delete="handleCommentDelete"
/>
```

在 `PaneRichEditor` 上添加事件监听：
```html
@comment-click="handleCommentClick"
```

- [ ] **Step 3: 处理 SelectionCommentInput 的 submit 事件**

```html
<SelectionCommentInput
  :visible="selectionAssistant.commentInputVisible.value"
  :position="selectionAssistant.panelPosition.value"
  @update:visible="handleSelectionCommentVisibleChange"
  @submit="selectionAssistant.applyComment($event)"
/>
```

---

### Task 8: Source 模式批注语法高亮

**Files:**
- Modify: `src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts`

- [ ] **Step 1: 在 Source 模式中添加批注语法高亮**

在 `createMarkdownHighlightDecorations` 函数中，新增对 `[...]{comment="..."}` 模式的识别和高亮装饰：

- 批注内容区域（`[text]`）使用浅色背景高亮
- `{comment="..."}` 属性部分使用较淡的颜色标记

正则匹配：`/\[([^\]]*?)\]\{comment="[^"]*?"(?:\s+id="[^"]*?")?\}/g`

---

### Task 9: 批注高亮样式

**Files:**
- Modify: `src/components/BEditor/panes/PaneRichEditor.vue` (样式部分)

- [ ] **Step 1: 添加行内批注的 Rich 模式样式**

在 PaneRichEditor 的 `<style>` 中添加：

```less
span[data-comment] {
  background: rgba(255, 235, 92, 0.3);
  border-bottom: 2px solid rgba(255, 193, 7, 0.6);
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 235, 92, 0.5);
  }
}
```

---

### Task 10: 运行 lint 和类型检查

- [ ] **Step 1: 运行 vue-tsc 类型检查**

```bash
npx vue-tsc --noEmit
```

- [ ] **Step 2: 运行 ESLint 检查**

```bash
npx eslint src/components/BEditor/extensions/inlineCommentMark.ts src/components/BEditor/shared/CommentCard.vue src/components/BEditor/shared/SelectionCommentInput.vue src/components/BEditor/hooks/useExtensions.ts src/components/BEditor/hooks/useSelectionAssistant.ts src/components/BEditor/adapters/selectionAssistant.ts src/components/BEditor/adapters/richSelectionAssistant.ts src/components/BEditor/panes/PaneRichEditor.vue src/components/BEditor/Markdown.vue src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts
```

- [ ] **Step 3: 修复所有 lint 和类型错误**
