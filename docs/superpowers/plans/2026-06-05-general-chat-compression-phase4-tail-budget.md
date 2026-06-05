# General Chat Compression Phase 4 Tail Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit changes unless the user explicitly asks for a commit.

**Goal:** Replace the fixed “preserve recent 2 rounds” compression tail with a budget-aware tail policy that always keeps at least the latest two user turns and expands backward when the model context window allows it.

**Architecture:** Add a pure `tailPolicy` module that selects preserved tail message IDs from user/assistant messages. `useCompactContext` keeps its current compression boundary and send-path behavior, but delegates tail selection to the new module and receives the active model context window from `index.vue`.

**Tech Stack:** TypeScript strict mode, Vue Composition API, Vitest, existing BChatSidebar compression modules.

---

## Implementation Status

Implemented in the current working tree. The final implementation adds `tailPolicy`, injects the active model context window from `src/components/BChatSidebar/index.vue`, preserves at least the latest two user turns, expands backward by whole user-turn slices while budget allows, and keeps at least one earliest user turn compressible when the whole history would otherwise fit inside tail.

Verification recorded during implementation:

- `pnpm test test/components/BChat/compression-tail-policy.test.ts`
- Included again in the final focused compression test run on 2026-06-05.

---

## Scope

This plan implements Phase 4 only:

- Tail budget calculation: `25%` of context window, clamped to `2,000..8,000` tokens.
- Mandatory preservation: at least the latest two user turns and following assistant messages.
- Budget expansion: include older user/assistant messages backward while budget allows.
- Hook integration through optional `getContextWindow`.

This plan does not implement UI observability, storage migration, segment recall wiring, or model-specific tokenizer loading inside the compression hook.

## File Structure

- Create `src/components/BChatSidebar/utils/compression/tailPolicy.ts`
  - Owns tail budget constants and pure selection logic.
- Modify `src/components/BChatSidebar/hooks/useCompactContext.ts`
  - Remove fixed manual preserve-round constant.
  - Use `selectTailPreservedMessageIds()`.
  - Accept optional `getContextWindow`.
- Modify `src/components/BChatSidebar/index.vue`
  - Pass the active `contextWindow.value` into `useCompactContext`.
- Add `test/components/BChat/compression-tail-policy.test.ts`
  - Unit tests for budget clamping, mandatory two user turns, and budget expansion.
- Modify `changelog/2026-06-05.md`
  - Add a `Changed` entry after implementation.

---

### Task 1: Add Tail Policy Tests

**Files:**
- Create: `test/components/BChat/compression-tail-policy.test.ts`
- Create later: `src/components/BChatSidebar/utils/compression/tailPolicy.ts`

- [ ] **Step 1: Write failing tests**

Create `test/components/BChat/compression-tail-policy.test.ts`:

```ts
/**
 * @file compression-tail-policy.test.ts
 * @description BChatSidebar 压缩 tail 预算策略测试。
 */
import { describe, expect, it } from 'vitest';
import { computeTailTokenBudget, selectTailPreservedMessageIds } from '@/components/BChatSidebar/utils/compression/tailPolicy';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建 user/assistant 测试消息。
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
 * 创建多轮测试消息。
 * @param roundCount - 轮数
 * @param content - 每条消息内容
 * @returns 消息列表
 */
function createRounds(roundCount: number, content: string): Message[] {
  return Array.from({ length: roundCount }).flatMap((_, index) => {
    const round = index + 1;
    return [createMessage(`u${round}`, 'user', content), createMessage(`a${round}`, 'assistant', content)];
  });
}

describe('tailPolicy', () => {
  it('computes tail budget as 25 percent of context window clamped to 2000..8000 tokens', (): void => {
    expect(computeTailTokenBudget(4_096)).toBe(2_000);
    expect(computeTailTokenBudget(16_000)).toBe(4_000);
    expect(computeTailTokenBudget(128_000)).toBe(8_000);
    expect(computeTailTokenBudget(0)).toBe(2_000);
  });

  it('always preserves the latest two user turns even when they exceed the budget', (): void => {
    const hugeContent = '很长的最近上下文'.repeat(1_200);
    const olderContent = '旧上下文'.repeat(500);
    const messages = [
      ...createRounds(3, olderContent),
      createMessage('u4', 'user', hugeContent),
      createMessage('a4', 'assistant', hugeContent),
      createMessage('u5', 'user', hugeContent),
      createMessage('a5', 'assistant', hugeContent)
    ];

    const ids = selectTailPreservedMessageIds(messages, { contextWindow: 4_096 });

    expect([...ids]).toEqual(['u4', 'a4', 'u5', 'a5']);
  });

  it('expands backward while the tail budget allows older messages', (): void => {
    const content = '预算内上下文'.repeat(120);
    const messages = createRounds(5, content);

    const ids = selectTailPreservedMessageIds(messages, { contextWindow: 4_096 });

    expect([...ids]).toEqual(['u3', 'a3', 'u4', 'a4', 'u5', 'a5']);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm test test/components/BChat/compression-tail-policy.test.ts
```

Expected: FAIL because `tailPolicy.ts` does not exist.

---

### Task 2: Implement Tail Policy

**Files:**
- Create: `src/components/BChatSidebar/utils/compression/tailPolicy.ts`
- Test: `test/components/BChat/compression-tail-policy.test.ts`

- [ ] **Step 1: Add implementation**

Create `src/components/BChatSidebar/utils/compression/tailPolicy.ts`:

```ts
/**
 * @file tailPolicy.ts
 * @description 压缩 tail 原文保留策略，按上下文窗口预算选择最近消息。
 */
import type { Message } from '@/components/BChatSidebar/utils/types';

/** tail 预算占模型上下文窗口比例。 */
const TAIL_CONTEXT_WINDOW_RATIO = 0.25;
/** tail 预算下限。 */
const MIN_TAIL_BUDGET_TOKENS = 2_000;
/** tail 预算上限。 */
const MAX_TAIL_BUDGET_TOKENS = 8_000;
/** 至少保留最近用户轮数。 */
const MIN_RECENT_USER_TURNS = 2;

/**
 * tail 策略选项。
 */
export interface TailPolicyOptions {
  /** 当前模型上下文窗口 */
  contextWindow?: number;
  /** 至少保留的最近用户轮数 */
  minRecentUserTurns?: number;
}

/**
 * 计算 tail token 预算。
 * @param contextWindow - 当前模型上下文窗口
 * @returns tail token 预算
 */
export function computeTailTokenBudget(contextWindow?: number): number {
  if (!contextWindow || contextWindow <= 0) {
    return MIN_TAIL_BUDGET_TOKENS;
  }

  const proportionalBudget = Math.floor(contextWindow * TAIL_CONTEXT_WINDOW_RATIO);
  return Math.min(MAX_TAIL_BUDGET_TOKENS, Math.max(MIN_TAIL_BUDGET_TOKENS, proportionalBudget));
}

/**
 * 粗略估算单条消息 token 数。
 * @param message - 聊天消息
 * @returns 估算 token 数
 */
function estimateMessageTokens(message: Message): number {
  const partsText = message.parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool') return `${part.toolName} ${part.status}`;
      return part.type;
    })
    .join(' ');
  const text = [message.content, partsText].filter(Boolean).join(' ');
  return Math.ceil(text.length / 2);
}

/**
 * 找到 mandatory tail 起点：最近 N 个 user turn 中最早一个 user 消息。
 * @param modelMessages - user/assistant 消息列表
 * @param minRecentUserTurns - 至少保留的最近用户轮数
 * @returns mandatory tail 起点索引
 */
function findMandatoryTailStartIndex(modelMessages: Message[], minRecentUserTurns: number): number {
  let seenUserTurns = 0;

  for (let index = modelMessages.length - 1; index >= 0; index -= 1) {
    if (modelMessages[index].role === 'user') {
      seenUserTurns += 1;
      if (seenUserTurns >= minRecentUserTurns) {
        return index;
      }
    }
  }

  return 0;
}

/**
 * 选择压缩时需要保留为原文的 tail 消息 ID。
 * @param messages - 当前消息列表
 * @param options - tail 策略选项
 * @returns 需要保留原文的消息 ID 集合，插入顺序为时间顺序
 */
export function selectTailPreservedMessageIds(messages: Message[], options: TailPolicyOptions = {}): Set<string> {
  const modelMessages = messages.filter((item) => item.role === 'user' || item.role === 'assistant');
  if (!modelMessages.length) {
    return new Set<string>();
  }

  const minRecentUserTurns = options.minRecentUserTurns ?? MIN_RECENT_USER_TURNS;
  const budget = computeTailTokenBudget(options.contextWindow);
  const mandatoryStartIndex = findMandatoryTailStartIndex(modelMessages, minRecentUserTurns);
  const selectedIndexes = new Set<number>();
  let usedTokens = 0;

  for (let index = mandatoryStartIndex; index < modelMessages.length; index += 1) {
    selectedIndexes.add(index);
    usedTokens += estimateMessageTokens(modelMessages[index]);
  }

  for (let index = mandatoryStartIndex - 1; index >= 0; index -= 1) {
    const nextTokens = estimateMessageTokens(modelMessages[index]);
    if (usedTokens + nextTokens > budget) {
      break;
    }

    selectedIndexes.add(index);
    usedTokens += nextTokens;
  }

  return new Set([...selectedIndexes].sort((a, b) => a - b).map((index) => modelMessages[index].id));
}
```

- [ ] **Step 2: Run tail policy tests**

Run:

```bash
pnpm test test/components/BChat/compression-tail-policy.test.ts
```

Expected: PASS.

---

### Task 3: Wire Tail Policy Into Compact Hook

**Files:**
- Modify: `src/components/BChatSidebar/hooks/useCompactContext.ts`
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: Update hook dependency type**

Modify `UseCompactContextOptions` in `src/components/BChatSidebar/hooks/useCompactContext.ts`:

```ts
  /** 获取当前模型上下文窗口，用于 tail 预算 */
  getContextWindow?: () => number | undefined;
```

- [ ] **Step 2: Use tail policy in source-message snapshot**

Import:

```ts
import { selectTailPreservedMessageIds } from '../utils/compression/tailPolicy';
```

Remove `MANUAL_COMPRESSION_PRESERVED_ROUNDS`.

Change `createManualCompressionSourceMessages()`:

```ts
function createManualCompressionSourceMessages(sourceMessages: Message[], contextWindow?: number): Message[] {
  const preservedIds = selectTailPreservedMessageIds(sourceMessages, { contextWindow });
  if (!preservedIds.size) {
    return [...sourceMessages];
  }

  return sourceMessages.filter((item) => !preservedIds.has(item.id));
}
```

Destructure `getContextWindow` from options and call:

```ts
const compressionSourceMessages = createManualCompressionSourceMessages(messages.value, getContextWindow?.());
```

- [ ] **Step 3: Pass context window from `index.vue`**

In `src/components/BChatSidebar/index.vue`, add to `useCompactContext()` options:

```ts
  getContextWindow: () => contextWindow.value,
```

---

### Task 4: Verification And Changelog

**Files:**
- Modify: `changelog/2026-06-05.md`

- [ ] **Step 1: Update changelog**

Add under `## Changed`:

```md
- 将聊天上下文压缩 tail 原文保留升级为按模型上下文窗口预算扩展，同时至少保留最近两个用户轮次。
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test test/components/BChat/compression-tail-policy.test.ts test/components/BChat/compression-summary-adapter.test.ts test/components/BChat/compression-summary-renderer.test.ts test/components/BChat/compression-segment-recall.test.ts test/components/BChat/compression-coordinator-v3.test.ts test/components/BChat/compression-summary-v3-prompt.test.ts test/components/BChat/compression-summary.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run focused lint**

Run:

```bash
pnpm exec eslint src/components/BChatSidebar/utils/compression/tailPolicy.ts src/components/BChatSidebar/hooks/useCompactContext.ts src/components/BChatSidebar/index.vue test/components/BChat/compression-tail-policy.test.ts test/components/BChat/compression-segment-recall.test.ts
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

---

## Self-Review Checklist

- Compression tail policy preserves at least two recent user turns.
- Older tail messages are included only while budget allows.
- Send-path boundary recovery stays unchanged.
- Hook callers that do not provide `getContextWindow` still use a stable 2,000-token default.
- No commit or staging step is included.
