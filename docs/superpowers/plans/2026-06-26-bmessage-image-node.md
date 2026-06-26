# BMessage ImageNode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract BMessage markdown image rendering into a focused `ImageNode.vue` component.

**Architecture:** `InlineNode.vue` remains the inline AST dispatcher. `ImageNode.vue` owns all `ImageInlineNode` UI, state, injected preview context, clipboard behavior, and scoped image styles.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Less scoped styles, Vitest, vue-tsc.

---

### Task 1: Extract ImageNode

**Files:**
- Create: `src/components/BMessage/components/ImageNode.vue`
- Modify: `src/components/BMessage/components/InlineNode.vue`
- Modify: `changelog/2026-06-26.md`

- [x] **Step 1: Create `ImageNode.vue`**

Create a Vue component with:

```vue
<!--
  @file ImageNode.vue
  @description BMessage 图片行内节点渲染组件。
-->
<template>
  <span :class="bem('image')">
    <img
      :src="node.src"
      :alt="node.alt"
      :title="node.title || undefined"
      :class="bem('image-img')"
      @click="handleImageClick"
      @mousedown="handleImageMouseDown"
      @error="handleImageError"
    />
    <button
      v-if="!imageLoadError"
      type="button"
      :class="bem('image-copy')"
      title="复制图片"
      aria-label="复制图片"
      @click="handleImageCopyClick"
      @mousedown.stop.prevent
    >
      <BIcon icon="lucide:copy" :size="14" />
    </button>
  </span>
</template>
```

Use `ImageInlineNode` for props, inject `MESSAGE_NODE_RENDER_CONTEXT_KEY`, call `useClipboard().copyImage`, reset `imageLoadError` when `node.src` changes, and move the existing image handlers from `InlineNode.vue`.

- [x] **Step 2: Replace the image branch in `InlineNode.vue`**

Replace the current `node.type === 'image'` template branch with:

```vue
<ImageNode v-else-if="node.type === 'image'" :node="node" />
```

Remove image-specific imports, refs, watcher, clipboard usage, and handlers from `InlineNode.vue`. Keep link navigation logic in `InlineNode.vue`.

- [x] **Step 3: Move scoped image styles**

Move `.b-message__image`, `.b-message__image-img`, and `.b-message__image-copy` styles into `ImageNode.vue`. Leave `InlineNode.vue` without an empty `<style>` block.

- [x] **Step 4: Update changelog**

Add this entry under `## Changed` in `changelog/2026-06-26.md`:

```markdown
- 抽离 BMessage 图片行内节点为独立 ImageNode 组件，收拢图片预览、复制和加载错误处理逻辑。
```

- [x] **Step 5: Verify**

Run:

```bash
pnpm exec vue-tsc --noEmit
pnpm test -- test/components/BMessage/image-viewer.test.ts test/components/BMessage/node-renderer.test.ts
pnpm exec stylelint 'src/components/BMessage/components/*.{vue,less,css}'
```

Expected: all commands complete without errors.

Actual:
- `pnpm test -- test/components/BMessage/image-viewer.test.ts test/components/BMessage/node-renderer.test.ts` passed; the script ran all Vitest files.
- `pnpm exec tsc --noEmit` passed.
- `pnpm exec eslint src/components/BMessage/components/InlineNode.vue src/components/BMessage/components/ImageNode.vue test/components/BMessage/image-viewer.test.ts --ext .vue,.ts` passed.
- `pnpm exec stylelint 'src/components/BMessage/components/*.{vue,less,css}'` passed.
- `pnpm exec vue-tsc --noEmit` failed on existing non-BMessage type errors in BDrawing, BChat, BEditor, and BPromptEditor files.
