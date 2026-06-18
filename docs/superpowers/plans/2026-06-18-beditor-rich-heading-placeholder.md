# BEditor Rich Heading Placeholder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `H1` through `H6` placeholders in empty rich-mode Markdown heading blocks, with placeholder typography matching the heading level.

**Architecture:** Keep the behavior inside BEditor Rich mode by sharing one placeholder resolver from `useExtensions.ts` across runtime and parser extension lists. Keep presentation in `PaneRichEditor.vue` so heading placeholder size follows the existing H1-H6 visual scale.

**Tech Stack:** Vue 3, Tiptap Placeholder extension, Vitest, Less.

---

### Task 1: Placeholder Resolver

**Files:**
- Modify: `src/components/BEditor/hooks/useExtensions.ts`
- Test: `test/components/BEditor/rich-placeholder.test.ts`

- [x] **Step 1: Write the failing test**

Create `test/components/BEditor/rich-placeholder.test.ts`:

```ts
/**
 * @file rich-placeholder.test.ts
 * @description BEditor Rich 模式标题占位文案测试。
 */
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { resolveRichEditorPlaceholder } from '@/components/BEditor/hooks/useExtensions';

/**
 * 构建最小 Tiptap 节点对象。
 * @param type - 节点类型
 * @param attrs - 节点属性
 * @returns 最小 JSONContent 节点
 */
function createNode(type: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type, attrs };
}

describe('resolveRichEditorPlaceholder', (): void => {
  it('returns heading level labels for empty heading blocks', (): void => {
    expect(resolveRichEditorPlaceholder({ node: createNode('heading', { level: 1 }) })).toBe('H1');
    expect(resolveRichEditorPlaceholder({ node: createNode('heading', { level: 2 }) })).toBe('H2');
    expect(resolveRichEditorPlaceholder({ node: createNode('heading', { level: 3 }) })).toBe('H3');
    expect(resolveRichEditorPlaceholder({ node: createNode('heading', { level: 4 }) })).toBe('H4');
    expect(resolveRichEditorPlaceholder({ node: createNode('heading', { level: 5 }) })).toBe('H5');
    expect(resolveRichEditorPlaceholder({ node: createNode('heading', { level: 6 }) })).toBe('H6');
  });

  it('keeps the default placeholder for non-heading blocks', (): void => {
    expect(resolveRichEditorPlaceholder({ node: createNode('paragraph') })).toBe('请输入内容');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/components/BEditor/rich-placeholder.test.ts`

Expected: FAIL because `resolveRichEditorPlaceholder` is not exported.

- [x] **Step 3: Write minimal implementation**

Add an exported resolver near the top of `src/components/BEditor/hooks/useExtensions.ts`:

```ts
export const RICH_EDITOR_DEFAULT_PLACEHOLDER = '请输入内容';

export interface RichEditorPlaceholderContext {
  node: {
    type?: {
      name?: string;
    };
    attrs?: Record<string, unknown>;
  };
}

export function resolveRichEditorPlaceholder({ node }: RichEditorPlaceholderContext): string {
  if (node.type?.name === 'heading') {
    const level = Number(node.attrs?.level);
    if (Number.isInteger(level) && level >= 1 && level <= 6) {
      return `H${level}`;
    }
  }

  return RICH_EDITOR_DEFAULT_PLACEHOLDER;
}
```

Then replace both `Placeholder.configure({ emptyEditorClass: 'is-editor-empty', placeholder: '请输入内容' })` calls with `Placeholder.configure({ emptyEditorClass: 'is-editor-empty', placeholder: resolveRichEditorPlaceholder })`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/components/BEditor/rich-placeholder.test.ts`

Expected: PASS.

### Task 2: Heading Placeholder Styles

**Files:**
- Modify: `src/components/BEditor/panes/PaneRichEditor.vue`
- Test: `test/components/BEditor/rich-placeholder.test.ts`

- [x] **Step 1: Add failing style assertions**

Append a source-reading test to `test/components/BEditor/rich-placeholder.test.ts` that checks H1-H6 placeholder selectors exist and use the heading font sizes.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/components/BEditor/rich-placeholder.test.ts`

Expected: FAIL because heading placeholder selectors are absent.

- [x] **Step 3: Add scoped rich editor styles**

In `PaneRichEditor.vue`, keep the default placeholder color/line-height rule and add explicit selectors:

```less
h1.is-editor-empty::before {
  font-size: 24px;
}

h2.is-editor-empty::before {
  font-size: 20px;
}
```

Continue through H6 with the existing heading font sizes.

- [x] **Step 4: Run focused tests**

Run: `pnpm exec vitest run test/components/BEditor/rich-placeholder.test.ts`

Expected: PASS.

### Task 3: Changelog And Verification

**Files:**
- Modify: `changelog/2026-06-18.md`

- [x] **Step 1: Update changelog**

Add under `## Changed`:

```md
- BEditor Rich 模式空标题块占位文案改为 `H1` 至 `H6`，并让占位字号跟随标题级别。
```

- [x] **Step 2: Run targeted verification**

Run: `pnpm exec vitest run test/components/BEditor/rich-placeholder.test.ts test/components/BEditor/rich-selection-style.test.ts`

Expected: PASS.
