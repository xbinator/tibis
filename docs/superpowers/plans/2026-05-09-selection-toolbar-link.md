# Selection Toolbar 链接功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Rich 模式选区工具栏中新增链接设置/取消功能

**Architecture:** 扩展 `SelectionToolbarAction` 类型新增 `'link'`，在 `SelectionToolbarRich` 宿主中新增 `LinkPopover` 浮层组件处理 URL 输入，通过 TipTap 的 `setLink`/`unsetLink` 命令操作链接。不含链接时弹窗输入 URL，含链接时直接移除。

**Tech Stack:** Vue 3 + TypeScript + TipTap (`@tiptap/extension-link`) + Iconify

---

### Task 1: 扩展 SelectionToolbarAction 类型

**Files:**
- Modify: `src/components/BMarkdown/adapters/selectionAssistant.ts:61`

- [ ] **Step 1: 在 SelectionToolbarAction 联合类型中新增 'link'**

将第 61 行：
```typescript
export type SelectionToolbarAction = 'ai' | 'reference' | 'bold' | 'italic' | 'underline' | 'strike' | 'code';
```
改为：
```typescript
export type SelectionToolbarAction = 'ai' | 'reference' | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link';
```

- [ ] **Step 2: 验证类型检查通过**

```bash
npx vue-tsc --noEmit --project tsconfig.web.json 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/components/BMarkdown/adapters/selectionAssistant.ts
git commit -m "feat: add link action to SelectionToolbarAction type"
```

---

### Task 2: PaneRichEditor 添加 link 按钮

**Files:**
- Modify: `src/components/BMarkdown/components/PaneRichEditor.vue:164-170`

- [ ] **Step 1: 在 formatButtons 数组中新增 link 按钮**

将第 164-170 行：
```typescript
const formatButtons = computed(() => [
  { command: 'bold' as SelectionToolbarAction, icon: 'lucide:bold' },
  { command: 'italic' as SelectionToolbarAction, icon: 'lucide:italic' },
  { command: 'underline' as SelectionToolbarAction, icon: 'lucide:underline' },
  { command: 'strike' as SelectionToolbarAction, icon: 'lucide:strikethrough' },
  { command: 'code' as SelectionToolbarAction, icon: 'lucide:code' }
]);
```
改为：
```typescript
const formatButtons = computed(() => [
  { command: 'bold' as SelectionToolbarAction, icon: 'lucide:bold' },
  { command: 'italic' as SelectionToolbarAction, icon: 'lucide:italic' },
  { command: 'underline' as SelectionToolbarAction, icon: 'lucide:underline' },
  { command: 'strike' as SelectionToolbarAction, icon: 'lucide:strikethrough' },
  { command: 'code' as SelectionToolbarAction, icon: 'lucide:code' },
  { command: 'link' as SelectionToolbarAction, icon: 'lucide:link' }
]);
```

- [ ] **Step 2: 验证类型检查通过**

```bash
npx vue-tsc --noEmit --project tsconfig.web.json 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/components/BMarkdown/components/PaneRichEditor.vue
git commit -m "feat: add link button to rich editor format buttons"
```

---

### Task 3: 创建 LinkPopover 浮层组件

**Files:**
- Create: `src/components/BMarkdown/components/LinkPopover.vue`

- [ ] **Step 1: 创建 LinkPopover.vue**

```vue
<template>
  <Teleport v-if="overlayRoot && visible" :to="overlayRoot">
    <div ref="popoverRef" class="rich-link-popover" :style="popoverStyle">
      <input
        ref="inputRef"
        v-model="href"
        type="url"
        class="rich-link-popover__input"
        placeholder="输入链接地址..."
        @keydown.enter="confirm"
        @keydown.escape="cancel"
      />
      <button type="button" class="rich-link-popover__btn rich-link-popover__btn--confirm" :disabled="!href.trim()" @mousedown.prevent="confirm">
        <Icon icon="lucide:check" />
      </button>
      <button type="button" class="rich-link-popover__btn rich-link-popover__btn--cancel" @mousedown.prevent="cancel">
        <Icon icon="lucide:x" />
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * @file LinkPopover.vue
 * @description 链接 URL 输入浮层，在选区工具栏旁弹出，用于设置链接地址。
 */
import type { CSSProperties } from 'vue';
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { Icon } from '@iconify/vue';

interface Props {
  /** 是否显示弹窗 */
  visible?: boolean;
  /** 浮层根容器 */
  overlayRoot?: HTMLElement | null;
  /** 定位锚点 DOM（工具栏元素），用于计算弹窗位置 */
  anchorElement?: HTMLElement | null;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  overlayRoot: null,
  anchorElement: null
});

const emit = defineEmits<{
  (e: 'confirm', href: string): void;
  (e: 'cancel'): void;
}>();

const popoverRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const href = ref('');
const popoverStyle = ref<CSSProperties>({ display: 'none' });

/** 弹窗宽度 */
const POPOVER_WIDTH = 280;
/** 弹窗与锚点间距 */
const POPOVER_GAP = 8;

/**
 * 计算弹窗绝对定位样式。
 * 水平居中对齐锚点，垂直位于锚点下方。
 */
function computeStyle(): void {
  const anchor = props.anchorElement;
  if (!anchor) {
    popoverStyle.value = { display: 'none' };
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const overlayEl = props.overlayRoot;
  const overlayRect = overlayEl?.getBoundingClientRect() ?? new DOMRect();

  const left = anchorRect.left - overlayRect.left + (anchorRect.width - POPOVER_WIDTH) / 2;
  const top = anchorRect.top - overlayRect.top + anchorRect.height + POPOVER_GAP;

  popoverStyle.value = {
    position: 'absolute',
    top: `${top}px`,
    left: `${left}px`,
    width: `${POPOVER_WIDTH}px`,
    zIndex: 101
  };
}

/** 确认：发出 href 并关闭 */
function confirm(): void {
  const value = href.value.trim();
  if (!value) return;
  emit('confirm', value);
}

/** 取消：发出 cancel 事件 */
function cancel(): void {
  emit('cancel');
}

/** 点击弹窗外关闭 */
onClickOutside(popoverRef, cancel);

watch(
  () => props.visible,
  async (visible: boolean): Promise<void> => {
    if (visible) {
      href.value = '';
      await nextTick();
      computeStyle();
      inputRef.value?.focus();
    } else {
      popoverStyle.value = { display: 'none' };
    }
  }
);

onBeforeUnmount((): void => {
  popoverStyle.value = { display: 'none' };
});
</script>

<style lang="less" scoped>
.rich-link-popover {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
}

.rich-link-popover__input {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  outline: none;

  &::placeholder {
    color: var(--text-tertiary);
  }

  &:focus {
    border-color: var(--color-primary);
  }
}

.rich-link-popover__btn {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 14px;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  &:disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
  }
}

.rich-link-popover__btn--confirm {
  color: var(--color-primary);

  &:hover:not(:disabled) {
    background: var(--color-primary-bg-hover);
  }
}

.rich-link-popover__btn--cancel {
  color: var(--text-secondary);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}
</style>
```

- [ ] **Step 2: 验证类型检查通过**

```bash
npx vue-tsc --noEmit --project tsconfig.web.json 2>&1 | head -20
```

- [ ] **Step 3: 提交**

```bash
git add src/components/BMarkdown/components/LinkPopover.vue
git commit -m "feat: add LinkPopover component for URL input"
```

---

### Task 4: SelectionToolbarRich 集成 LinkPopover

**Files:**
- Modify: `src/components/BMarkdown/components/SelectionToolbarRich.vue`

- [ ] **Step 1: 模板中新增 LinkPopover**

将第 1-7 行模板：
```html
<template>
  <Teleport v-if="overlayRoot" :to="overlayRoot">
    <div v-if="visible" ref="toolbarRef" class="rich-selection-toolbar" :style="style">
      <SelectionToolbar :format-buttons="resolvedFormatButtons" @ai="$emit('ai')" @reference="$emit('reference')" @format="handleFormat" />
    </div>
  </Teleport>
</template>
```
改为：
```html
<template>
  <Teleport v-if="overlayRoot" :to="overlayRoot">
    <div v-if="visible" ref="toolbarRef" class="rich-selection-toolbar" :style="style">
      <SelectionToolbar :format-buttons="resolvedFormatButtons" @ai="$emit('ai')" @reference="$emit('reference')" @format="handleFormat" />
    </div>
    <LinkPopover
      :visible="linkPopoverVisible"
      :overlay-root="overlayRoot"
      :anchor-element="toolbarRef"
      @confirm="handleLinkConfirm"
      @cancel="closeLinkPopover"
    />
  </Teleport>
</template>
```

- [ ] **Step 2: script 中导入 LinkPopover 并新增 link 相关状态与逻辑**

在 import 区新增 `import LinkPopover from './LinkPopover.vue';`（紧接 `SelectionToolbar` 导入之后）。

在 `const suppressed = ref(false);` 之后新增：
```typescript
/** LinkPopover 显隐状态 */
const linkPopoverVisible = ref(false);
```

在 `suppress` 函数后面新增 link 相关方法：
```typescript
/**
 * 打开链接弹窗。
 */
function openLinkPopover(): void {
  linkPopoverVisible.value = true;
}

/**
 * 关闭链接弹窗。
 */
function closeLinkPopover(): void {
  linkPopoverVisible.value = false;
}

/**
 * 处理链接确认，设置链接并关闭弹窗。
 * @param href - 用户输入的链接地址
 */
function handleLinkConfirm(href: string): void {
  props.editor.chain().focus().setLink({ href }).run();
  closeLinkPopover();
}
```

- [ ] **Step 3: handleFormat 新增 'link' 分支**

在 `handleFormat` 函数的 switch 块中，`case 'code':` 的 `break;` 之后新增：
```typescript
    case 'link':
      if (props.editor.isActive('link')) {
        props.editor.chain().focus().unsetLink().run();
      } else {
        openLinkPopover();
      }
      break;
```

- [ ] **Step 4: pointerDown 判断中排除 LinkPopover DOM**

在 `bindOverlayPointerListeners` 的 `onPointerDown` 中，需要将 LinkPopover 节点也排除（避免点击 popover 时隐藏工具栏）。但 LinkPopover 自身的 ref 在 SelectionToolbarRich 中不可直接访问 —— 不过 LinkPopover 内部已经处理了 `onClickOutside`，且 popover 内的 `mousedown.prevent` 已阻止默认行为。所以这里通过一个策略：在 LinkPopover 打开期间，toolbar 的 pointerDown 不隐藏。

实际上更简单的处理：LinkPopover 内的按钮使用了 `@mousedown.prevent`，不会触发 overlayRoot 上捕获阶段的 pointerdown。但点击 input 仍会触发。为了保证点击 input 时不隐藏工具栏，最简单的方式是 `suppressed` 机制 —— 不过 suppressed 会隐藏 toolbar。

更好的方案：在 `onPointerDown` 中增加判断，如果 `linkPopoverVisible` 且点击目标是 popoverRef 的子元素，则跳过隐藏。但由于 popoverRef 在子组件中，无法直接访问。

最简单的可靠方案：当 `linkPopoverVisible` 为 true 时，pointerDown 回调直接跳过隐藏：

将 `onPointerDown` 函数体改为：
```typescript
const onPointerDown = (event: PointerEvent): void => {
  if (linkPopoverVisible.value) {
    return;
  }
  if (toolbarRef.value?.contains(event.target as Node)) {
    return;
  }
  pointerPressActive.value = true;
  hide();
};
```

- [ ] **Step 5: 验证类型检查通过**

```bash
npx vue-tsc --noEmit --project tsconfig.web.json 2>&1 | head -20
```

- [ ] **Step 6: 提交**

```bash
git add src/components/BMarkdown/components/SelectionToolbarRich.vue
git commit -m "feat: integrate LinkPopover into SelectionToolbarRich"
```

---

### 验证

- [ ] **最终验证：类型检查**

```bash
npx vue-tsc --noEmit --project tsconfig.web.json
```

- [ ] **最终验证：lint 检查**

```bash
npx eslint src/components/BMarkdown/components/LinkPopover.vue src/components/BMarkdown/components/SelectionToolbarRich.vue src/components/BMarkdown/adapters/selectionAssistant.ts src/components/BMarkdown/components/PaneRichEditor.vue --fix
```
