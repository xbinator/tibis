# Memory Relevance Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal BChat turns inject only relevant user memory while keeping full-memory behavior for legacy calls and any turn that exposes `edit_memory`.

**Architecture:** Add a small selector layer under `src/ai/memory` that extracts keywords from the current request, selects relevant memory items, and lets the injector format the result. BChat will pass the current user message into runtime config resolution, filter `edit_memory` from normal relevant turns, and keep `mode: 'full'` available for full-memory paths.

**Tech Stack:** Vue 3, Pinia, TypeScript strict mode, Vitest, lodash-es.

---

## User Constraint

The user asked not to submit changes. Do not run `git add` or `git commit`; leave changed files unstaged for the user to review and submit.

## File Structure

- Modify: `src/ai/memory/types.ts`
  - Add memory injection option types shared by the store, injector, selector, and BChat runtime config.
- Create: `src/ai/memory/selector.ts`
  - Own keyword extraction, normalization, item scoring, core memory selection, and relevant section construction.
- Modify: `src/ai/memory/injector.ts`
  - Accept `BuildMemoryContextOptions`, keep legacy full-memory behavior when options are absent, and use item-level pruning for relevant mode.
- Modify: `src/stores/ai/memory.ts`
  - Accept and pass memory context options from runtime config to the injector.
- Modify: `src/components/BChat/hooks/useRuntimeConfig.ts`
  - Accept optional memory selection context and pass it to the memory store.
- Modify: `src/components/BChat/index.vue`
  - Build memory selection context from the current user message for send and regenerate paths.
  - Use `Message.references` first and fall back to `ChatRuntimeUserInputPart` file parts for freshly submitted text.
  - Compute candidate tools and final tools once; filter `edit_memory` when using relevant memory mode.
- Add: `test/ai/memory/injector.test.ts`
  - Cover selector and injector behavior through the public `buildSystemPromptContext` API.
- Modify: `test/components/BChat/use-runtime-config.test.ts`
  - Cover selection context pass-through.
- Modify: `test/components/BChat/session-id-runtime.test.ts`
  - Cover send/regenerate selection source and `edit_memory` filtering.
- Modify: `changelog/2026-07-08.md`
  - Add one `Changed` entry for memory relevance injection.

---

### Task 1: Memory Option Types

**Files:**
- Modify: `src/ai/memory/types.ts`
- Test: `test/ai/memory/injector.test.ts`

- [ ] **Step 1: Write the failing type-consumer test**

Create `test/ai/memory/injector.test.ts` with a first test that imports the new option type and calls the public injector API with `selection`. This should fail before the type exists.

```ts
/**
 * @file injector.test.ts
 * @description 记忆 system prompt 注入与相关性筛选测试。
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPromptContext } from '@/ai/memory/injector';
import type { BuildMemoryContextOptions, MemoryDoc } from '@/ai/memory/types';

/**
 * 创建测试用记忆文档。
 * @returns 包含多分区记忆的文档
 */
function createMemoryDoc(): MemoryDoc {
  return {
    sections: [
      { category: 'Instructions', items: [{ content: '始终使用 TypeScript 回答代码问题' }] },
      {
        category: 'Preferences',
        items: [
          { content: '用户喜欢简洁回答' },
          { content: '用户研究经济学案例' },
          { content: '用户喜欢先看结论' },
          { content: '用户偏好中文注释' }
        ]
      },
      { category: 'Habits', items: [{ content: '用户习惯先写测试再实现' }] },
      { category: 'Facts', items: [{ content: '用户正在研究经济学中的价格弹性' }] },
      { category: 'Projects', items: [{ content: 'tibis 项目使用 Vue 3 和 Electron' }] },
      { category: 'Current Context', items: [{ content: '当前正在优化 src/ai/memory/injector.ts 的全局记忆注入策略' }] }
    ]
  };
}

describe('buildSystemPromptContext', (): void => {
  it('accepts relevant memory selection options', (): void => {
    const options: BuildMemoryContextOptions = {
      selection: {
        userMessage: '帮我看看 tibis 的记忆注入',
        references: ['src/ai/memory/injector.ts'],
        workspaceRoot: '/workspace/tibis'
      }
    };

    const context = buildSystemPromptContext(createMemoryDoc(), options);

    expect(context).toContain('<user_memory>');
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: FAIL because `BuildMemoryContextOptions` is not exported or `buildSystemPromptContext` does not accept the object argument.

- [ ] **Step 3: Add memory option types**

Modify `src/ai/memory/types.ts` by appending these exports after `MEMORY_FILE_NAME`.

```ts
/** 记忆注入模式 */
export type MemoryInjectionMode = 'relevant' | 'full';

/** 当前请求用于记忆相关性筛选的上下文 */
export interface MemorySelectionContext {
  /** 当前用户消息文本 */
  userMessage: string;
  /** 当前消息引用的文件路径或资源路径 */
  references: string[];
  /** 当前工作区根目录，仅用于提取项目名等关键词 */
  workspaceRoot?: string;
  /** 记忆注入模式，未传时按 relevant 处理 */
  mode?: MemoryInjectionMode;
}

/** 构建 system prompt 记忆上下文的选项 */
export interface BuildMemoryContextOptions {
  /** 最大注入字符数 */
  maxChars?: number;
  /** 当前请求的记忆选择上下文 */
  selection?: MemorySelectionContext;
}
```

- [ ] **Step 4: Temporarily widen injector signature**

Modify `src/ai/memory/injector.ts` imports and signature so the test compiles before selection is implemented.

```ts
import type { BuildMemoryContextOptions, MemoryDoc, MemorySection } from './types';
```

Replace the function signature and max character resolution with:

```ts
/**
 * 解析构建选项，兼容旧的数字预算参数。
 * @param options - 构建选项或旧版最大字符数
 * @returns 标准化后的构建选项
 */
function resolveBuildOptions(options?: BuildMemoryContextOptions | number): Required<Pick<BuildMemoryContextOptions, 'maxChars'>> & Pick<BuildMemoryContextOptions, 'selection'> {
  if (typeof options === 'number') {
    return { maxChars: options };
  }

  return {
    maxChars: options?.maxChars ?? DEFAULT_MAX_CHARS,
    selection: options?.selection
  };
}

export function buildSystemPromptContext(doc: MemoryDoc, options?: BuildMemoryContextOptions | number): string {
  const resolvedOptions = resolveBuildOptions(options);
  const nonEmptySections = doc.sections.filter((section) => section.items.length > 0);
  if (nonEmptySections.length === 0) return '';

  const header = '以下是关于该用户的已知信息，请在回应中自然地参考这些信息，不要刻意提及"根据记忆..."。';
  const fullContent = formatSections(nonEmptySections);

  const fullText = `<user_memory>\n${header}\n\n${fullContent}\n</user_memory>`;

  if (fullText.length <= resolvedOptions.maxChars) return fullText;

  return pruneToBudget(nonEmptySections, header, resolvedOptions.maxChars);
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: PASS.

---

### Task 2: Relevant Memory Selector

**Files:**
- Create: `src/ai/memory/selector.ts`
- Modify: `test/ai/memory/injector.test.ts`

- [ ] **Step 1: Add failing selector behavior tests**

Extend `test/ai/memory/injector.test.ts` with these tests.

```ts
it('keeps instructions and only relevant project memory in relevant mode', (): void => {
  const context = buildSystemPromptContext(createMemoryDoc(), {
    selection: {
      userMessage: 'tibis 的 injector 怎么优化',
      references: ['src/ai/memory/injector.ts'],
      workspaceRoot: '/workspace/tibis'
    }
  });

  expect(context).toContain('始终使用 TypeScript 回答代码问题');
  expect(context).toContain('tibis 项目使用 Vue 3 和 Electron');
  expect(context).toContain('当前正在优化 src/ai/memory/injector.ts 的全局记忆注入策略');
  expect(context).not.toContain('用户习惯先写测试再实现');
  expect(context).not.toContain('用户正在研究经济学中的价格弹性');
});

it('keeps at most three core preferences when no preference matches', (): void => {
  const context = buildSystemPromptContext(createMemoryDoc(), {
    selection: {
      userMessage: '帮我解释 tibis 架构',
      references: [],
      workspaceRoot: '/workspace/tibis'
    }
  });

  expect(context).toContain('用户喜欢简洁回答');
  expect(context).toContain('用户研究经济学案例');
  expect(context).toContain('用户喜欢先看结论');
  expect(context).not.toContain('用户偏好中文注释');
});

it('matches Chinese substrings after normalization', (): void => {
  const context = buildSystemPromptContext(createMemoryDoc(), {
    selection: {
      userMessage: '经济',
      references: [],
      workspaceRoot: '/workspace/tibis'
    }
  });

  expect(context).toContain('用户研究经济学案例');
  expect(context).toContain('用户正在研究经济学中的价格弹性');
});

it('uses Message.references paths as recall keywords', (): void => {
  const context = buildSystemPromptContext(createMemoryDoc(), {
    selection: {
      userMessage: '看下这个文件',
      references: ['src/ai/memory/injector.ts'],
      workspaceRoot: '/workspace/tibis'
    }
  });

  expect(context).toContain('src/ai/memory/injector.ts');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: FAIL because relevant mode still returns full memory.

- [ ] **Step 3: Create the selector module**

Create `src/ai/memory/selector.ts`.

```ts
/**
 * @file selector.ts
 * @description 记忆相关性选择器，根据当前请求上下文筛选需要注入的记忆条目。
 */
import { uniq } from 'lodash-es';
import type { MemoryCategory, MemoryDoc, MemoryItem, MemorySection, MemorySelectionContext } from './types';
import { MEMORY_CATEGORIES } from './types';

/** 核心偏好在无命中时最多保留的条目数。 */
const CORE_PREFERENCE_LIMIT = 3;

/** 相关性分区基础权重，越大表示命中后越优先。 */
const RELEVANCE_CATEGORY_WEIGHT: Record<MemoryCategory, number> = {
  Instructions: 0,
  Preferences: 2,
  Habits: 1,
  Facts: 2,
  Projects: 3,
  'Current Context': 3
};

/** 记忆候选条目。 */
interface MemoryItemCandidate {
  /** 分区名称。 */
  category: MemoryCategory;
  /** 原始条目。 */
  item: MemoryItem;
  /** 相关性分数。 */
  score: number;
  /** 分区原始顺序。 */
  sectionIndex: number;
  /** 条目原始顺序。 */
  itemIndex: number;
}

/**
 * 归一化记忆匹配文本。
 * @param value - 原始文本
 * @returns 归一化后的文本
 */
export function normalizeMemoryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s./@_\-\u4e00-\u9fff]/g, ' ')
    .replace(/[./@_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从普通文本中提取关键词。
 * @param value - 原始文本
 * @returns 关键词列表
 */
function extractTextKeywords(value: string): string[] {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return [];

  return normalized.split(/\s+/).filter((keyword) => keyword.length >= 2);
}

/**
 * 从路径中提取关键词。
 * @param path - 文件路径
 * @returns 路径关键词
 */
function extractPathKeywords(path: string): string[] {
  const fileName = path.split('/').pop() ?? path;
  return [...extractTextKeywords(path), ...extractTextKeywords(fileName)];
}

/**
 * 提取记忆召回关键词。
 * @param context - 当前请求上下文
 * @returns 去重后的关键词列表
 */
function extractMemoryKeywords(context: MemorySelectionContext): string[] {
  const workspaceName = context.workspaceRoot?.split('/').filter(Boolean).pop() ?? '';
  return uniq([
    ...extractTextKeywords(context.userMessage),
    ...context.references.flatMap(extractPathKeywords),
    ...extractTextKeywords(workspaceName)
  ]);
}

/**
 * 计算记忆条目相关性分数。
 * @param item - 记忆条目
 * @param category - 分区名称
 * @param keywords - 当前请求关键词
 * @returns 相关性分数
 */
function scoreMemoryItem(item: MemoryItem, category: MemoryCategory, keywords: string[]): number {
  const normalizedContent = normalizeMemoryText(item.content);
  const hitCount = keywords.reduce((count, keyword) => (normalizedContent.includes(keyword) ? count + 1 : count), 0);
  if (hitCount === 0) return 0;

  return hitCount + RELEVANCE_CATEGORY_WEIGHT[category];
}

/**
 * 将候选条目恢复为分区结构。
 * @param candidates - 候选条目
 * @returns 按原始分区顺序组织的分区列表
 */
function candidatesToSections(candidates: MemoryItemCandidate[]): MemorySection[] {
  return MEMORY_CATEGORIES.map((category) => {
    const items = candidates
      .filter((candidate) => candidate.category === category)
      .sort((a, b) => b.score - a.score || a.itemIndex - b.itemIndex)
      .map((candidate) => ({ content: candidate.item.content }));

    return { category, items };
  }).filter((section) => section.items.length > 0);
}

/**
 * 选择与当前请求相关的记忆分区。
 * @param doc - 完整记忆文档
 * @param context - 当前请求上下文
 * @returns 筛选后的记忆分区
 */
export function selectRelevantMemorySections(doc: MemoryDoc, context: MemorySelectionContext): MemorySection[] {
  const keywords = extractMemoryKeywords(context);
  const candidates: MemoryItemCandidate[] = [];

  doc.sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      if (section.category === 'Instructions') {
        candidates.push({ category: section.category, item, score: Number.MAX_SAFE_INTEGER, sectionIndex, itemIndex });
        return;
      }

      const score = scoreMemoryItem(item, section.category, keywords);
      if (score > 0) {
        candidates.push({ category: section.category, item, score, sectionIndex, itemIndex });
      }
    });
  });

  const hasPreferenceMatch = candidates.some((candidate) => candidate.category === 'Preferences');
  if (!hasPreferenceMatch) {
    const preferenceSection = doc.sections.find((section) => section.category === 'Preferences');
    const preferenceSectionIndex = doc.sections.findIndex((section) => section.category === 'Preferences');
    preferenceSection?.items.slice(0, CORE_PREFERENCE_LIMIT).forEach((item, itemIndex) => {
      candidates.push({ category: 'Preferences', item, score: 1, sectionIndex: preferenceSectionIndex, itemIndex });
    });
  }

  return candidatesToSections(candidates);
}
```

- [ ] **Step 4: Wire relevant selection into the injector**

Modify `src/ai/memory/injector.ts`.

Add the selector import:

```ts
import { selectRelevantMemorySections } from './selector';
```

Replace the body of `buildSystemPromptContext` with this structure:

```ts
export function buildSystemPromptContext(doc: MemoryDoc, options?: BuildMemoryContextOptions | number): string {
  const resolvedOptions = resolveBuildOptions(options);
  const nonEmptySections = doc.sections.filter((section) => section.items.length > 0);
  if (nonEmptySections.length === 0) return '';

  const header = '以下是关于该用户的已知信息，请在回应中自然地参考这些信息，不要刻意提及"根据记忆..."。';
  const selectedSections =
    resolvedOptions.selection && resolvedOptions.selection.mode !== 'full'
      ? selectRelevantMemorySections(doc, resolvedOptions.selection).filter((section) => section.items.length > 0)
      : nonEmptySections;

  if (selectedSections.length === 0) return '';

  const fullContent = formatSections(selectedSections);
  const fullText = `<user_memory>\n${header}\n\n${fullContent}\n</user_memory>`;

  if (fullText.length <= resolvedOptions.maxChars) return fullText;

  return pruneToBudget(selectedSections, header, resolvedOptions.maxChars);
}
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: PASS for selector behavior tests added so far.

---

### Task 3: Item-Level Budget Pruning

**Files:**
- Modify: `src/ai/memory/injector.ts`
- Modify: `test/ai/memory/injector.test.ts`

- [ ] **Step 1: Add failing budget tests**

Append these tests to `test/ai/memory/injector.test.ts`.

```ts
it('keeps full mode compatible with old complete-memory behavior', (): void => {
  const context = buildSystemPromptContext(createMemoryDoc(), {
    selection: {
      userMessage: 'tibis',
      references: [],
      workspaceRoot: '/workspace/tibis',
      mode: 'full'
    }
  });

  expect(context).toContain('用户习惯先写测试再实现');
  expect(context).toContain('用户正在研究经济学中的价格弹性');
});

it('keeps numeric maxChars compatibility for existing callers', (): void => {
  const context = buildSystemPromptContext(createMemoryDoc(), 4000);

  expect(context).toContain('用户习惯先写测试再实现');
  expect(context).toContain('用户正在研究经济学中的价格弹性');
});

it('prunes relevant mode by item instead of dropping an entire selected section', (): void => {
  const doc: MemoryDoc = {
    sections: [
      {
        category: 'Instructions',
        items: [
          { content: '规则一 TypeScript' },
          { content: '规则二 测试优先' },
          { content: '规则三 保持简洁' }
        ]
      },
      {
        category: 'Preferences',
        items: [
          { content: '偏好一 简洁' },
          { content: '偏好二 中文' },
          { content: '偏好三 结论先行' }
        ]
      },
      { category: 'Habits', items: [] },
      { category: 'Facts', items: [] },
      {
        category: 'Projects',
        items: [
          { content: 'tibis memory selector one' },
          { content: 'tibis memory selector two' },
          { content: 'tibis memory selector three' }
        ]
      },
      { category: 'Current Context', items: [] }
    ]
  };

  const context = buildSystemPromptContext(doc, {
    maxChars: 260,
    selection: {
      userMessage: 'tibis memory selector',
      references: [],
      workspaceRoot: '/workspace/tibis'
    }
  });

  expect(context).toContain('# Instructions');
  expect(context).toContain('规则一 TypeScript');
  expect(context).toContain('# Projects');
  expect(context).toMatch(/tibis memory selector (one|two|three)/);
});
```

- [ ] **Step 2: Run tests to verify the item-level budget test fails**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: FAIL because `pruneToBudget` still drops whole sections.

- [ ] **Step 3: Replace section-only pruning with item-level pruning**

Modify `src/ai/memory/injector.ts`.

Keep `PRUNE_PRIORITY`, but make it type-safe:

```ts
const PRUNE_PRIORITY: Record<MemorySection['category'], number> = {
  Instructions: 1,
  Preferences: 2,
  'Current Context': 3,
  Facts: 4,
  Habits: 5,
  Projects: 6
};
```

Add these helper functions below `formatSections`:

```ts
/**
 * 估算单个条目在格式化文本中的字符成本。
 * @param category - 条目所在分区
 * @param item - 记忆条目
 * @param startsSection - 是否需要写入分区标题
 * @returns 估算字符数
 */
function estimateItemCost(category: MemorySection['category'], item: MemorySection['items'][number], startsSection: boolean): number {
  const titleCost = startsSection ? `# ${category}\n`.length : 0;
  return titleCost + `- ${item.content}\n`.length;
}

/**
 * 按预算裁剪分区内条目，优先保留高优先级分区的靠前条目。
 * @param sections - 非空分区列表
 * @param header - XML 标签内的头部文本
 * @param maxChars - 最大字符数
 * @returns 裁剪后的完整注入文本
 */
function pruneItemsToBudget(sections: MemorySection[], header: string, maxChars: number): string {
  const sortedSections = [...sections].sort((a, b) => PRUNE_PRIORITY[a.category] - PRUNE_PRIORITY[b.category]);
  const keptSections: MemorySection[] = [];
  const overhead = `<user_memory>\n${header}\n\n\n</user_memory>`.length;
  let remaining = maxChars - overhead;

  for (const section of sortedSections) {
    const keptItems: MemorySection['items'] = [];

    for (let index = 0; index < section.items.length; index += 1) {
      const cost = estimateItemCost(section.category, section.items[index], keptItems.length === 0);
      if (cost > remaining) continue;
      keptItems.push(section.items[index]);
      remaining -= cost;
    }

    if (keptItems.length > 0) {
      keptSections.push({ category: section.category, items: keptItems });
    }
  }

  if (keptSections.length === 0) return '';

  const orderedSections = sections
    .map((section) => keptSections.find((keptSection) => keptSection.category === section.category))
    .filter((section): section is MemorySection => Boolean(section));
  const content = formatSections(orderedSections);
  return `<user_memory>\n${header}\n\n${content}\n</user_memory>`;
}
```

Replace the final prune call in `buildSystemPromptContext`:

```ts
return resolvedOptions.selection && resolvedOptions.selection.mode !== 'full'
  ? pruneItemsToBudget(selectedSections, header, resolvedOptions.maxChars)
  : pruneToBudget(selectedSections, header, resolvedOptions.maxChars);
```

- [ ] **Step 4: Run focused tests**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: PASS.

---

### Task 4: Memory Store and Runtime Config Pass-Through

**Files:**
- Modify: `src/stores/ai/memory.ts`
- Modify: `src/components/BChat/hooks/useRuntimeConfig.ts`
- Modify: `test/components/BChat/use-runtime-config.test.ts`

- [ ] **Step 1: Add failing hook test**

Modify `test/components/BChat/use-runtime-config.test.ts`.

Change the memory store mock typing:

```ts
import type { BuildMemoryContextOptions, MemorySelectionContext } from '@/ai/memory/types';
```

```ts
const memoryStoreMock = vi.hoisted(() => ({
  loaded: true,
  loadMemory: vi.fn<() => Promise<void>>(),
  buildSystemPromptContext: vi.fn<(_options?: BuildMemoryContextOptions) => string>(() => '')
}));
```

Add this test inside `describe('useRuntimeConfig')`:

```ts
it('passes memory selection context to the memory store', async (): Promise<void> => {
  const selection: MemorySelectionContext = {
    userMessage: '帮我优化 tibis memory',
    references: ['src/ai/memory/injector.ts'],
    workspaceRoot: '/workspace/tibis'
  };
  memoryStoreMock.buildSystemPromptContext.mockReturnValue('<user_memory>memory</user_memory>');

  const { resolveRuntimeSystemPrompt } = useRuntimeConfig();
  const system = await resolveRuntimeSystemPrompt(selection);

  expect(system).toBe('<user_memory>memory</user_memory>');
  expect(memoryStoreMock.buildSystemPromptContext).toHaveBeenCalledWith({ selection });
});
```

- [ ] **Step 2: Run hook test to verify it fails**

Run: `pnpm test -- test/components/BChat/use-runtime-config.test.ts`

Expected: FAIL because `resolveRuntimeSystemPrompt` does not accept a selection argument.

- [ ] **Step 3: Update memory store wrapper**

Modify `src/stores/ai/memory.ts`.

Update imports:

```ts
import type { BuildMemoryContextOptions, MemoryCategory, MemoryDoc } from '@/ai/memory/types';
```

Update the action signature and body:

```ts
/**
 * 构建要注入到 System Prompt 的记忆上下文
 * @param options - 记忆注入选项
 * @returns 注入字符串，无记忆或未启用时返回空字符串
 */
buildSystemPromptContext(options?: BuildMemoryContextOptions): string {
  if (!useSettingStore().memoryEnabled) return '';
  return buildSystemPromptContext(this.doc, options);
},
```

- [ ] **Step 4: Update runtime config hook**

Modify `src/components/BChat/hooks/useRuntimeConfig.ts`.

Update imports:

```ts
import type { MemorySelectionContext } from '@/ai/memory/types';
```

Update `UseRuntimeConfigReturn`:

```ts
/** 解析 runtime system prompt 上下文。 */
resolveRuntimeSystemPrompt: (selection?: MemorySelectionContext) => Promise<string | undefined>;
```

Update the function:

```ts
/**
 * 解析 runtime system prompt 上下文。
 * @param selection - 当前请求的记忆筛选上下文
 * @returns system prompt
 */
async function resolveRuntimeSystemPrompt(selection?: MemorySelectionContext): Promise<string | undefined> {
  if (!memoryStore.loaded) {
    await memoryStore.loadMemory();
  }

  const memoryContext = memoryStore.buildSystemPromptContext(selection ? { selection } : undefined);
  return memoryContext.trim() ? memoryContext : undefined;
}
```

- [ ] **Step 5: Run hook test**

Run: `pnpm test -- test/components/BChat/use-runtime-config.test.ts`

Expected: PASS.

---

### Task 5: BChat Send Path Selection and `edit_memory` Filtering

**Files:**
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Add failing BChat send-path tests**

Modify `test/components/BChat/session-id-runtime.test.ts`.

Update imports:

```ts
import type { AIToolExecutor } from 'types/ai';
import type { BuildMemoryContextOptions } from '@/ai/memory/types';
```

Add hoisted builtin tool state near the other hoisted state:

```ts
const builtinToolsMockState = vi.hoisted(() => ({
  tools: [] as AIToolExecutor[]
}));
```

Update `memoryStoreMock`:

```ts
const memoryStoreMock = vi.hoisted(() => ({
  loaded: true,
  loadMemory: vi.fn<() => Promise<void>>(),
  buildSystemPromptContext: vi.fn<(_options?: BuildMemoryContextOptions) => string>(() => '')
}));
```

Update the builtins mock:

```ts
vi.mock('@/ai/tools/builtin', () => ({
  createBuiltinTools: vi.fn(() => builtinToolsMockState.tools),
  isBuiltinToolName: vi.fn(() => true),
  EDIT_MEMORY_TOOL_NAME: 'edit_memory',
  OPEN_WIDGET_TOOL_NAME: 'open_widget',
  OPERATE_WEBPAGE_TOOL_NAME: 'operate_webpage',
  OPEN_RESOURCE_TOOL_NAME: 'open_resource',
  READ_CURRENT_WEBPAGE_TOOL_NAME: 'read_current_webpage',
  READ_DIRECTORY_TOOL_NAME: 'read_directory',
  SKILL_TOOL_NAME: 'skill',
  WIDGET_TOOL_NAME: 'widget'
}));
```

Add this helper near `createMessage`:

```ts
/**
 * 创建测试用 AI 工具。
 * @param name - 工具名称
 * @returns 工具执行器
 */
function createRuntimeTool(name: string): AIToolExecutor {
  return {
    definition: {
      name,
      description: `${name} description`,
      source: 'builtin',
      riskLevel: name === 'edit_memory' ? 'write' : 'read',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      requiresActiveDocument: false
    },
    execute: async (): Promise<{ toolName: string; status: 'success'; data: null }> => ({ toolName: name, status: 'success', data: null })
  };
}
```

In `beforeEach`, reset the tool state:

```ts
builtinToolsMockState.tools = [];
```

Add this test near the existing send tests:

```ts
it('uses relevant memory selection and filters edit_memory for normal sends', async (): Promise<void> => {
  builtinToolsMockState.tools = [createRuntimeTool('edit_memory'), createRuntimeTool('read_file')];
  memoryStoreMock.buildSystemPromptContext.mockReturnValue('<user_memory>relevant</user_memory>');
  const createdSession = createSession('session-created', 'fix {{@src/foo.ts}}');
  chatStoreMock.createSession.mockResolvedValue(createdSession);
  const wrapper = mountBChat(null);
  await flushPromises();

  wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'fix {{@src/foo.ts}}');
  await flushPromises();
  wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
  await flushPromises();

  expect(memoryStoreMock.buildSystemPromptContext).toHaveBeenCalledWith({
    selection: {
      userMessage: 'fix {{@src/foo.ts}}',
      references: ['src/foo.ts'],
      workspaceRoot: '/workspace',
      mode: 'relevant'
    }
  });
  expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
    expect.objectContaining({
      system: '<user_memory>relevant</user_memory>',
      tools: [expect.objectContaining({ name: 'read_file' })]
    })
  );
  expect(electronAPIMock.chatRuntimeSend).not.toHaveBeenCalledWith(
    expect.objectContaining({
      tools: expect.arrayContaining([expect.objectContaining({ name: 'edit_memory' })])
    })
  );
});
```

- [ ] **Step 2: Run the BChat focused test to verify it fails**

Run: `pnpm test -- test/components/BChat/session-id-runtime.test.ts -t "uses relevant memory selection"`

Expected: FAIL because current code does not pass selection and does not filter `edit_memory`.

- [ ] **Step 3: Update BChat imports**

Modify `src/components/BChat/index.vue`.

Add type imports:

```ts
import type { AIToolExecutor } from 'types/ai';
import type { MemorySelectionContext } from '@/ai/memory/types';
```

Add runtime tool name import:

```ts
import { EDIT_MEMORY_TOOL_NAME } from '@/ai/tools/builtin';
```

- [ ] **Step 4: Add BChat memory selection helpers**

Add these helpers above `resolveChatRuntimeRequestConfig`.

```ts
/**
 * 从用户消息和 runtime 输入片段构建记忆筛选上下文。
 * @param message - 用户消息
 * @param parts - 发送给 runtime 的结构化输入片段
 * @returns 记忆筛选上下文
 */
function createMemorySelectionContext(message: Message, parts: ChatRuntimeUserInputPart[] = []): MemorySelectionContext {
  const filePartReferences = parts.filter((part) => part.type === 'file').map((part) => part.path);
  return {
    userMessage: message.content,
    references: message.references?.map((reference) => reference.path) ?? filePartReferences,
    workspaceRoot: workspaceRoot.value || undefined,
    mode: 'relevant'
  };
}

/**
 * 查找消息列表中的最后一条用户消息。
 * @param sourceMessages - 消息列表
 * @returns 最后一条用户消息，不存在时返回 null
 */
function findLastUserMessage(sourceMessages: Message[]): Message | null {
  for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
    const message = sourceMessages[index];
    if (message.role === 'user') return message;
  }

  return null;
}

/**
 * 过滤普通相关记忆轮次不能暴露的工具。
 * @param tools - 候选工具列表
 * @returns 最终发送给 runtime 的工具列表
 */
function filterRelevantMemoryTools(tools: AIToolExecutor[]): AIToolExecutor[] {
  return tools.filter((tool) => tool.definition.name !== EDIT_MEMORY_TOOL_NAME);
}
```

- [ ] **Step 5: Update runtime request config resolution**

Replace `resolveChatRuntimeRequestConfig` in `src/components/BChat/index.vue` with:

```ts
/**
 * 解析 ChatRuntime 通用请求配置。
 * @param selectionSource - 用于构建记忆筛选上下文的用户消息
 * @returns Runtime 请求配置，未配置模型时返回 null
 */
async function resolveChatRuntimeRequestConfig(selectionSource?: Message | null, selectionParts: ChatRuntimeUserInputPart[] = []): Promise<ChatRuntimeRequestConfig | null> {
  const serviceConfig = await chatServiceConfig.resolveServiceConfig();
  if (!serviceConfig) {
    showNoModelConfigToast();
    return null;
  }

  const candidateTools = serviceConfig.toolSupport.supported ? getActiveTools() : [];
  const selection = selectionSource ? createMemorySelectionContext(selectionSource, selectionParts) : undefined;
  const finalTools = selection ? filterRelevantMemoryTools(candidateTools) : candidateTools;

  return {
    contextWindow: contextWindow.value,
    system: await resolveRuntimeSystemPrompt(selection),
    workspaceRoot: workspaceRoot.value || undefined,
    tools: serviceConfig.toolSupport.supported ? toTransportTools(finalTools) : undefined,
    tavily: resolveRuntimeTavilyConfig(),
    mcp: resolveRuntimeMcpRequestConfig()
  };
}
```

- [ ] **Step 6: Pass the send user message into runtime config**

In `sendRuntimeUserMessage`, change:

```ts
const runtimeConfig = await resolveChatRuntimeRequestConfig();
```

to:

```ts
const runtimeConfig = await resolveChatRuntimeRequestConfig(input.userMessage, input.parts);
```

- [ ] **Step 7: Run the focused BChat send test**

Run: `pnpm test -- test/components/BChat/session-id-runtime.test.ts -t "uses relevant memory selection"`

Expected: PASS.

---

### Task 6: BChat Regenerate Selection Source

**Files:**
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Add failing regenerate test**

Append this test near the existing regenerate test.

```ts
it('uses the last source user message as memory selection when regenerating', async (): Promise<void> => {
  memoryStoreMock.buildSystemPromptContext.mockReturnValue('<user_memory>regen</user_memory>');
  const userMessage = {
    ...createMessage('user-regenerate', '重新回答 {{@src/ai/memory/injector.ts}}'),
    references: [
      {
        token: '@src/ai/memory/injector.ts',
        path: 'src/ai/memory/injector.ts',
        startLine: 0,
        endLine: 0,
        selectedContent: '',
        fullContent: ''
      }
    ]
  };
  const assistantMessage = {
    id: 'assistant-regenerate',
    role: 'assistant' as const,
    content: '旧回答',
    parts: [],
    createdAt: new Date().toISOString(),
    finished: true
  };
  chatStoreMock.getSessionMessages.mockResolvedValue([userMessage, assistantMessage]);
  const wrapper = mountBChat('session-active');
  await flushPromises();

  wrapper.findComponent(ConversationViewStub).vm.$emit('regenerate', assistantMessage);
  await flushPromises();

  expect(memoryStoreMock.buildSystemPromptContext).toHaveBeenCalledWith({
    selection: {
      userMessage: '重新回答 {{@src/ai/memory/injector.ts}}',
      references: ['src/ai/memory/injector.ts'],
      workspaceRoot: '/workspace',
      mode: 'relevant'
    }
  });
  expect(electronAPIMock.chatRuntimeContinue).toHaveBeenCalledWith(
    expect.objectContaining({
      system: '<user_memory>regen</user_memory>'
    })
  );
});
```

- [ ] **Step 2: Run regenerate test to verify it fails**

Run: `pnpm test -- test/components/BChat/session-id-runtime.test.ts -t "uses the last source user message"`

Expected: FAIL because regenerate still calls `resolveChatRuntimeRequestConfig()` without a message.

- [ ] **Step 3: Pass last user message in regenerate path**

Modify `startRuntimeRegenerate` in `src/components/BChat/index.vue`.

Change:

```ts
const runtimeConfig = await resolveChatRuntimeRequestConfig();
```

to:

```ts
const runtimeConfig = await resolveChatRuntimeRequestConfig(findLastUserMessage(sourceMessages));
```

- [ ] **Step 4: Run regenerate test**

Run: `pnpm test -- test/components/BChat/session-id-runtime.test.ts -t "uses the last source user message"`

Expected: PASS.

---

### Task 7: Changelog

**Files:**
- Modify: `changelog/2026-07-08.md`

- [ ] **Step 1: Add changelog entry**

Add this bullet under `## Changed` in `changelog/2026-07-08.md`.

```md
- 优化全局记忆注入设计与实现：普通回答轮按当前消息和文件引用筛选相关记忆，相关模式下不暴露 `edit_memory`，避免部分记忆上下文触发整分区覆盖造成数据丢失。
```

- [ ] **Step 2: Verify changelog formatting**

Run: `sed -n '1,40p' changelog/2026-07-08.md`

Expected: The new bullet appears under `## Changed`.

---

### Task 8: Full Verification

**Files:**
- No edits.

- [ ] **Step 1: Run memory tests**

Run: `pnpm test -- test/ai/memory/injector.test.ts`

Expected: PASS.

- [ ] **Step 2: Run runtime config tests**

Run: `pnpm test -- test/components/BChat/use-runtime-config.test.ts`

Expected: PASS.

- [ ] **Step 3: Run BChat runtime tests**

Run: `pnpm test -- test/components/BChat/session-id-runtime.test.ts`

Expected: PASS.

- [ ] **Step 4: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Run ESLint**

Run: `pnpm lint`

Expected: PASS or automatic fixes only in files touched by this plan.

- [ ] **Step 6: Run Stylelint**

Run: `pnpm lint:style`

Expected: PASS. This change should not touch style files, so failures indicate pre-existing issues or unrelated local edits.

- [ ] **Step 7: Review git status**

Run: `git status --short`

Expected: Changed files are limited to the files listed in this plan plus the previously created design document if it is still untracked. Do not stage or submit changes.
