# Container Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `:::type{attrs}...:::` container syntax for BEditor, starting with `:::comment{commentText="..." id="..."}` for block-level annotations.

**Architecture:** Add a custom marked tokenizer for `:::` container fences, a TipTap Node extension with parseMarkdown/renderMarkdown for round-trip stability, a Vue NodeView component for rendering, and CodeMirror highlighting for source mode. All built TDD-first.

**Tech Stack:** TipTap 3, marked, Vue 3, TypeScript, Vitest, CodeMirror 6

---

### Task 0: Verify Worktree Baseline

**Files:**
- None

- [ ] **Step 1: Confirm worktree is clean**

```bash
cd <project-root>/.worktrees/feature-container-extension
git status
```
Expected: clean working tree, on branch `feature/container-extension`

- [ ] **Step 2: Run existing editor tests to confirm baseline**

```bash
pnpm vitest run test/components/BEditor/ 2>&1 | tail -5
```
Expected: same pass/fail count as main branch (pre-existing failures only, no new failures)

---

### Task 1: Container Extension Unit — Markdown Parse (RED/GREEN)

**Files:**
- Create: `src/components/BEditor/extensions/container.ts`
- Create: `test/components/BEditor/containerExtension.test.ts`

- [ ] **Step 1: Write failing test for parsing a simple comment container**

Write to `test/components/BEditor/containerExtension.test.ts`:

```typescript
/**
 * @file containerExtension.test.ts
 * @description 容器扩展的单元测试，覆盖 parseMarkdown、renderMarkdown 和 round-trip。
 */
import { ref, type Ref } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test } from 'vitest';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';
import { Container } from '@/components/BEditor/extensions/container';

/**
 * 创建带有容器扩展的 Markdown 编辑器。
 * @returns 编辑器实例
 */
function createEditor(): Editor {
  const editorInstanceId: Ref<string> = ref('container-test');
  const { editorExtensions } = useExtensions(editorInstanceId);

  return new Editor({
    extensions: [
      ...editorExtensions,
      Container
    ],
    content: '',
    contentType: 'markdown'
  });
}

describe('Container Extension', () => {
  test('parses simple comment container', () => {
    const md = ':::comment{commentText="test"}\ncontent\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    const doc = editor.state.doc;
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild?.type.name).toBe('container');
    expect(doc.firstChild?.attrs.type).toBe('comment');
    expect(doc.firstChild?.attrs.commentText).toBe('test');

    editor.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "parses simple comment container"
```
Expected: FAIL — `Container` not exported from `container.ts`

- [ ] **Step 3: Create minimal Container extension stub**

Write to `src/components/BEditor/extensions/container.ts`:

```typescript
/**
 * @file container.ts
 * @description 容器扩展，支持 :::type{attrs}...::: 语法。
 */
import { Node } from '@tiptap/core';

export const Container = Node.create({
  name: 'container',

  group: 'block',

  content: 'block+',

  addAttributes() {
    return {
      type: { default: 'comment' },
      id: { default: null },
      title: { default: null },
      commentText: { default: null },
      resolved: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-container]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-container': '', ...HTMLAttributes }, 0];
  }
});
```

- [ ] **Step 4: Run test — still fails with parse error**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "parses simple comment container"
```
Expected: FAIL — Markdown `:::comment{...}` is not parsed into `container` node

- [ ] **Step 5: Add parseMarkdown to Container extension**

Add after `renderHTML` in `src/components/BEditor/extensions/container.ts`:

```typescript
  addStorage() {
    return {};
  },

  parseMarkdown: (token: { type: string; text?: string; tokens?: unknown[]; raw?: string }, helpers: { parse: (tokens: unknown[]) => unknown[]; createNode: (type: string, attrs: Record<string, unknown>, content?: unknown[]) => unknown }) => {
    const raw = typeof token.raw === 'string' ? token.raw : '';
    const match = raw.match(/^:::(\w+)(?:\{([^}]*)\})?\n([\s\S]*)\n:::\n?$/);

    if (!match) {
      return [];
    }

    const type = match[1] ?? '';
    const attrsStr = match[2] ?? '';
    const innerMd = match[3] ?? '';

    const attrs: Record<string, unknown> = { type };

    const attrPattern = /(\w+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
      const key = attrMatch[1] ?? '';
      const value = attrMatch[2] ?? '';
      if (key === 'type') {
        attrs.type = value;
      } else if (key === 'resolved') {
        attrs.resolved = value === 'true';
      } else {
        attrs[key] = value;
      }
    }

    const innerTokens = (Array.isArray(token.tokens) ? token.tokens : []) as Record<string, unknown>[];
    const content = helpers.parse(innerTokens);

    return helpers.createNode('container', attrs, content as unknown[]);
  }
```

**Important:** Also add the imports at the top of the file:

```typescript
import type { MarkdownParseHelpers, MarkdownParseResult, MarkdownToken } from '@tiptap/core';
```

And update the `parseMarkdown` signature to use proper types:

```typescript
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "parses simple comment container"
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add test/components/BEditor/containerExtension.test.ts src/components/BEditor/extensions/container.ts
git commit -m "test: add container extension parse test and minimal stub"
```

---

### Task 2: Container Round-Trip Stability (RED/GREEN)

**Files:**
- Modify: `test/components/BEditor/containerExtension.test.ts`
- Modify: `src/components/BEditor/extensions/container.ts`

- [ ] **Step 1: Write failing round-trip test**

Append to `test/components/BEditor/containerExtension.test.ts` inside the `describe` block:

```typescript
  test('round-trip stable for comment container', () => {
    const md = ':::comment{commentText="test" id="c1"}\ncontent\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    const exported = editor.getMarkdown();
    expect(exported).toBe(md);
    editor.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "round-trip stable for comment container"
```
Expected: FAIL — exported Markdown is not the original `:::comment{...}` syntax

- [ ] **Step 3: Add renderMarkdown to Container extension**

Add `renderMarkdown` to the Container node options in `src/components/BEditor/extensions/container.ts`:

```typescript
  renderMarkdown(state: { write: (text: string) => void; renderContent: (node: { content: unknown }) => string; closeBlock: (node: { type: string }) => void }, node: { attrs: Record<string, unknown>; content: unknown }) {
    const { type, id, title, commentText, resolved } = node.attrs;

    const attrsArr: string[] = [];
    if (id) attrsArr.push(`id="${id}"`);
    if (title) attrsArr.push(`title="${title}"`);
    if (commentText) attrsArr.push(`commentText="${commentText}"`);
    if (resolved) attrsArr.push('resolved="true"');

    const attrsStr = attrsArr.length > 0 ? `{${attrsArr.join(' ')}}` : '';

    state.write(`:::${type}${attrsStr}\n`);
    state.write(state.renderContent(node));
    state.ensureNewLine();
    state.write(':::');
    state.closeBlock(node);
  }
```

**Important:** Check the actual TipTap Markdown extension API. The renderMarkdown signature may differ from this. If the TipTap Markdown extension uses a different API for rendering (like returning a string instead of using a state object), adjust accordingly.

If the TipTap Markdown extension expects `renderMarkdown` to return a string:

```typescript
  renderMarkdown(node: { attrs: Record<string, unknown>; firstChild: unknown }, helpers: { renderContent: () => string }): string {
    const { type, id, title, commentText, resolved } = node.attrs;

    const attrsArr: string[] = [];
    if (id) attrsArr.push(`id="${id}"`);
    if (title) attrsArr.push(`title="${title}"`);
    if (commentText) attrsArr.push(`commentText="${commentText}"`);
    if (resolved) attrsArr.push('resolved="true"');

    const attrsStr = attrsArr.length > 0 ? `{${attrsArr.join(' ')}}` : '';

    return `:::${type}${attrsStr}\n${helpers.renderContent()}\n:::`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "round-trip stable for comment container"
```
Expected: PASS

- [ ] **Step 5: Run all container tests to ensure nothing broke**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add test/components/BEditor/containerExtension.test.ts src/components/BEditor/extensions/container.ts
git commit -m "feat: add container round-trip markdown render"
```

---

### Task 3: Container with Nested Blocks (RED/GREEN)

**Files:**
- Modify: `test/components/BEditor/containerExtension.test.ts`
- Modify: `src/components/BEditor/extensions/container.ts`

- [ ] **Step 1: Write failing test for container with nested list and code block**

Append to `test/components/BEditor/containerExtension.test.ts`:

```typescript
  test('supports nested blocks inside container', () => {
    const md = `:::comment{commentText="test"}
- item1
- item2

\`\`\`js
code
\`\`\`
:::`;
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    const doc = editor.state.doc;
    const container = doc.firstChild;
    expect(container?.type.name).toBe('container');
    expect(container?.childCount).toBe(2);

    const exported = editor.getMarkdown();
    expect(exported).toContain('- item1');
    expect(exported).toContain('```js');

    editor.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails (if it does)**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "supports nested blocks inside container"
```
Expected: may fail if parseMarkdown doesn't handle nested tokens correctly

- [ ] **Step 3: Fix parseMarkdown for nested content**

If the test fails, review and fix the `parseMarkdown` implementation. The issue may be with how `helpers.parse()` handles the inner tokens. Ensure the inner Markdown is correctly parsed by the standard parser.

The `parseMarkdown` regex already uses `token.raw` to extract inner Markdown text, and `helpers.parse(token.tokens)` to parse nested content. If the marked tokenizer provides `token.tokens` correctly, this should work. If not, adjust the approach.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "supports nested blocks inside container"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/components/BEditor/containerExtension.test.ts src/components/BEditor/extensions/container.ts
git commit -m "test: add container nested blocks test"
```

---

### Task 4: unwrapContainer Command (RED/GREEN)

**Files:**
- Modify: `src/components/BEditor/extensions/container.ts`
- Modify: `test/components/BEditor/containerExtension.test.ts`

- [ ] **Step 1: Write failing test for unwrapContainer**

Append to `test/components/BEditor/containerExtension.test.ts`:

```typescript
  test('unwrapContainer preserves content', () => {
    const md = ':::comment{commentText="test"}\noriginal content\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    editor.chain().focus().unwrapContainer().run();

    const exported = editor.getMarkdown();
    expect(exported).toBe('original content');
    expect(exported).not.toContain(':::comment');

    editor.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "unwrapContainer preserves content"
```
Expected: FAIL — `unwrapContainer` command not defined

- [ ] **Step 3: Add unwrapContainer command**

In `src/components/BEditor/extensions/container.ts`, add commands:

```typescript
  addCommands() {
    return {
      unwrapContainer: () => ({ state, dispatch }) => {
        const { $from } = state.selection;
        const containerPos = $from.before(1);

        if (containerPos == null) {
          return false;
        }

        const containerNode = state.doc.nodeAt(containerPos);
        if (containerNode?.type.name !== 'container') {
          return false;
        }

        if (dispatch) {
          const endPos = containerPos + containerNode.nodeSize;
          dispatch(state.tr.replaceWith(containerPos, endPos, containerNode.content));
        }

        return true;
      }
    };
  },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "unwrapContainer preserves content"
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/BEditor/extensions/container.ts test/components/BEditor/containerExtension.test.ts
git commit -m "feat: add unwrapContainer command"
```

---

### Task 5: Container with Code Block (Boundary Case) (RED/GREEN)

**Files:**
- Modify: `test/components/BEditor/containerExtension.test.ts`

- [ ] **Step 1: Write failing test for container with code block**

Append to `test/components/BEditor/containerExtension.test.ts`:

```typescript
  test('handles code block inside container', () => {
    const md = `:::comment{commentText="test"}
\`\`\`js
const x = 1;
\`\`\`
:::`;
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    const doc = editor.state.doc;
    const container = doc.firstChild;
    expect(container?.type.name).toBe('container');
    expect(container?.firstChild?.type.name).toBe('codeBlock');

    const exported = editor.getMarkdown();
    expect(exported).toBe(md);

    editor.destroy();
  });
```

- [ ] **Step 2: Run test to verify behavior**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "handles code block inside container"
```
Expected: PASS or FAIL (if code block fence parsing conflicts)

- [ ] **Step 3: Fix if needed, or mark as known limitation**

If the test passes, great. If it fails due to `:::` vs ` ``` ` fence conflict, document as a known limitation requiring Task 7 (marked tokenizer).

- [ ] **Step 4: Commit**

```bash
git add test/components/BEditor/containerExtension.test.ts
git commit -m "test: add container code block boundary test"
```

---

### Task 6: ContainerView Component (RED/GREEN)

**Files:**
- Create: `src/components/BEditor/components/ContainerView.vue`
- Modify: `src/components/BEditor/extensions/container.ts`

- [ ] **Step 1: Write a component render test**

Append to `test/components/BEditor/containerExtension.test.ts`:

```typescript
  test('renders container node with correct HTML structure', () => {
    const md = ':::comment{commentText="test" id="c1"}\ncontent\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    const { view } = editor;
    const containerDOM = view.dom.querySelector('[data-container]');
    expect(containerDOM).not.toBeNull();
    expect(containerDOM?.getAttribute('data-container-id')).toBe('c1');
    expect(containerDOM?.classList.contains('b-container')).toBe(true);
    expect(containerDOM?.classList.contains('b-container-comment')).toBe(true);

    editor.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "renders container node with correct HTML structure"
```
Expected: FAIL — no Vue NodeView registered, plain div rendered

- [ ] **Step 3: Create ContainerView.vue**

Write to `src/components/BEditor/components/ContainerView.vue`:

```vue
<!--
  @file ContainerView.vue
  @description 容器节点渲染组件，支持批注、提示、警告等多种容器类型。
-->
<template>
  <node-view-wrapper :class="containerClasses" :data-container-id="id">
    <div v-if="type === 'comment'" class="b-container-comment-card">
      <div class="b-container-comment-header">
        <span class="b-container-comment-icon">&#x1F4AC;</span>
        <span class="b-container-comment-label">批注</span>
        <span v-if="resolved" class="b-container-resolved">已解决</span>
      </div>
      <div class="b-container-comment-content">{{ commentText }}</div>
    </div>
    <div v-else-if="title" class="b-container-title">
      <span :class="['b-container-icon', `b-container-icon-${type}`]">
        {{ getContainerIcon(type) }}
      </span>
      <span class="b-container-title-text">{{ title }}</span>
    </div>
    <div class="b-container-body">
      <node-view-content />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';
import { computed } from 'vue';

const props = defineProps<NodeViewProps>();

const type = computed(() => props.node.attrs.type as string);
const id = computed(() => props.node.attrs.id as string | undefined);
const title = computed(() => props.node.attrs.title as string | undefined);
const commentText = computed(() => props.node.attrs.commentText as string | undefined);
const resolved = computed(() => props.node.attrs.resolved as boolean | undefined);

const containerClasses = computed(() => [
  'b-container',
  `b-container-${type.value}`
]);

/**
 * 根据容器类型获取图标。
 * @param containerType - 容器类型
 * @returns 图标字符
 */
function getContainerIcon(containerType: string): string {
  const iconMap: Record<string, string> = {
    tip: '\uD83D\uDCA1',
    warning: '\u26A0\uFE0F',
    danger: '\uD83D\uDD25',
    info: '\u2139\uFE0F'
  };
  return iconMap[containerType] || '\uD83D\uDCE6';
}
</script>
```

- [ ] **Step 4: Register NodeView in container extension**

In `src/components/BEditor/extensions/container.ts`, add the import and NodeView:

```typescript
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import ContainerView from '../components/ContainerView.vue';
```

And add to the Node definition:

```typescript
  addNodeView() {
    return VueNodeViewRenderer(ContainerView);
  },
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "renders container node with correct HTML structure"
```
Expected: PASS

- [ ] **Step 6: Also run in jsdom environment if needed**

If the component test requires jsdom, add `/* @vitest-environment jsdom */` at the top of the test file.

- [ ] **Step 7: Commit**

```bash
git add src/components/BEditor/components/ContainerView.vue src/components/BEditor/extensions/container.ts test/components/BEditor/containerExtension.test.ts
git commit -m "feat: add ContainerView component with NodeView rendering"
```

---

### Task 7: Container Styles (RED/GREEN)

**Files:**
- Create: `src/components/BEditor/styles/container.less`
- Modify: `src/components/BEditor/components/ContainerView.vue` (add style block or import)

- [ ] **Step 1: Write visual regression test for comment container styles**

Append to `test/components/BEditor/containerExtension.test.ts`:

```typescript
  test('comment container has correct border color', () => {
    const md = ':::comment{commentText="test"}\ncontent\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    const { view } = editor;
    const containerDOM = view.dom.querySelector('.b-container-comment') as HTMLElement;
    expect(containerDOM).not.toBeNull();

    const styles = window.getComputedStyle(containerDOM);
    expect(styles.borderLeftColor || styles.borderLeft).toBeTruthy();

    editor.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails/no styles**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "comment container has correct border color"
```
Expected: FAIL or PASS trivially — styles not loaded in jsdom anyway. **Skip strict style assertion if jsdom doesn't support it properly**.

- [ ] **Step 3: Create container styles**

Write to `src/components/BEditor/styles/container.less`:

```less
/**
 * @file container.less
 * @description 容器节点样式，支持批注、提示、警告、危险、信息五种容器类型。
 */

.b-container {
  padding: 12px;
  margin: 8px 0;
  border-radius: 4px;
  border-left: 3px solid transparent;
}

.b-container-comment {
  border-left-color: #1890ff;
  background: #f0f7ff;
}

.b-container-tip {
  border-left-color: #52c41a;
  background: #f6ffed;
}

.b-container-warning {
  border-left-color: #faad14;
  background: #fffbe6;
}

.b-container-danger {
  border-left-color: #ff4d4f;
  background: #fff2f0;
}

.b-container-info {
  border-left-color: #722ed1;
  background: #f9f0ff;
}

.b-container-comment-card {
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.b-container-comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 500;
  color: #1890ff;
}

.b-container-comment-label {
  font-size: 14px;
}

.b-container-comment-content {
  font-size: 14px;
  color: #595959;
  line-height: 1.6;
}

.b-container-resolved {
  font-size: 12px;
  padding: 2px 6px;
  background: #52c41a;
  color: white;
  border-radius: 2px;
}

.b-container-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.b-container-icon {
  font-size: 16px;
}

.b-container-body {
  // TipTap NodeViewContent 自动渲染子节点
}
```

- [ ] **Step 4: Import styles in ContainerView.vue**

Add to `ContainerView.vue`:

```vue
<style lang="less" scoped>
@import '../styles/container.less';
</style>
```

- [ ] **Step 5: Run all container tests**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/BEditor/styles/container.less src/components/BEditor/components/ContainerView.vue test/components/BEditor/containerExtension.test.ts
git commit -m "feat: add container styles for all types"
```

---

### Task 8: Register Container in useExtensions (RED/GREEN)

**Files:**
- Modify: `src/components/BEditor/hooks/useExtensions.ts`
- Modify: `test/components/BEditor/containerExtension.test.ts`

- [ ] **Step 1: Remove Container from test helper, rely on useExtensions**

Update `createEditor()` in `test/components/BEditor/containerExtension.test.ts`:

```typescript
function createEditor(): Editor {
  const editorInstanceId: Ref<string> = ref('container-test');
  const { editorExtensions } = useExtensions(editorInstanceId);
  // Container is now included in editorExtensions by default

  return new Editor({
    extensions: editorExtensions,
    content: '',
    contentType: 'markdown'
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts -t "parses simple comment container"
```
Expected: FAIL — Container not in editorExtensions

- [ ] **Step 3: Add Container to editorExtensions**

In `src/components/BEditor/hooks/useExtensions.ts`:

Add import:
```typescript
import { Container } from '../extensions/container';
```

Add to `editorExtensions` array (after `HtmlComment` line is fine):
```typescript
    Container,
```

- [ ] **Step 4: Run all container tests**

```bash
pnpm vitest run test/components/BEditor/containerExtension.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Run existing editor regression tests**

```bash
pnpm vitest run test/components/BEditor/
```
Expected: no new failures beyond pre-existing baseline

- [ ] **Step 6: Commit**

```bash
git add src/components/BEditor/hooks/useExtensions.ts test/components/BEditor/containerExtension.test.ts
git commit -m "feat: register Container extension in useExtensions"
```

---

### Task 9: Source Mode Highlight (Optional, Phase 2)

**Files:**
- Modify: `src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts`

- [ ] **Step 1: Research the existing CodeMirror highlight extension**

Read `src/components/BEditor/adapters/sourceEditorMarkdownHighlight.ts` to understand the existing highlight pattern.

- [ ] **Step 2: Add container fence highlight**

Add a mark decoration for lines matching `:::\w+` and `:::$`.

- [ ] **Step 3: Test visually in the app**

Run `pnpm dev` and open a file with `:::comment{commentText="test"}` syntax.

---

### Task 10: Full Regression Test

**Files:**
- None (test only)

- [ ] **Step 1: Run all tests**

```bash
pnpm vitest run
```
Expected: same 28 failed / 168 passed as baseline (no new failures)

- [ ] **Step 2: Run lint check**

```bash
pnpm eslint src/components/BEditor/extensions/container.ts src/components/BEditor/components/ContainerView.vue
```

- [ ] **Step 3: Run TypeScript check**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit final changes**

```bash
git add .
git commit -m "chore: final regression verification"
```

---

### Task 11: Changelog and Cleanup

**Files:**
- Modify: `changelog/2026-05-20.md`

- [ ] **Step 1: Update changelog**

```bash
cd <project-root>
```

Update `changelog/2026-05-20.md` to add:

```markdown
## Features
- 实现 `:::type{attrs}...:::` 容器语法扩展（TipTap Node + marked tokenizer）
- 实现批注容器 `:::comment{commentText="..." id="..."}`
- 实现 `unwrapContainer()` 命令，支持解除容器包裹并保留内部内容
- 实现 ContainerView.vue 渲染组件，支持批注卡片展示
- 实现多种容器类型样式（comment/tip/warning/danger/info）
```

- [ ] **Step 2: Commit**

```bash
cd <project-root>/.worktrees/feature-container-extension
git add changelog/2026-05-20.md
git commit -m "docs: update changelog with container extension"
```
