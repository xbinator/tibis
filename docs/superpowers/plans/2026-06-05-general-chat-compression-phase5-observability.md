# General Chat Compression Phase 5 Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit changes unless the user explicitly asks for a commit.

**Goal:** Add lightweight developer observability for chat compression quality so future golden cases can inspect compression ratio, preserved raw requirements, and open loops.

**Architecture:** Add a pure metrics module that computes compression quality metrics from a `CompressionRecord`, rendered boundary text, and source messages. `useCompactContext` logs one structured line after successful compression through the existing renderer logger, without adding UI or changing storage.

**Tech Stack:** TypeScript strict mode, Vitest, existing BChatSidebar compression renderer, existing shared logger.

---

## Implementation Status

Implemented in the current working tree. The final implementation adds pure compression metrics calculation and writes one structured `[BChatCompression]` log line after a successful compression boundary is built.

Verification recorded during implementation:

- `pnpm test test/components/BChat/compression-metrics.test.ts`
- Included again in the final focused compression test run on 2026-06-05.

---

## Scope

This phase implements:

- Compression metric calculation.
- Stable log-line formatting.
- Successful compression logging from `useCompactContext`.
- Focused tests for metrics and formatting.

This phase does not implement a UI debug panel, persistent metric storage, analytics upload, or model-token-accurate measurement.

## File Structure

- Create `src/components/BChatSidebar/utils/compression/compressionMetrics.ts`
  - Owns metric calculation and log formatting.
- Modify `src/components/BChatSidebar/hooks/useCompactContext.ts`
  - Logs metrics after a successful compression boundary is built.
- Add `test/components/BChat/compression-metrics.test.ts`
  - Unit tests for metric calculation and log formatting.
- Modify `changelog/2026-06-05.md`
  - Add a `Changed` entry.

---

### Task 1: Metrics Tests

**Files:**
- Create: `test/components/BChat/compression-metrics.test.ts`
- Create later: `src/components/BChatSidebar/utils/compression/compressionMetrics.ts`

- [ ] **Step 1: Write failing tests**

Create `test/components/BChat/compression-metrics.test.ts`:

```ts
/**
 * @file compression-metrics.test.ts
 * @description BChatSidebar 压缩质量指标测试。
 */
import { describe, expect, it } from 'vitest';
import { createCompressionMetrics, formatCompressionMetricsLog } from '@/components/BChatSidebar/utils/compression/compressionMetrics';
import type { CompressionRecord } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建消息测试数据。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

/**
 * 创建压缩记录测试数据。
 * @returns 压缩记录
 */
function createRecord(): CompressionRecord {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'u1',
    coveredEndMessageId: 'a1',
    coveredUntilMessageId: 'a1',
    sourceMessageIds: ['u1', 'a1'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天',
    structuredSummary: {
      goal: '继续长聊天',
      recentTopic: '阅读计划',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: ['用户原始需求：保留书单《悉达多》', '用户周末晚上阅读'],
      fileContext: [],
      openQuestions: ['下一本书未确定'],
      pendingActions: ['继续给阅读安排建议']
    },
    generalSummary: {
      conversationContinuity: ['继续长聊天'],
      goal: '继续长聊天',
      recentTopic: '阅读计划',
      userPreferences: [],
      constraints: [],
      decisions: [],
      criticalFacts: ['用户周末晚上阅读'],
      rawUserRequirements: ['保留书单《悉达多》'],
      openLoops: ['下一本书未确定', '继续给阅读安排建议'],
      recentDirection: ['阅读计划'],
      fileContext: []
    },
    triggerReason: 'manual',
    messageCountSnapshot: 2,
    charCountSnapshot: 200,
    schemaVersion: 3,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
  };
}

describe('compressionMetrics', () => {
  it('computes source, boundary, ratio, raw requirement, and open loop metrics', (): void => {
    const metrics = createCompressionMetrics({
      record: createRecord(),
      boundaryText: 'COMPRESSED_CONTEXT\n短摘要',
      sourceMessages: [createMessage('u1', 'user', '用户原始长消息'.repeat(30)), createMessage('a1', 'assistant', '助手长回复'.repeat(30))]
    });

    expect(metrics.recordId).toBe('record-1');
    expect(metrics.schemaVersion).toBe(3);
    expect(metrics.sourceMessageCount).toBe(2);
    expect(metrics.sourceCharCount).toBeGreaterThan(metrics.boundaryCharCount);
    expect(metrics.compressionRatio).toBeLessThan(1);
    expect(metrics.rawUserRequirementCount).toBe(1);
    expect(metrics.openLoopCount).toBe(2);
  });

  it('formats a stable single-line compression metrics log', (): void => {
    const line = formatCompressionMetricsLog({
      recordId: 'record-1',
      schemaVersion: 3,
      sourceMessageCount: 2,
      sourceCharCount: 1000,
      boundaryCharCount: 250,
      compressionRatio: 0.25,
      rawUserRequirementCount: 1,
      openLoopCount: 2
    });

    expect(line).toBe('[BChatCompression] record=record-1 schema=3 source_messages=2 source_chars=1000 boundary_chars=250 ratio=0.25 raw_requirements=1 open_loops=2');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm test test/components/BChat/compression-metrics.test.ts
```

Expected: FAIL because `compressionMetrics.ts` does not exist.

---

### Task 2: Metrics Module

**Files:**
- Create: `src/components/BChatSidebar/utils/compression/compressionMetrics.ts`
- Test: `test/components/BChat/compression-metrics.test.ts`

- [ ] **Step 1: Implement metrics module**

Create `src/components/BChatSidebar/utils/compression/compressionMetrics.ts`:

```ts
/**
 * @file compressionMetrics.ts
 * @description 聊天压缩质量指标计算与日志格式化。
 */
import { toGeneralConversationSummary } from './summaryAdapter';
import type { CompressionRecord } from './types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 压缩指标输入。
 */
export interface CreateCompressionMetricsInput {
  /** 压缩记录 */
  record: CompressionRecord;
  /** 实际注入模型的压缩边界文本 */
  boundaryText: string;
  /** 进入摘要生成的源消息 */
  sourceMessages: Message[];
}

/**
 * 压缩质量指标。
 */
export interface CompressionMetrics {
  /** 压缩记录 ID */
  recordId: string;
  /** 摘要 schema 版本 */
  schemaVersion: number;
  /** 进入摘要的源消息数 */
  sourceMessageCount: number;
  /** 进入摘要的源消息字符数 */
  sourceCharCount: number;
  /** 实际压缩边界字符数 */
  boundaryCharCount: number;
  /** 压缩后/压缩前字符比例 */
  compressionRatio: number;
  /** 原始用户需求数量 */
  rawUserRequirementCount: number;
  /** 未完成事项数量 */
  openLoopCount: number;
}

/**
 * 估算消息字符数。
 * @param message - 聊天消息
 * @returns 消息字符数
 */
function estimateMessageChars(message: Message): number {
  if (message.content) {
    return message.content.length;
  }

  return message.parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool') return `${part.toolName} ${part.status}`;
      return part.type;
    })
    .join(' ').length;
}

/**
 * 计算聊天压缩质量指标。
 * @param input - 指标输入
 * @returns 压缩质量指标
 */
export function createCompressionMetrics(input: CreateCompressionMetricsInput): CompressionMetrics {
  const { record, boundaryText, sourceMessages } = input;
  const generalSummary = toGeneralConversationSummary(record);
  const sourceCharCount = sourceMessages.reduce((total, message) => total + estimateMessageChars(message), 0);
  const boundaryCharCount = boundaryText.length;

  return {
    recordId: record.id,
    schemaVersion: record.schemaVersion,
    sourceMessageCount: sourceMessages.length,
    sourceCharCount,
    boundaryCharCount,
    compressionRatio: sourceCharCount > 0 ? Number((boundaryCharCount / sourceCharCount).toFixed(4)) : 0,
    rawUserRequirementCount: generalSummary.rawUserRequirements.length,
    openLoopCount: generalSummary.openLoops.length
  };
}

/**
 * 格式化压缩指标日志。
 * @param metrics - 压缩质量指标
 * @returns 单行日志文本
 */
export function formatCompressionMetricsLog(metrics: CompressionMetrics): string {
  return [
    '[BChatCompression]',
    `record=${metrics.recordId}`,
    `schema=${metrics.schemaVersion}`,
    `source_messages=${metrics.sourceMessageCount}`,
    `source_chars=${metrics.sourceCharCount}`,
    `boundary_chars=${metrics.boundaryCharCount}`,
    `ratio=${metrics.compressionRatio}`,
    `raw_requirements=${metrics.rawUserRequirementCount}`,
    `open_loops=${metrics.openLoopCount}`
  ].join(' ');
}
```

- [ ] **Step 2: Run metrics tests**

Run:

```bash
pnpm test test/components/BChat/compression-metrics.test.ts
```

Expected: PASS.

---

### Task 3: Hook Logging

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useCompactContext.ts`

- [ ] **Step 1: Wire metrics logging**

Import:

```ts
import { logger } from '@/shared/logger';
import { createCompressionMetrics, formatCompressionMetricsLog } from '../utils/compression/compressionMetrics';
```

Inside `buildCompressionBoundaryMessage()`, after `boundaryText` is built for successful compression:

```ts
const boundaryText = buildStructuredCompressionContext(result.record, sourceMessages);
logger.info(formatCompressionMetricsLog(createCompressionMetrics({ record: result.record, boundaryText, sourceMessages })));
return createSuccessfulCompressionMessage({
  boundaryText,
  recordId: result.record.id,
  coveredUntilMessageId: result.record.coveredUntilMessageId,
  sourceMessageIds: result.record.sourceMessageIds
});
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/compression-metrics.test.ts test/components/BChat/message-helper-compression.test.ts
```

Expected: PASS.

---

### Task 4: Verification And Changelog

**Files:**
- Modify: `changelog/2026-06-05.md`

- [ ] **Step 1: Update changelog**

Add under `## Changed`:

```md
- 为聊天上下文压缩增加开发者可观察性日志，记录压缩比例、原始需求数量和未完成事项数量。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/compression-metrics.test.ts test/components/BChat/compression-tail-policy.test.ts test/components/BChat/message-helper-compression.test.ts test/components/BChat/compression-summary-adapter.test.ts test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-segment-recall.test.ts test/components/BChat/compression-coordinator-v3.test.ts test/components/BChat/compression-summary-v3-prompt.test.ts test/components/BChat/compression-summary.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run focused lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/utils/compression/compressionMetrics.ts src/components/BChatSidebar/hooks/useCompactContext.ts test/components/BChat/compression-metrics.test.ts
```

Expected: no ESLint errors.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: either pass, or fail only on known pre-existing `Cannot find namespace 'Electron'` errors in `src/views/webview/web/...`. New errors in touched files must be fixed.

- [ ] **Step 5: Confirm no staged changes**

Run:

```bash
git diff --cached --name-only
```

Expected: empty output. Do not commit.
