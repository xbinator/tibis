# AI SDK 7 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Tibis Electron main-process AI integration from AI SDK 6 to the latest stable AI SDK 7-compatible package set without changing existing chat, tool-loop, or streaming behavior.

**Architecture:** Keep the existing `AIService` boundary and provider registry intact. Upgrade the complete `ai` / `@ai-sdk/*` dependency family together, then adapt only the v7 API names used by this repository. Preserve internally generated compression system messages in their original sequence by opting trusted model-message arrays into `allowSystemInMessages`.

**Tech Stack:** TypeScript 5.9, Node.js 24, Electron, Vercel AI SDK 7, Vitest, pnpm 10

## Global Constraints

- AI SDK runtime requires Node.js `>=22`; the verified development runtime is Node.js 24.
- AI SDK packages are ESM-only; the repository must retain `"type": "module"` and ESM imports.
- Do not add `@ai-sdk/otel` because the repository does not register or consume OpenTelemetry spans.
- Do not use TypeScript `any`; all changed functions and types must retain meaningful comments.
- Keep model output, multi-step tool execution, and stream chunk semantics behavior-preserving.
- Add the required `changelog/2026-07-14.md` migration entry.
- Leave the final changes uncommitted unless the user separately asks for a Git commit.

---

### Task 1: Add AI SDK 7 wrapper regression coverage

**Files:**
- Modify: `test/electron/main/modules/ai/service.test.ts`

**Interfaces:**
- Consumes: exported `aiService.generateText()` and `aiService.streamText()` methods.
- Produces: regression coverage for v7 prompt options and the renamed stream result property.

- [ ] **Step 1: Mock only the external AI SDK call boundary.**

Use hoisted Vitest functions for `generateText`, `streamText`, and `isStepCount`, while retaining the real module's remaining exports with `importOriginal`.

```typescript
const aiSdkMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  isStepCount: vi.fn((count: number): { count: number } => ({ count })),
  streamText: vi.fn()
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();

  return {
    ...actual,
    generateText: aiSdkMocks.generateText,
    isStepCount: aiSdkMocks.isStepCount,
    streamText: aiSdkMocks.streamText
  };
});
```

- [ ] **Step 2: Add a failing prompt-option test.**

Call `aiService.generateText()` with an internally generated system-role model message and assert the SDK receives:

```typescript
expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
  expect.objectContaining({
    instructions: 'Follow the workspace rules.',
    allowSystemInMessages: true,
    messages
  })
);
expect(aiSdkMocks.generateText).not.toHaveBeenCalledWith(expect.objectContaining({ system: expect.anything() }));
```

- [ ] **Step 3: Add a failing stream-property test.**

Make the mocked `streamText()` return only the v7 `stream` property and assert `aiService.streamText()` returns that same iterable through `AIStreamResult.stream`.

- [ ] **Step 4: Verify the tests fail for the expected v6-wrapper reasons.**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/ai/service.test.ts
```

Expected: FAIL because the production wrapper still passes `system` and still reads `result.fullStream`.

### Task 2: Upgrade the AI SDK dependency family

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: npm `latest` tags for `ai` and every directly installed `@ai-sdk/*` runtime package.
- Produces: one lockfile-resolved, AI SDK 7-compatible dependency graph.

- [ ] **Step 1: Upgrade all directly installed AI SDK packages together.**

Run:

```bash
pnpm update ai@latest @ai-sdk/alibaba@latest @ai-sdk/anthropic@latest @ai-sdk/deepseek@latest @ai-sdk/gateway@latest @ai-sdk/google@latest @ai-sdk/openai@latest @ai-sdk/openai-compatible@latest @ai-sdk/provider@latest @ai-sdk/provider-utils@latest
```

Expected: `ai` resolves to major 7 and every provider/core utility resolves to its current compatible major.

- [ ] **Step 2: Verify package metadata and runtime assumptions.**

Run:

```bash
pnpm list ai @ai-sdk/alibaba @ai-sdk/anthropic @ai-sdk/deepseek @ai-sdk/gateway @ai-sdk/google @ai-sdk/openai @ai-sdk/openai-compatible @ai-sdk/provider @ai-sdk/provider-utils --depth 0
```

Expected: all ten packages appear once at the project root without peer dependency errors.

### Task 3: Migrate the AI service and Google provider

**Files:**
- Modify: `electron/main/modules/ai/service.mts`
- Modify: `electron/main/modules/ai/providers/google.mts`

**Interfaces:**
- Consumes: AI SDK 7 `isStepCount`, `instructions`, `StreamTextResult.stream`, and Google `createGoogle` APIs.
- Produces: the unchanged Tibis `AIInvokeResult` and `AIStreamResult` boundaries.

- [ ] **Step 1: Apply the v7 symbol and option renames.**

Update the core service imports and option construction to the equivalent v7 shape:

```typescript
import { generateText, isStepCount, jsonSchema, Output, streamText, tool } from 'ai';

return {
  model: this.createModel(createOptions, request.modelId),
  instructions: appendMcpToolInstructions(request.system, request.mcp),
  temperature: request.temperature,
  maxOutputTokens: request.maxOutputTokens,
  providerOptions: this.aiProvider.createProviderOptions(createOptions.providerType, request),
  tools: await toSdkTools(request.tools, request.tavily, request.mcp),
  ...(request.messages ? { allowSystemInMessages: true } : {}),
  ...(hasTavilyHttpTools(request.tavily) || hasMcpSdkTools(request.mcp) ? { stopWhen: isStepCount(5) } : {})
};
```

Return the full v7 event stream with:

```typescript
return [undefined, { stream: result.stream }];
```

- [ ] **Step 2: Rename the Google factory without changing configuration.**

```typescript
import { createGoogle } from '@ai-sdk/google';

const google = createGoogle({ apiKey, baseURL, name: providerName });
```

- [ ] **Step 3: Run TypeScript to expose package-specific breaking changes.**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS. If a migrated provider package reports a removed symbol or option, consult the official AI SDK 7 migration guide and change only the reported usage.

- [ ] **Step 4: Verify the wrapper regression tests turn green.**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/ai/service.test.ts
```

Expected: PASS.

### Task 4: Document and verify the migration

**Files:**
- Modify: `CONTEXT.md`
- Create or modify: `changelog/2026-07-14.md`

**Interfaces:**
- Consumes: the final dependency versions from `package.json`.
- Produces: repository-relative documentation of the AI SDK 7 runtime baseline.

- [ ] **Step 1: Update repository context and changelog.**

Change the AI SDK stack row in `CONTEXT.md` from v6 to v7 and record the dependency/API migration under `## Changed` in `changelog/2026-07-14.md`.

- [ ] **Step 2: Scan for unmigrated v6 API names.**

Run:

```bash
rg -n 'stepCountIs|\.fullStream|createGoogleGenerativeAI|experimental_' electron src test scripts
```

Expected: no production-code matches for AI SDK v6 migration symbols.

- [ ] **Step 3: Run focused tests, lint, typecheck, and build.**

Run:

```bash
pnpm exec vitest run test/electron/main/modules/ai/service.test.ts test/electron/main/modules/ai/helper/openai-compatible.test.ts test/electron/main/package-dependencies.test.ts test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/structured-summary-generator.test.ts
pnpm exec eslint electron/main/modules/ai test/electron/main/modules/ai/service.test.ts --ext .mts,.ts
pnpm exec tsc --noEmit
pnpm build
```

Expected: every command exits with status 0.

- [ ] **Step 4: Review the final diff.**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the planned dependency, AI integration, test, context, plan, and changelog files are modified.
