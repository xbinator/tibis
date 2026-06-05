# General Chat Compression Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit changes unless the user explicitly asks for a commit.

**Goal:** Implement the Phase 2 MVC for general long-chat compression: golden case coverage, Markdown handoff rendering, single-boundary integration, and multi-segment alignment checks.

**Architecture:** Keep the current compression storage schema unchanged. Add a focused renderer that turns existing `StructuredConversationSummary` records into Markdown handoff text, then route successful compression boundary text through that renderer. Treat multi-segment support as an explicit compatibility gate: first prove current recall wiring, then render recalled segment records through the same renderer if the path is active.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Vitest, existing `src/components/BChatSidebar/utils/compression/*` modules, existing `types/compression.d.ts` schema.

---

## Implementation Status

Implemented in the current working tree. The final implementation keeps the assistant-role compression boundary, moves Markdown handoff rendering into `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`, and renders recalled multi-segment summaries through the same renderer inside the existing XML wrapper.

Verification recorded during implementation:

- `pnpm test test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-segment-recall.test.ts`
- Included again in the final focused compression test run on 2026-06-05.

---

## Scope

This plan implements Phase 2 only:

- Golden case tests for current schema.
- `summaryRenderer` module for Markdown handoff text.
- Integration of renderer into single compression boundary creation.
- Multi-segment recall wiring audit and renderer compatibility tests.

This plan does not implement v3 schema, token-budget tail, UI debug panels, or storage migrations.

## File Structure

- Create `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`
  - Owns Markdown rendering from `CompressionRecord` plus optional key tool result context.
  - Keeps all injection-format wording in one place.
- Modify `src/components/BChatSidebar/hooks/useCompactContext.ts`
  - Removes local ad hoc summary formatting helpers once covered by renderer.
  - Calls `renderCompressionHandoff()` when building a successful compression boundary message.
- Modify `src/components/BChatSidebar/utils/compression/segmentRecall.ts`
  - If current send path uses it, update `buildMultiSegmentSummarySystemMessage()` to call renderer for each segment.
  - If current send path does not use it, leave runtime behavior unchanged but add tests documenting that the helper can render Markdown handoff segments.
- Add `test/components/BChat/compression-summary-renderer.test.ts`
  - Unit tests for renderer output and golden case assertions.
- Add or extend `test/components/BChat/compression-segment-recall.test.ts`
  - Tests for multi-segment ordering and XML outer wrapper with Markdown inner segment content.
- Modify `changelog/2026-06-05.md`
  - Add a `Changed` entry for Phase 2 implementation after code changes are complete.

---

### Task 1: Add Renderer Golden Case Tests

**Files:**
- Create: `test/components/BChat/compression-summary-renderer.test.ts`
- Create later in Task 2: `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`

- [ ] **Step 1: Write the failing renderer tests**

Create `test/components/BChat/compression-summary-renderer.test.ts`:

```ts
/**
 * @file compression-summary-renderer.test.ts
 * @description BChatSidebar 压缩摘要 Markdown 交接稿渲染测试。
 */
import { describe, expect, it } from 'vitest';
import { renderCompressionHandoff } from '@/components/BChatSidebar/utils/compression/summaryRenderer';
import type { CompressionRecord } from '@/components/BChatSidebar/utils/compression/types';

/**
 * 创建压缩记录测试数据。
 * @param overrides - 覆盖字段
 * @returns 压缩记录
 */
function createRecord(overrides: Partial<CompressionRecord> = {}): CompressionRecord {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm2',
    coveredUntilMessageId: 'm2',
    sourceMessageIds: ['m1', 'm2'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天',
    structuredSummary: {
      goal: '继续一段关于生活规划和阅读偏好的长聊天',
      recentTopic: '用户从年度计划聊到最近阅读状态',
      userPreferences: ['喜欢轻松但直接的语气', '不希望被反复说教'],
      constraints: ['回答要保留用户给出的书单和时间条件'],
      decisions: ['先整理阅读状态，再讨论下一步计划'],
      importantFacts: ['用户原始需求：书单包括《置身事内》《长安的荔枝》《悉达多》', '用户只有周末晚上有完整阅读时间'],
      fileContext: [],
      openQuestions: ['如何安排下一本书还没有确定'],
      pendingActions: ['下一轮继续给出阅读安排建议']
    },
    triggerReason: 'manual',
    messageCountSnapshot: 12,
    charCountSnapshot: 2400,
    schemaVersion: 2,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    ...overrides
  };
}

describe('renderCompressionHandoff', () => {
  it('renders a Markdown handoff with continuity, critical facts, raw requirements, and open loops', (): void => {
    const text = renderCompressionHandoff({ record: createRecord() });

    expect(text).toContain('COMPRESSED_CONTEXT');
    expect(text).toContain('## Conversation Continuity');
    expect(text).toContain('继续一段关于生活规划和阅读偏好的长聊天');
    expect(text).toContain('## Critical Facts');
    expect(text).toContain('《置身事内》');
    expect(text).toContain('周末晚上');
    expect(text).toContain('## Raw User Requirements');
    expect(text).toContain('书单包括');
    expect(text).toContain('## Open Loops');
    expect(text).toContain('下一轮继续给出阅读安排建议');
  });

  it('renders explicit list requirements without collapsing them into a topic label', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        structuredSummary: {
          goal: '整理基金数据请求',
          recentTopic: '金融搜索服务',
          userPreferences: [],
          constraints: ['按今日涨跌幅从高到低排序', '输出表格'],
          decisions: [],
          importantFacts: [
            '用户原始需求：查询基金 024479、022365、006476、008586、015945、002611、018345、008888、002190、013943、011036、161725，统计今天涨跌幅、昨天涨跌幅，并给出操作建议'
          ],
          fileContext: [],
          openQuestions: [],
          pendingActions: ['继续查询并整理基金行情表格']
        }
      })
    });

    expect(text).toContain('024479');
    expect(text).toContain('161725');
    expect(text).toContain('今天涨跌幅');
    expect(text).toContain('昨天涨跌幅');
    expect(text).toContain('操作建议');
    expect(text).not.toEqual(expect.stringMatching(/^话题：金融搜索服务\s*$/));
  });

  it('renders none markers for empty sections so the prompt shape stays stable', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        structuredSummary: {
          goal: '',
          recentTopic: '',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      })
    });

    expect(text).toContain('## User Preferences\n- (none)');
    expect(text).toContain('## Constraints\n- (none)');
    expect(text).toContain('## Critical Facts\n- (none)');
    expect(text).toContain('## Open Loops\n- (none)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts
```

Expected: FAIL because `summaryRenderer.ts` and `renderCompressionHandoff` do not exist.

---

### Task 2: Implement Summary Renderer

**Files:**
- Create: `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`
- Test: `test/components/BChat/compression-summary-renderer.test.ts`

- [ ] **Step 1: Add the renderer implementation**

Create `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`:

```ts
/**
 * @file summaryRenderer.ts
 * @description 将结构化压缩摘要渲染为注入模型的 Markdown 交接稿。
 */
import type { ChatMessageToolPart } from 'types/chat';
import type { CompressionRecord } from './types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/** 压缩上下文内保留的关键工具结果最大数量。 */
const MAX_KEY_TOOL_RESULT_CONTEXT_COUNT = 5;
/** 对继续任务有高价值的工具结果名称片段。 */
const KEY_TOOL_RESULT_NAME_PATTERNS = ['read', 'write', 'edit', 'file', 'reference', 'ask_user', 'choice', 'settings'];

/**
 * 渲染压缩交接稿的输入参数。
 */
export interface RenderCompressionHandoffInput {
  /** 压缩记录 */
  record: CompressionRecord;
  /** 进入压缩的源消息，用于补充关键工具结果 */
  sourceMessages?: Message[];
}

/**
 * 判断列表项是否是确定性保留的用户原始需求。
 * @param value - 摘要列表项
 * @returns 是否为用户原始需求
 */
function isRawRequirement(value: string): boolean {
  return value.startsWith('用户原始需求：');
}

/**
 * 移除用户原始需求前缀，用于单独渲染 Raw User Requirements 区块。
 * @param value - 摘要列表项
 * @returns 去掉前缀后的文本
 */
function stripRawRequirementPrefix(value: string): string {
  return value.replace(/^用户原始需求：/, '').trim();
}

/**
 * 渲染 Markdown bullet 列表，空列表输出稳定占位。
 * @param values - 列表项
 * @returns Markdown bullet 列表
 */
function renderBullets(values: string[]): string {
  if (!values.length) {
    return '- (none)';
  }

  return values.map((value) => `- ${value}`).join('\n');
}

/**
 * 格式化文件上下文，保留文件路径与用户意图。
 * @param fileContext - 文件上下文摘要
 * @returns Markdown bullet 列表项
 */
function renderFileContext(fileContext: CompressionRecord['structuredSummary']['fileContext']): string[] {
  return fileContext.map((item) => {
    const lineRange = item.startLine ? `:${item.startLine}-${item.endLine ?? item.startLine}` : '';
    const reloadHint = item.shouldReloadOnDemand ? 'yes' : 'no';
    return `${item.filePath}${lineRange} - intent: ${item.userIntent}; summary: ${item.keySnippetSummary}; reload_on_demand: ${reloadHint}`;
  });
}

/**
 * 将工具结果数据压缩为短文本，避免完整工具载荷撑大上下文。
 * @param data - 工具结果数据
 * @returns 可写入压缩上下文的工具结果摘要
 */
function summarizeToolResultData(data: unknown): string {
  if (typeof data === 'string') {
    return data.slice(0, 400);
  }

  if (!data || typeof data !== 'object') {
    return String(data ?? '');
  }

  const source = data as Record<string, unknown>;
  const preferred = [source.path, source.filePath, source.summary, source.message, source.error, source.status].filter((item): item is string => {
    return typeof item === 'string' && item.trim().length > 0;
  });

  if (preferred.length) {
    return preferred.join('; ').slice(0, 400);
  }

  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return '[unserializable tool result]';
  }
}

/**
 * 判断工具结果是否值得作为压缩上下文中的关键事实保留。
 * @param part - 工具结果片段
 * @returns 是否保留该工具结果摘要
 */
function isKeyToolResult(part: ChatMessageToolPart): boolean {
  const toolName = part.toolName.toLowerCase();
  return KEY_TOOL_RESULT_NAME_PATTERNS.some((pattern) => toolName.includes(pattern));
}

/**
 * 从被压缩消息中提取关键工具结果摘要。
 * @param sourceMessages - 进入压缩的源消息
 * @returns 工具结果摘要列表
 */
function extractKeyToolResultContext(sourceMessages: Message[] = []): string[] {
  const results: string[] = [];

  for (const sourceMessage of sourceMessages) {
    for (const part of sourceMessage.parts) {
      if (part.type !== 'tool' || !part.result || !isKeyToolResult(part)) {
        continue;
      }

      results.push(`tool: ${part.toolName}; status: ${part.result.status}; result: ${summarizeToolResultData(part.result.data)}`);
      if (results.length >= MAX_KEY_TOOL_RESULT_CONTEXT_COUNT) {
        return results;
      }
    }
  }

  return results;
}

/**
 * 渲染压缩记录为模型可读的 Markdown 交接稿。
 * @param input - 渲染输入
 * @returns Markdown 压缩上下文
 */
export function renderCompressionHandoff(input: RenderCompressionHandoffInput): string {
  const { record, sourceMessages = [] } = input;
  const summary = record.structuredSummary;
  const rawRequirements = summary.importantFacts.filter(isRawRequirement).map(stripRawRequirementPrefix);
  const criticalFacts = summary.importantFacts.filter((item) => !isRawRequirement(item));
  const continuity = [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0);
  const openLoops = [...summary.openQuestions, ...summary.pendingActions];
  const keyToolResults = extractKeyToolResultContext(sourceMessages);

  return [
    'COMPRESSED_CONTEXT',
    '以下内容是较早对话的压缩记忆，用于保持连续性。请把它当作历史事实和对话状态，不要向用户复述这段说明。',
    '',
    '## Conversation Continuity',
    renderBullets(continuity),
    '',
    '## User Preferences',
    renderBullets(summary.userPreferences),
    '',
    '## Constraints',
    renderBullets(summary.constraints),
    '',
    '## Key Decisions',
    renderBullets(summary.decisions),
    '',
    '## Critical Facts',
    renderBullets(criticalFacts),
    '',
    '## Raw User Requirements',
    renderBullets(rawRequirements),
    '',
    '## Open Loops',
    renderBullets(openLoops),
    '',
    '## Relevant Files',
    renderBullets(renderFileContext(summary.fileContext)),
    '',
    '## Key Tool Results',
    renderBullets(keyToolResults)
  ].join('\n');
}
```

- [ ] **Step 2: Run renderer tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run targeted lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/utils/compression/summaryRenderer.ts test/components/BChat/compression-summary-renderer.test.ts
```

Expected: no ESLint errors.

---

### Task 3: Integrate Renderer Into Single Compression Boundary

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useCompactContext.ts`
- Test: `test/components/BChat/compression-summary-renderer.test.ts`

- [ ] **Step 1: Write a failing integration assertion**

Append this test to `test/components/BChat/compression-summary-renderer.test.ts`:

```ts
it('renders the exact text expected for a successful compression boundary', (): void => {
  const record = createRecord();
  const text = renderCompressionHandoff({ record });

  expect(text).toContain('COMPRESSED_CONTEXT');
  expect(text).toContain('## Conversation Continuity');
  expect(text).toContain('## Raw User Requirements');
  expect(text).not.toContain('目标：');
  expect(text).not.toContain('最近话题：');
});
```

- [ ] **Step 2: Run test to verify current boundary format still differs**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts
```

Expected before integration: renderer tests pass, but this does not yet prove `useCompactContext` uses the renderer. Continue to the implementation step and verify by code diff plus targeted tests.

- [ ] **Step 3: Replace local boundary formatting with renderer**

Modify `src/components/BChatSidebar/hooks/useCompactContext.ts`:

```ts
import { renderCompressionHandoff } from '../utils/compression/summaryRenderer';
```

Remove these local helpers and constants from `useCompactContext.ts` after the renderer owns them:

```ts
const MAX_KEY_TOOL_RESULT_CONTEXT_COUNT = 5;
const KEY_TOOL_RESULT_NAME_PATTERNS = ['read', 'write', 'edit', 'file', 'reference', 'ask_user', 'choice', 'settings'];
function formatSummaryList(...) { ... }
function formatFileContext(...) { ... }
function summarizeToolResultData(...) { ... }
function isKeyToolResult(...) { ... }
function extractKeyToolResultContext(...) { ... }
```

Replace `buildStructuredCompressionContext()` with:

```ts
/**
 * 构建注入模型的压缩上下文交接稿。
 * @param record - 压缩记录
 * @param sourceMessages - 进入压缩的源消息
 * @returns 更适合后续继续对话的上下文文本
 */
function buildStructuredCompressionContext(record: CompressionRecord, sourceMessages: Message[] = []): string {
  return renderCompressionHandoff({ record, sourceMessages });
}
```

Also remove the now-unused `ChatMessageToolPart` type import from `useCompactContext.ts`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run targeted lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/hooks/useCompactContext.ts src/components/BChatSidebar/utils/compression/summaryRenderer.ts test/components/BChat/compression-summary-renderer.test.ts
```

Expected: no ESLint errors.

---

### Task 4: Audit And Test Multi-Segment Recall Rendering

**Files:**
- Modify: `src/components/BChatSidebar/utils/compression/segmentRecall.ts`
- Test: `test/components/BChat/compression-segment-recall.test.ts`

- [ ] **Step 1: Confirm current recall wiring**

Run:

```bash
rg -n "selectRelevantSegments|buildMultiSegmentSummarySystemMessage|segmentRecall" src test
```

Expected current result:

- Function definitions exist in `src/components/BChatSidebar/utils/compression/segmentRecall.ts`.
- No send-path call site is visible unless implementation has changed since this plan was written.

Record the result in the implementation notes. If a call site exists, update it in the next steps. If no call site exists, keep runtime behavior unchanged and test the helper-level rendering only.

- [ ] **Step 2: Write failing segment recall renderer test**

Create `test/components/BChat/compression-segment-recall.test.ts`:

```ts
/**
 * @file compression-segment-recall.test.ts
 * @description BChatSidebar 多段摘要召回渲染测试。
 */
import { describe, expect, it } from 'vitest';
import { buildMultiSegmentSummarySystemMessage } from '@/components/BChatSidebar/utils/compression/segmentRecall';
import type { CompressionRecord } from '@/components/BChatSidebar/utils/compression/types';

/**
 * 创建多段压缩记录。
 * @param id - 记录 ID
 * @param segmentIndex - 段索引
 * @param fact - 关键事实
 * @returns 压缩记录
 */
function createSegment(id: string, segmentIndex: number, fact: string): CompressionRecord {
  return {
    id,
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: `${id}-start`,
    coveredEndMessageId: `${id}-end`,
    coveredUntilMessageId: `${id}-end`,
    sourceMessageIds: [`${id}-start`, `${id}-end`],
    preservedMessageIds: [],
    recordText: `旧格式摘要：${fact}`,
    structuredSummary: {
      goal: `段 ${segmentIndex} 的目标`,
      recentTopic: `段 ${segmentIndex} 的话题`,
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [fact],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    },
    triggerReason: 'manual',
    messageCountSnapshot: 20,
    charCountSnapshot: 4000,
    schemaVersion: 2,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    recordSetId: 'record-set-1',
    segmentIndex,
    segmentCount: 2
  };
}

describe('buildMultiSegmentSummarySystemMessage', () => {
  it('keeps the XML wrapper while rendering each segment as Markdown handoff content', (): void => {
    const text = buildMultiSegmentSummarySystemMessage([createSegment('segment-0', 0, '用户喜欢轻松但直接的聊天方式'), createSegment('segment-1', 1, '用户正在讨论周末阅读计划')]);

    expect(text).toContain('<conversation_history_summary>');
    expect(text).toContain('<conversation_summary segment="0">');
    expect(text).toContain('<conversation_summary segment="1">');
    expect(text).toContain('## Conversation Continuity');
    expect(text).toContain('## Critical Facts');
    expect(text).toContain('用户喜欢轻松但直接的聊天方式');
    expect(text).toContain('用户正在讨论周末阅读计划');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm test test/components/BChat/compression-segment-recall.test.ts
```

Expected: FAIL because current `buildMultiSegmentSummarySystemMessage()` uses `record.recordText` directly and does not render Markdown sections.

- [ ] **Step 4: Update segment recall helper to use renderer**

Modify `src/components/BChatSidebar/utils/compression/segmentRecall.ts`:

```ts
import { renderCompressionHandoff } from './summaryRenderer';
```

Replace the segment block mapping with:

```ts
const segmentBlocks = segments
  .map((s) => {
    const index = s.segmentIndex ?? 0;
    return `<conversation_summary segment="${index}">
${renderCompressionHandoff({ record: s })}
</conversation_summary>`;
  })
  .join('\n');
```

- [ ] **Step 5: Run segment recall tests**

Run:

```bash
pnpm test test/components/BChat/compression-segment-recall.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run targeted lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/utils/compression/segmentRecall.ts src/components/BChatSidebar/utils/compression/summaryRenderer.ts test/components/BChat/compression-segment-recall.test.ts
```

Expected: no ESLint errors.

---

### Task 5: Add Golden Case Compression Benefit Helpers

**Files:**
- Modify: `test/components/BChat/compression-summary-renderer.test.ts`

- [ ] **Step 1: Add token approximation helper tests**

Append this helper and test to `test/components/BChat/compression-summary-renderer.test.ts`:

```ts
/**
 * 粗略估算测试文本 token 数。
 * @param text - 文本
 * @returns 估算 token 数
 */
function estimateTestTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 计算测试用压缩率。
 * @param originalText - 原始上下文文本
 * @param compressedText - 压缩上下文文本
 * @returns 压缩率
 */
function calculateCompressionRatio(originalText: string, compressedText: string): number {
  return estimateTestTokens(compressedText) / estimateTestTokens(originalText);
}

it('keeps golden case compression ratio below the documented threshold', (): void => {
  const originalText = Array.from({ length: 40 })
    .map((_, index) => `第 ${index + 1} 轮：用户继续聊阅读计划、生活节奏、偏好、限制和下一步安排。这里有较长的上下文内容用于模拟长聊天。`)
    .join('\n');
  const compressedText = renderCompressionHandoff({ record: createRecord() });

  expect(calculateCompressionRatio(originalText, compressedText)).toBeLessThanOrEqual(0.6);
});
```

- [ ] **Step 2: Run renderer tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts
```

Expected: PASS. If the compression ratio fails because the fixture is too short, lengthen `originalText` rather than weakening the assertion.

---

### Task 6: Update Changelog And Run Verification

**Files:**
- Modify: `changelog/2026-06-05.md`

- [ ] **Step 1: Update changelog**

Add this entry under `## Changed` in `changelog/2026-06-05.md`:

```md
- 将聊天上下文压缩边界渲染为 Markdown 交接稿，并对齐多段摘要召回的渲染格式。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-segment-recall.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run focused lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/hooks/useCompactContext.ts src/components/BChatSidebar/utils/compression/summaryRenderer.ts src/components/BChatSidebar/utils/compression/segmentRecall.ts test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-segment-recall.test.ts
```

Expected: no ESLint errors.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: either pass, or fail only on known pre-existing `Cannot find namespace 'Electron'` errors in `src/views/webview/web/...`. If new errors appear in touched files, fix them before reporting.

- [ ] **Step 5: Check git state without committing**

Run:

```bash
git status --short
```

Expected: changed files are visible, but no commit is created. Do not run `git commit`.

---

## Self-Review Checklist

- Spec coverage:
  - Renderer First: Task 1, Task 2, Task 3.
  - Multi-segment alignment: Task 4.
  - Golden cases and compression benefit metric: Task 1, Task 5.
  - Changelog and verification: Task 6.
- No schema v3 implementation is included in this plan.
- No tail token-budget implementation is included in this plan.
- No commit step is included because the user requested that written code not be committed.
