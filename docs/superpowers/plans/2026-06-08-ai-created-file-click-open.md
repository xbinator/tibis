# AI Created File Click Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the file chip in AI tool results clickable so users can open files created or modified by AI directly from chat.

**Architecture:** Keep tool execution results unchanged and add UI-only action metadata to `ToolSummaryTag`. The summary parser owns path extraction, while `BubblePartTool.vue` only renders actionable tags and delegates file opening to `useNavigate().openFile`.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict mode, Vitest, Vue Test Utils, Less scoped styles.

---

## File Structure

- Modify: `src/components/BChatSidebar/utils/toolResultSummary.ts`
  - Extend `ToolSummaryTag` with `action?: 'openFile'` and `path?: string`.
  - Add a small helper for file tags to avoid duplicating action metadata.
  - Mark `write_file`, `edit_file`, and file-type `open_resource` summary tags as openable.
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue`
  - Render openable tags as buttons.
  - Call `useNavigate().openFile({ filePath: tag.path })` on click.
  - Add accessible button styling without changing static tag layout.
- Create: `test/components/BChat/tool-result-summary.test.ts`
  - Pure function coverage for the new tag metadata.
- Create: `test/components/BChat/bubble-part-tool-open-file.test.ts`
  - Component behavior coverage for clickable and non-clickable tags.
- Modify: `changelog/2026-06-08.md`
  - Record the changed chat tool result behavior.

## Task 1: Tool Summary Open File Metadata

**Files:**
- Modify: `src/components/BChatSidebar/utils/toolResultSummary.ts`
- Test: `test/components/BChat/tool-result-summary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/components/BChat/tool-result-summary.test.ts`:

```ts
/**
 * @file tool-result-summary.test.ts
 * @description 验证聊天工具结果摘要中的可打开文件元数据。
 */
import { describe, expect, it } from 'vitest';
import { getToolResultSummary } from '@/components/BChatSidebar/utils/toolResultSummary';

/**
 * 创建成功工具结果。
 * @param data - 工具返回数据
 * @returns 工具成功结果
 */
function successResult(data: Record<string, unknown>) {
  return {
    status: 'success',
    data
  } as const;
}

describe('toolResultSummary open file metadata', (): void => {
  it('marks write_file file tag as openable when a file is created', (): void => {
    const summary = getToolResultSummary(
      'write_file',
      successResult({ path: '/workspace/docs/report.md', content: '# Report', created: true })
    );

    expect(summary).toEqual({
      text: '已创建文件',
      tags: [{ label: '文件', value: 'report.md', action: 'openFile', path: '/workspace/docs/report.md' }]
    });
  });

  it('marks edit_file file tag as openable', (): void => {
    const summary = getToolResultSummary('edit_file', successResult({ path: '/workspace/src/app.ts', replacedCount: 2 }));

    expect(summary?.tags?.[0]).toEqual({
      label: '文件',
      value: 'app.ts',
      action: 'openFile',
      path: '/workspace/src/app.ts'
    });
  });

  it('marks open_resource file tag as openable only for file resources', (): void => {
    const fileSummary = getToolResultSummary('open_resource', successResult({ resourceType: 'file', path: '/workspace/notes/today.md' }));
    const webSummary = getToolResultSummary('open_resource', successResult({ resourceType: 'webview', path: 'https://example.com' }));

    expect(fileSummary?.tags).toEqual([{ label: '文件', value: 'today.md', action: 'openFile', path: '/workspace/notes/today.md' }]);
    expect(webSummary?.tags).toEqual([{ label: '网址', value: 'https://example.com' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test test/components/BChat/tool-result-summary.test.ts
```

Expected: FAIL because the returned tags do not include `action` or `path`.

- [ ] **Step 3: Implement minimal summary metadata**

In `src/components/BChatSidebar/utils/toolResultSummary.ts`, update the tag type and add a helper near `toFileName`:

```ts
/**
 * 工具结果摘要标签动作。
 */
export type ToolSummaryTagAction = 'openFile';

/**
 * 创建可打开文件的摘要标签。
 * @param filePath - 文件完整路径
 * @returns 可打开文件标签
 */
function createOpenFileTag(filePath: string): ToolSummaryTag {
  return {
    label: '文件',
    value: toFileName(filePath),
    action: 'openFile',
    path: filePath
  };
}
```

Extend `ToolSummaryTag`:

```ts
export interface ToolSummaryTag {
  /** 标签名称 */
  label: string;
  /** 标签值 */
  value: string;
  /** 标签触发的 UI 动作 */
  action?: ToolSummaryTagAction;
  /** 动作关联的文件路径 */
  path?: string;
}
```

Replace the file tag creation in `summarizeWriteFile`, `summarizeEditFile`, and the file branch of `summarizeOpenResource`:

```ts
tags: filePath ? [createOpenFileTag(filePath)] : undefined
```

```ts
if (filePath) {
  tags.push(createOpenFileTag(filePath));
}
```

```ts
tags: path ? [createOpenFileTag(path)] : undefined
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm test test/components/BChat/tool-result-summary.test.ts
```

Expected: PASS.

## Task 2: Clickable Tool Summary File Chip

**Files:**
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue`
- Test: `test/components/BChat/bubble-part-tool-open-file.test.ts`

- [ ] **Step 1: Write the failing component tests**

Create `test/components/BChat/bubble-part-tool-open-file.test.ts`:

```ts
/**
 * @file bubble-part-tool-open-file.test.ts
 * @description 验证聊天工具结果中的文件摘要 chip 可点击打开。
 */
import type { VueWrapper } from '@vue/test-utils';
import type { ChatMessageToolPart } from 'types/chat';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BubblePartTool from '@/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue';

const openFileMock = vi.hoisted(() => vi.fn<(_options: { filePath?: string | null }) => Promise<void>>().mockResolvedValue(undefined));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openFile: openFileMock
  })
}));

/**
 * 创建工具消息片段。
 * @param toolName - 工具名称
 * @param data - 工具成功结果数据
 * @returns 工具消息片段
 */
function createToolPart(toolName: string, data: Record<string, unknown>): ChatMessageToolPart {
  return {
    type: 'tool',
    toolCallId: 'tool-call-1',
    toolName,
    status: 'done',
    input: {},
    result: {
      status: 'success',
      data
    }
  };
}

/**
 * 挂载工具气泡组件。
 * @param part - 工具消息片段
 * @returns 组件包装器
 */
function mountTool(part: ChatMessageToolPart): VueWrapper {
  return mount(BubblePartTool, {
    props: { part },
    global: {
      stubs: {
        BIcon: true,
        BTruncateText: {
          props: ['text'],
          template: '<span>{{ text }}</span>'
        }
      }
    }
  });
}

describe('BubblePartTool open file summary tag', (): void => {
  afterEach((): void => {
    openFileMock.mockClear();
  });

  it('opens the file when the write_file summary file tag is clicked', async (): Promise<void> => {
    const wrapper = mountTool(createToolPart('write_file', { path: '/workspace/docs/report.md', content: '# Report', created: true }));

    await wrapper.find('button.bubble-part-tool__summary-tag--clickable').trigger('click');

    expect(openFileMock).toHaveBeenCalledWith({ filePath: '/workspace/docs/report.md' });
    wrapper.unmount();
  });

  it('keeps non-file resource summary tags static', (): void => {
    const wrapper = mountTool(createToolPart('open_resource', { resourceType: 'webview', path: 'https://example.com' }));

    expect(wrapper.find('button.bubble-part-tool__summary-tag--clickable').exists()).toBe(false);
    expect(wrapper.text()).toContain('https://example.com');
    wrapper.unmount();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test test/components/BChat/bubble-part-tool-open-file.test.ts
```

Expected: FAIL because no clickable summary tag button exists.

- [ ] **Step 3: Implement clickable tag rendering**

In `src/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue`, import `useNavigate`:

```ts
import { useNavigate } from '@/hooks/useNavigate';
```

Create the navigation handle after `bem`:

```ts
/** 文件导航能力 */
const { openFile } = useNavigate();
```

Add helper functions before the computed section:

```ts
/**
 * 判断摘要标签是否可打开文件。
 * @param tag - 摘要标签
 * @returns 标签可打开文件时返回 true
 */
function isOpenFileTag(tag: ToolSummaryTag): boolean {
  return tag.action === 'openFile' && typeof tag.path === 'string' && tag.path.length > 0;
}

/**
 * 打开摘要标签关联的文件。
 * @param tag - 摘要标签
 */
function handleOpenFileTag(tag: ToolSummaryTag): void {
  if (!isOpenFileTag(tag)) {
    return;
  }

  openFile({ filePath: tag.path });
}
```

Update the summary import:

```ts
import type { ToolSummaryTag } from '../../utils/toolResultSummary';
import { getToolResultSummary } from '../../utils/toolResultSummary';
```

Replace the summary tag template block with button/static branches:

```vue
<div v-if="summary.tags?.length" :class="bem('summary-tags')">
  <template v-for="tag in summary.tags" :key="`${tag.label}-${tag.value}`">
    <button
      v-if="isOpenFileTag(tag)"
      type="button"
      :class="bem('summary-tag', { clickable: true })"
      :title="tag.path"
      @click="handleOpenFileTag(tag)"
    >
      <span v-if="tag.label" :class="bem('summary-tag-label')">{{ tag.label }}：</span>
      <span :class="bem('summary-tag-value')">{{ tag.value }}</span>
    </button>
    <div v-else :class="bem('summary-tag')">
      <span v-if="tag.label" :class="bem('summary-tag-label')">{{ tag.label }}：</span>
      <span :class="bem('summary-tag-value')">{{ tag.value }}</span>
    </div>
  </template>
</div>
```

- [ ] **Step 4: Add button styles**

In the scoped Less section of `BubblePartTool.vue`, extend `.bubble-part-tool__summary-tag` and add a full selector for the clickable modifier:

```less
.bubble-part-tool__summary-tag {
  max-width: 100%;
  padding: 1px 6px;
  overflow: hidden;
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--color-primary-bg);
  border: 0;
  border-radius: 4px;
}

.bubble-part-tool__summary-tag--clickable {
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--color-primary-bg-hover, rgb(22 119 255 / 14%));
  }

  &:focus-visible {
    outline: 1px solid var(--color-primary);
    outline-offset: 1px;
  }
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run:

```bash
pnpm test test/components/BChat/bubble-part-tool-open-file.test.ts
```

Expected: PASS.

## Task 3: Changelog and Verification

**Files:**
- Modify: `changelog/2026-06-08.md`

- [ ] **Step 1: Add changelog entry**

If `changelog/2026-06-08.md` does not exist, create it with:

```md
# 2026-06-08

## Added
- 聊天工具结果中的 AI 创建、写入、修改文件摘要支持点击文件 chip 直接打开对应文件。
```

If it already exists, add this line under `## Added`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/tool-result-summary.test.ts test/components/BChat/bubble-part-tool-open-file.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exits 0 with no TypeScript errors.

- [ ] **Step 4: Run lint checks**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/utils/toolResultSummary.ts src/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue test/components/BChat/tool-result-summary.test.ts test/components/BChat/bubble-part-tool-open-file.test.ts --ext .vue,.ts
```

Expected: exits 0 with no ESLint errors.

Run:

```bash
pnpm exec stylelint 'src/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue'
```

Expected: exits 0 with no Stylelint errors.

- [ ] **Step 5: Prepare git state and wait for user confirmation**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the intended implementation files, tests, changelog, and this plan are modified or untracked.

Do not run `git commit` until the user explicitly confirms the commit.

## Self-Review

- Spec coverage: Task 1 covers UI-only action metadata for `write_file`, `edit_file`, and file-type `open_resource`; Task 2 covers clickable chip behavior and static fallback; Task 3 covers changelog and verification.
- Placeholder scan: The plan contains no placeholder tasks; every implementation step includes concrete files, code, commands, and expected outcomes.
- Type consistency: `ToolSummaryTagAction`, `ToolSummaryTag.action`, and `ToolSummaryTag.path` are defined before they are consumed by `BubblePartTool.vue`.
- User commit rule: All commit behavior is replaced with a pause for explicit user confirmation.
