# General Chat Compression Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit changes unless the user explicitly asks for a commit.

**Goal:** Introduce a v3 general-chat summary view for long-chat compression while keeping existing v2 records readable and existing v2 summary generation stable.

**Architecture:** Add a normalized `GeneralConversationSummary` view and an adapter layer before changing runtime writes. The renderer reads only the normalized view; coordinator writes v3 records by deriving `generalSummary` from the existing `structuredSummary`, while keeping `structuredSummary` populated for older consumers. The summarizer prompt is upgraded for v3 fidelity, but its public return type stays v2 during this phase to avoid a risky generation-path rewrite.

**Tech Stack:** TypeScript strict mode, Vitest, existing compression modules under `src/components/BChatSidebar/utils/compression`, shared compression types in `types/compression.d.ts`.

---

## Implementation Status

Implemented in the current working tree. The final implementation adds `GeneralConversationSummary`, keeps `structuredSummary` for compatibility, derives `generalSummary` for new records, upgrades schema version to 3, and renders both v2 and v3 records through `summaryAdapter`.

Verification recorded during implementation:

- `pnpm test test/components/BChat/compression-summary-adapter.test.ts test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-coordinator-v3.test.ts test/components/BChat/compression-summary-v3-prompt.test.ts`
- Included again in the final focused compression test run on 2026-06-05.

---

## Scope

This plan implements Phase 3 only:

- v3 `GeneralConversationSummary` type.
- v2-to-v3 adapter for read/render compatibility.
- renderer migration from v2 fields to normalized v3 view.
- coordinator writes `schemaVersion: 3` and `generalSummary` for new records.
- summary prompt/fallback tests that protect raw requirements and open-loop semantics.

This plan does not implement tail token budget, storage migration, UI debug panels, user-editable memory, or runtime segment recall wiring.

## File Structure

- Modify `types/compression.d.ts`
  - Add `GeneralConversationSummary`.
  - Add optional `generalSummary?: GeneralConversationSummary` to `CompressionRecord`.
- Modify `src/components/BChatSidebar/utils/compression/types.ts`
  - Re-export `GeneralConversationSummary`.
  - Allow `GenerateStructuredSummaryInput.previousRecord` to carry optional `generalSummary`.
- Create `src/components/BChatSidebar/utils/compression/summaryAdapter.ts`
  - Converts legacy `StructuredConversationSummary` into `GeneralConversationSummary`.
  - Returns native `record.generalSummary` when present.
- Modify `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`
  - Render from `toGeneralConversationSummary(record)`.
  - Remove renderer-local raw requirement splitting that belongs in the adapter.
- Modify `src/components/BChatSidebar/utils/compression/coordinator.ts`
  - Derive `generalSummary` once per generated structured summary.
  - Write new records with current schema version 3 while retaining `structuredSummary`.
- Modify `src/components/BChatSidebar/utils/compression/constant.ts`
  - Change `CURRENT_SCHEMA_VERSION` from `2` to `3`.
- Modify `src/components/BChatSidebar/utils/compression/structuredSummaryGenerator.ts`
  - Upgrade prompt wording for conversation continuity, raw user requirements, and open-loop refresh.
  - Include previous `generalSummary` in prompt context when available.
- Add `test/components/BChat/compression-summary-adapter.test.ts`
  - Adapter compatibility tests.
- Extend `test/components/BChat/compression-summary-renderer.test.ts`
  - Native v3 renderer test.
- Add `test/components/BChat/compression-coordinator-v3.test.ts`
  - Coordinator record payload test.
- Add `test/components/BChat/compression-summary-v3-prompt.test.ts`
  - Summarizer prompt and fallback behavior tests.
- Modify `changelog/2026-06-05.md`
  - Add a `Changed` entry after implementation.

---

### Task 1: Add V3 Types And Adapter

**Files:**
- Modify: `types/compression.d.ts`
- Modify: `src/components/BChatSidebar/utils/compression/types.ts`
- Create: `src/components/BChatSidebar/utils/compression/summaryAdapter.ts`
- Create: `test/components/BChat/compression-summary-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter tests**

Create `test/components/BChat/compression-summary-adapter.test.ts`:

```ts
/**
 * @file compression-summary-adapter.test.ts
 * @description BChatSidebar 压缩摘要 v2/v3 兼容视图测试。
 */
import { describe, expect, it } from 'vitest';
import { fromStructuredConversationSummary, toGeneralConversationSummary } from '@/components/BChatSidebar/utils/compression/summaryAdapter';
import type { CompressionRecord, GeneralConversationSummary, StructuredConversationSummary } from '@/components/BChatSidebar/utils/compression/types';

/**
 * 创建 v2 摘要测试数据。
 * @returns v2 结构化摘要
 */
function createStructuredSummary(): StructuredConversationSummary {
  return {
    goal: '继续长聊天',
    recentTopic: '阅读和生活节奏',
    userPreferences: ['喜欢轻松但直接的语气'],
    constraints: ['不要反复说教'],
    decisions: ['先聊阅读节奏'],
    importantFacts: ['用户原始需求：保留书单《悉达多》《置身事内》', '用户周末晚上有完整时间'],
    fileContext: [],
    openQuestions: ['下一本书未确定'],
    pendingActions: ['继续给阅读安排建议']
  };
}

/**
 * 创建 v2 压缩记录测试数据。
 * @param overrides - 覆盖字段
 * @returns 压缩记录
 */
function createRecord(overrides: Partial<CompressionRecord> = {}): CompressionRecord {
  return {
    id: 'record-v2',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm2',
    coveredUntilMessageId: 'm2',
    sourceMessageIds: ['m1', 'm2'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天\n重要事实：用户喜欢轻松但直接的语气',
    structuredSummary: createStructuredSummary(),
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

describe('summaryAdapter', () => {
  it('maps v2 structured summary into the v3 general summary view', (): void => {
    const summary = fromStructuredConversationSummary(createStructuredSummary());

    expect(summary.conversationContinuity).toEqual(['继续长聊天', '阅读和生活节奏']);
    expect(summary.criticalFacts).toEqual(['用户周末晚上有完整时间']);
    expect(summary.rawUserRequirements).toEqual(['保留书单《悉达多》《置身事内》']);
    expect(summary.openLoops).toEqual(['下一本书未确定', '继续给阅读安排建议']);
    expect(summary.recentDirection).toEqual(['阅读和生活节奏']);
  });

  it('prefers native v3 generalSummary when present', (): void => {
    const nativeSummary: GeneralConversationSummary = {
      conversationContinuity: ['用户希望自然连续地聊天'],
      goal: '继续长期闲聊',
      recentTopic: '情绪和生活节奏',
      userPreferences: ['语气温和'],
      constraints: ['不要催促'],
      decisions: ['先倾听'],
      criticalFacts: ['用户最近睡眠不好'],
      rawUserRequirements: ['不要直接给鸡汤'],
      openLoops: ['继续聊睡眠安排'],
      recentDirection: ['用户从工作压力转向睡眠问题'],
      fileContext: []
    };

    expect(toGeneralConversationSummary(createRecord({ schemaVersion: 3, generalSummary: nativeSummary }))).toEqual(nativeSummary);
  });
});
```

- [ ] **Step 2: Run the adapter test and confirm it fails**

Run:

```bash
pnpm test test/components/BChat/compression-summary-adapter.test.ts
```

Expected: FAIL because `summaryAdapter.ts` and `GeneralConversationSummary` do not exist.

- [ ] **Step 3: Add shared v3 types**

Modify `types/compression.d.ts` by adding the interface after `StructuredConversationSummary`:

```ts
/** 通用长聊天压缩摘要 */
export interface GeneralConversationSummary {
  /** 对话连续性：关系、语气、长期主线和用户期待的互动方式 */
  conversationContinuity: string[];
  /** 用户正在长期或当前尝试达成的目标 */
  goal: string;
  /** 最近讨论主线，偏自然语言，不替代事实字段 */
  recentTopic: string;
  /** 用户长期偏好、称呼、语气、边界和互动方式 */
  userPreferences: string[];
  /** 明确限制、必须遵守的条件和用户要求 */
  constraints: string[];
  /** 已达成的共识、判断或选择 */
  decisions: string[];
  /** 不可丢的事实、数字、名单、代码、路径、URL、时间点 */
  criticalFacts: string[];
  /** 从用户原文中确定性摘录出的需求和清单 */
  rawUserRequirements: string[];
  /** 当前未完成事项、等待回答的问题、下一步方向 */
  openLoops: string[];
  /** 最近 3 轮左右的对话转折 */
  recentDirection: string[];
  /** 文件上下文 */
  fileContext: FileContextSummary[];
}
```

Then add the optional field to `CompressionRecord` after `structuredSummary`:

```ts
  /** v3 通用长聊天摘要视图 */
  generalSummary?: GeneralConversationSummary;
```

- [ ] **Step 4: Re-export the v3 type and previous record field**

Modify `src/components/BChatSidebar/utils/compression/types.ts`.

Add `GeneralConversationSummary` to the re-export block:

```ts
  GeneralConversationSummary,
```

Update `GenerateStructuredSummaryInput.previousRecord`:

```ts
  /** 上一条压缩记录（增量模式下传入） */
  previousRecord?: Pick<CompressionRecord, 'recordText' | 'structuredSummary' | 'generalSummary'>;
```

- [ ] **Step 5: Implement the adapter**

Create `src/components/BChatSidebar/utils/compression/summaryAdapter.ts`:

```ts
/**
 * @file summaryAdapter.ts
 * @description 将不同版本的压缩摘要转换为通用长聊天摘要视图。
 */
import type { CompressionRecord, GeneralConversationSummary, StructuredConversationSummary } from './types';

/**
 * 判断摘要列表项是否为用户原始需求。
 * @param value - 摘要列表项
 * @returns 是否为用户原始需求
 */
function isRawRequirement(value: string): boolean {
  return value.startsWith('用户原始需求：');
}

/**
 * 移除用户原始需求前缀。
 * @param value - 摘要列表项
 * @returns 去掉前缀后的文本
 */
function stripRawRequirementPrefix(value: string): string {
  return value.replace(/^用户原始需求：/, '').trim();
}

/**
 * 从 v2 摘要构建 v3 对话连续性字段。
 * @param summary - v2 结构化摘要
 * @returns 对话连续性列表
 */
function buildConversationContinuity(summary: StructuredConversationSummary): string[] {
  return [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0);
}

/**
 * 将 v2 结构化摘要转换为 v3 通用摘要视图。
 * @param summary - v2 结构化摘要
 * @returns v3 通用摘要视图
 */
export function fromStructuredConversationSummary(summary: StructuredConversationSummary): GeneralConversationSummary {
  return {
    conversationContinuity: buildConversationContinuity(summary),
    goal: summary.goal,
    recentTopic: summary.recentTopic,
    userPreferences: summary.userPreferences,
    constraints: summary.constraints,
    decisions: summary.decisions,
    criticalFacts: summary.importantFacts.filter((item) => !isRawRequirement(item)),
    rawUserRequirements: summary.importantFacts.filter(isRawRequirement).map(stripRawRequirementPrefix),
    openLoops: [...summary.openQuestions, ...summary.pendingActions],
    recentDirection: summary.recentTopic ? [summary.recentTopic] : [],
    fileContext: summary.fileContext
  };
}

/**
 * 获取压缩记录的通用摘要视图。
 * @param record - 压缩记录或压缩记录视图
 * @returns v3 通用摘要视图
 */
export function toGeneralConversationSummary(record: Pick<CompressionRecord, 'structuredSummary' | 'generalSummary'>): GeneralConversationSummary {
  if (record.generalSummary) {
    return record.generalSummary;
  }

  return fromStructuredConversationSummary(record.structuredSummary);
}
```

- [ ] **Step 6: Run adapter tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-adapter.test.ts
```

Expected: PASS.

---

### Task 2: Move Renderer To Adapter View

**Files:**
- Modify: `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`
- Modify: `test/components/BChat/compression-summary-renderer.test.ts`

- [ ] **Step 1: Add a native v3 renderer test**

Append this case inside the existing `describe('renderCompressionHandoff', ...)` block in `test/components/BChat/compression-summary-renderer.test.ts`:

```ts
  it('renders native v3 general summary fields', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        schemaVersion: 3,
        generalSummary: {
          conversationContinuity: ['用户希望自然连续地聊天'],
          goal: '继续长期闲聊',
          recentTopic: '情绪和生活节奏',
          userPreferences: ['语气温和'],
          constraints: ['不要催促'],
          decisions: ['先倾听'],
          criticalFacts: ['用户最近睡眠不好'],
          rawUserRequirements: ['不要直接给鸡汤'],
          openLoops: ['继续聊睡眠安排'],
          recentDirection: ['用户从工作压力转向睡眠问题'],
          fileContext: []
        }
      })
    });

    expect(text).toContain('用户希望自然连续地聊天');
    expect(text).toContain('用户最近睡眠不好');
    expect(text).toContain('不要直接给鸡汤');
    expect(text).toContain('用户从工作压力转向睡眠问题');
  });
```

- [ ] **Step 2: Run renderer tests and confirm the new test fails**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts
```

Expected: FAIL because renderer still reads `record.structuredSummary` directly.

- [ ] **Step 3: Update renderer imports and file context type**

Modify `src/components/BChatSidebar/utils/compression/summaryRenderer.ts`.

Add imports:

```ts
import { toGeneralConversationSummary } from './summaryAdapter';
import type { GeneralConversationSummary } from './types';
```

Remove `isRawRequirement()` and `stripRawRequirementPrefix()` from this file after rendering uses adapter fields.

Change `renderFileContext()` signature:

```ts
function renderFileContext(fileContext: GeneralConversationSummary['fileContext']): string[] {
```

- [ ] **Step 4: Replace structured-summary content detection**

Replace `hasStructuredSummaryContent()` with:

```ts
/**
 * 判断通用摘要是否已经包含可渲染信息。
 * @param summary - 通用摘要视图
 * @returns 是否存在非空结构化信息
 */
function hasGeneralSummaryContent(summary: GeneralConversationSummary): boolean {
  return Boolean(
    summary.conversationContinuity.length ||
      summary.goal.trim() ||
      summary.recentTopic.trim() ||
      summary.userPreferences.length ||
      summary.constraints.length ||
      summary.decisions.length ||
      summary.criticalFacts.length ||
      summary.rawUserRequirements.length ||
      summary.openLoops.length ||
      summary.recentDirection.length ||
      summary.fileContext.length
  );
}
```

- [ ] **Step 5: Render from the adapter view**

Inside `renderCompressionHandoff()`, replace v2 field derivation with:

```ts
  const summary = toGeneralConversationSummary(record);
  const summarySnapshot = !hasGeneralSummaryContent(summary) && record.recordText.trim() ? [record.recordText.trim()] : [];
  const continuity = summary.conversationContinuity.length ? summary.conversationContinuity : [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0);
  const keyToolResults = extractKeyToolResultContext(sourceMessages);
```

Update the returned sections to use:

```ts
    '## Critical Facts',
    renderBullets(summary.criticalFacts),
    '',
    '## Raw User Requirements',
    renderBullets(summary.rawUserRequirements),
    '',
    '## Open Loops',
    renderBullets(summary.openLoops),
    '',
    '## Recent Direction',
    renderBullets(summary.recentDirection),
```

Keep the existing `## Relevant Files` and `## Key Tool Results` sections.

- [ ] **Step 6: Run renderer and adapter tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-summary-adapter.test.ts
```

Expected: PASS.

---

### Task 3: Write V3 Records In Coordinator

**Files:**
- Modify: `src/components/BChatSidebar/utils/compression/constant.ts`
- Modify: `src/components/BChatSidebar/utils/compression/coordinator.ts`
- Create: `test/components/BChat/compression-coordinator-v3.test.ts`

- [ ] **Step 1: Write the failing coordinator test**

Create `test/components/BChat/compression-coordinator-v3.test.ts`:

```ts
/**
 * @file compression-coordinator-v3.test.ts
 * @description BChatSidebar 压缩协调器 v3 记录写入测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompressionCoordinator } from '@/components/BChatSidebar/utils/compression/coordinator';
import type { CompressionRecord, CompressionRecordStorage, StructuredConversationSummary } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/** 摘要生成器测试替身。 */
const mockSummaryGenerator = vi.hoisted(() => ({
  generateStructuredSummary: vi.fn<() => Promise<StructuredConversationSummary>>(),
  generateSummaryText: vi.fn<(summary: StructuredConversationSummary) => string>()
}));

vi.mock('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator', () => ({
  generateStructuredSummary: mockSummaryGenerator.generateStructuredSummary,
  generateSummaryText: mockSummaryGenerator.generateSummaryText
}));

/**
 * 创建聊天消息测试数据。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息文本
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
 * 创建结构化摘要测试数据。
 * @returns 结构化摘要
 */
function createStructuredSummary(): StructuredConversationSummary {
  return {
    goal: '继续长聊天',
    recentTopic: '阅读和生活节奏',
    userPreferences: ['喜欢轻松但直接'],
    constraints: ['不要反复说教'],
    decisions: ['先整理阅读节奏'],
    importantFacts: ['用户原始需求：保留书单《悉达多》', '用户周末晚上有完整时间'],
    fileContext: [],
    openQuestions: ['下一本书未确定'],
    pendingActions: ['继续给阅读安排建议']
  };
}

/**
 * 创建压缩记录存储测试替身。
 * @returns 存储替身和已写入记录列表
 */
function createStorage(): {
  storage: CompressionRecordStorage;
  createdRecords: Array<Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>>;
} {
  const createdRecords: Array<Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>> = [];
  const storage: CompressionRecordStorage = {
    getLatestValidRecord: vi.fn(async (): Promise<CompressionRecord | undefined> => undefined),
    createRecord: vi.fn(async (record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord> => {
      createdRecords.push(record);
      return {
        ...record,
        id: `record-${createdRecords.length}`,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z'
      };
    }),
    updateRecordStatus: vi.fn(async (): Promise<void> => undefined),
    getAllRecords: vi.fn(async (): Promise<CompressionRecord[]> => [])
  };

  return { storage, createdRecords };
}

describe('createCompressionCoordinator v3 records', () => {
  beforeEach((): void => {
    mockSummaryGenerator.generateStructuredSummary.mockResolvedValue(createStructuredSummary());
    mockSummaryGenerator.generateSummaryText.mockImplementation((summary: StructuredConversationSummary): string => {
      return `目标：${summary.goal}\n话题：${summary.recentTopic}`;
    });
  });

  it('writes schemaVersion 3 with generalSummary while keeping structuredSummary', async (): Promise<void> => {
    const { storage, createdRecords } = createStorage();
    const coordinator = createCompressionCoordinator(storage);

    await coordinator.compressSessionManually({
      sessionId: 'session-1',
      messages: [
        createMessage('m1', 'user', '请继续记住我的阅读计划。'),
        createMessage('m2', 'assistant', '好的，我会保留这些上下文。')
      ]
    });

    expect(createdRecords).toHaveLength(1);
    const record = createdRecords[0];
    expect(record.schemaVersion).toBe(3);
    expect(record.structuredSummary.importantFacts).toContain('用户原始需求：保留书单《悉达多》');
    expect(record.generalSummary?.criticalFacts).toContain('用户周末晚上有完整时间');
    expect(record.generalSummary?.rawUserRequirements).toContain('保留书单《悉达多》');
    expect(record.generalSummary?.openLoops).toEqual(['下一本书未确定', '继续给阅读安排建议']);
  });
});
```

- [ ] **Step 2: Run the coordinator test and confirm it fails**

Run:

```bash
pnpm test test/components/BChat/compression-coordinator-v3.test.ts
```

Expected: FAIL because records are still written with `schemaVersion: 2` and no `generalSummary`.

- [ ] **Step 3: Update schema version constant**

Modify `src/components/BChatSidebar/utils/compression/constant.ts`:

```ts
/** 当前支持的摘要 schema 版本 */
export const CURRENT_SCHEMA_VERSION = 3;
```

- [ ] **Step 4: Derive generalSummary in coordinator**

Modify `src/components/BChatSidebar/utils/compression/coordinator.ts`.

Add import:

```ts
import { fromStructuredConversationSummary } from './summaryAdapter';
```

After each successful `generateStructuredSummary()` call, derive:

```ts
      const generalSummary = fromStructuredConversationSummary(structuredSummary);
```

When calling `storage.createRecord()` in both single-record and multi-segment paths, include:

```ts
          generalSummary,
```

Keep the existing `structuredSummary` field in the same payload.

- [ ] **Step 5: Run coordinator test**

Run:

```bash
pnpm test test/components/BChat/compression-coordinator-v3.test.ts
```

Expected: PASS.

---

### Task 4: Upgrade Summary Prompt Compatibility

**Files:**
- Modify: `src/components/BChatSidebar/utils/compression/structuredSummaryGenerator.ts`
- Create: `test/components/BChat/compression-summary-v3-prompt.test.ts`

- [ ] **Step 1: Write the failing prompt and fallback tests**

Create `test/components/BChat/compression-summary-v3-prompt.test.ts`:

```ts
/**
 * @file compression-summary-v3-prompt.test.ts
 * @description BChatSidebar v3 摘要提示词与 fallback 保真测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateStructuredSummary } from '@/components/BChatSidebar/utils/compression/structuredSummaryGenerator';
import type { StructuredConversationSummary, TrimmedMessageItem } from '@/components/BChatSidebar/utils/compression/types';

/** AI 调用参数测试视图。 */
interface MockAIInvokeOptions {
  messages: Array<{ role: string; content: string }>;
  output?: {
    schema?: unknown;
    name?: string;
    description?: string;
  };
}

/** AI 调用测试替身类型。 */
type MockAIInvoke = (provider: unknown, options: MockAIInvokeOptions) => Promise<[unknown, { output?: unknown; text: string }]>;

/** 存储层测试替身。 */
const mockStorage = vi.hoisted(() => ({
  providerStorage: {
    getProvider: vi.fn<() => Promise<{ id: string; name: string; apiKey: string; baseUrl: string; type: string; isEnabled: boolean } | null>>()
  },
  serviceModelsStorage: {
    getConfig: vi.fn<() => Promise<{ providerId: string; modelId: string } | null>>()
  }
}));

/** Electron API 测试替身。 */
const mockElectron = vi.hoisted(() => ({
  aiInvoke: vi.fn<MockAIInvoke>()
}));

vi.mock('@/shared/storage', () => ({
  providerStorage: mockStorage.providerStorage,
  serviceModelsStorage: mockStorage.serviceModelsStorage
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => mockElectron)
}));

/**
 * 创建模型输出摘要。
 * @returns 结构化摘要
 */
function createModelSummary(): StructuredConversationSummary {
  return {
    goal: '继续长聊天',
    recentTopic: '阅读和睡眠安排',
    userPreferences: ['温和直接'],
    constraints: ['不要催促'],
    decisions: [],
    importantFacts: ['用户最近睡眠不好'],
    fileContext: [],
    openQuestions: [],
    pendingActions: ['继续聊睡眠安排']
  };
}

describe('generateStructuredSummary v3 prompt compatibility', () => {
  beforeEach((): void => {
    mockStorage.serviceModelsStorage.getConfig.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    mockStorage.providerStorage.getProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Mock Provider',
      apiKey: 'mock-key',
      baseUrl: 'https://mock.invalid',
      type: 'openai',
      isEnabled: true
    });
    mockElectron.aiInvoke.mockReset();
    mockElectron.aiInvoke.mockResolvedValue([null, { output: createModelSummary(), text: '' }]);
  });

  it('tells the model to preserve conversation continuity, raw requirements, and refreshed open loops', async (): Promise<void> => {
    await generateStructuredSummary({
      items: [
        {
          messageId: 'user-1',
          role: 'user',
          trimmedText: '请记住我的偏好：回答要温和直接，不要催促。下次继续聊我的睡眠安排。'
        }
      ],
      previousRecord: {
        recordText: '旧摘要',
        structuredSummary: createModelSummary(),
        generalSummary: {
          conversationContinuity: ['用户希望自然连续地聊天'],
          goal: '继续长期闲聊',
          recentTopic: '睡眠安排',
          userPreferences: ['温和直接'],
          constraints: ['不要催促'],
          decisions: [],
          criticalFacts: ['用户最近睡眠不好'],
          rawUserRequirements: ['不要直接给鸡汤'],
          openLoops: ['旧问题已经被回答时必须移除'],
          recentDirection: ['用户从工作压力转向睡眠问题'],
          fileContext: []
        }
      }
    });

    const options = mockElectron.aiInvoke.mock.calls[0]?.[1];
    const promptText = options?.messages.map((message) => message.content).join('\n') ?? '';

    expect(promptText).toContain('对话连续性');
    expect(promptText).toContain('用户原始需求');
    expect(promptText).toContain('未完成事项');
    expect(promptText).toContain('已经明确回答、取消或替代');
    expect(promptText).toContain('generalSummary');
  });

  it('keeps raw requirements in fallback summary when model config is unavailable', async (): Promise<void> => {
    mockStorage.serviceModelsStorage.getConfig.mockResolvedValue(null);
    const items: TrimmedMessageItem[] = [
      {
        messageId: 'user-1',
        role: 'user',
        trimmedText: '请记住我的偏好：回答要温和直接，不要催促。下次继续聊我的睡眠安排。'
      }
    ];

    const summary = await generateStructuredSummary({ items });

    expect(summary.importantFacts.join('\n')).toContain('回答要温和直接');
    expect(summary.pendingActions.join('\n')).toContain('继续');
  });
});
```

- [ ] **Step 2: Run the prompt tests and confirm the prompt case fails**

Run:

```bash
pnpm test test/components/BChat/compression-summary-v3-prompt.test.ts
```

Expected: FAIL because the current prompt does not mention all v3 compatibility requirements and does not include previous `generalSummary`.

- [ ] **Step 3: Upgrade the system prompt**

Modify `SUMMARY_SYSTEM_PROMPT` in `src/components/BChatSidebar/utils/compression/structuredSummaryGenerator.ts` so the notes include:

```ts
`7. 对通用长聊天必须保留对话连续性：用户偏好、语气边界、长期主线、最近转折和用户期待的互动方式
8. 用户原始需求、清单、编号、数字、路径、URL、排序规则和输出格式必须进入 importantFacts，且保留原文中的关键标识符
9. openQuestions 和 pendingActions 表示未完成事项；如果上一条摘要中的问题在新对话中已经明确回答、取消或替代，必须移除旧项，只保留仍需继续的事项`
```

Keep the JSON output shape unchanged in Phase 3.

- [ ] **Step 4: Include previous generalSummary in user prompt**

Modify `buildSummaryUserPrompt()`:

```ts
  const previousRecordText = input.previousRecord
    ? [
        input.previousRecord.recordText,
        JSON.stringify({
          structuredSummary: input.previousRecord.structuredSummary,
          generalSummary: input.previousRecord.generalSummary
        })
      ].join('\n')
    : '无';
```

- [ ] **Step 5: Run prompt tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-v3-prompt.test.ts
```

Expected: PASS.

---

### Task 5: Verification And Changelog

**Files:**
- Modify: `changelog/2026-06-05.md`

- [ ] **Step 1: Update changelog**

Add under `## Changed`:

```md
- 引入通用长聊天压缩摘要 v3 兼容视图，新压缩记录写入 `generalSummary` 并保留旧摘要字段。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/compression-summary-adapter.test.ts test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-segment-recall.test.ts test/components/BChat/compression-coordinator-v3.test.ts test/components/BChat/compression-summary-v3-prompt.test.ts test/components/BChat/compression-summary.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run focused lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/utils/compression/summaryAdapter.ts src/components/BChatSidebar/utils/compression/summaryRenderer.ts src/components/BChatSidebar/utils/compression/structuredSummaryGenerator.ts src/components/BChatSidebar/utils/compression/coordinator.ts src/components/BChatSidebar/utils/compression/constant.ts test/components/BChat/compression-summary-adapter.test.ts test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-coordinator-v3.test.ts test/components/BChat/compression-summary-v3-prompt.test.ts test/components/BChat/compression-summary.test.ts
```

Expected: no ESLint errors in touched files.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: either pass, or fail only on known pre-existing `Cannot find namespace 'Electron'` errors in `src/views/webview/web/...`. New errors in touched files must be fixed.

- [ ] **Step 5: Confirm no commit or staged changes**

Run:

```bash
git status --short
git diff --cached --name-only
```

Expected: changed files are visible, cached diff is empty. Do not commit.

---

## Self-Review Checklist

- v2 records remain readable through the adapter.
- Native v3 records render without falling back to v2 fields.
- New records include `schemaVersion: 3`, `generalSummary`, and retained `structuredSummary`.
- Raw user requirements stay separated in the normalized view.
- Open loops combine old `openQuestions` and `pendingActions`.
- Prompt changes improve v3 fidelity without changing the generator return type.
- Multi-segment records use the same coordinator write rule as single records.
- No tail budget, UI debug, storage migration, staging, or commit step is included.
