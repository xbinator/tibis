# Alibaba Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Alibaba Cloud DashScope as a first-class provider with `reasoning.enabled` mapped to Alibaba `enable_thinking`.

**Architecture:** Add an `AlibabaProvider` beside existing providers, register it in `AIProviderRegistry`, and extend shared type/storage/settings metadata to accept `alibaba`. Use `@ai-sdk/alibaba` so reasoning stream chunks and provider options are handled by the SDK's Alibaba implementation.

**Tech Stack:** TypeScript, Electron main process, AI SDK v6 providers, Vitest, pnpm.

---

### Task 1: Failing Tests

**Files:**
- Modify: `test/electron/main/modules/ai/service.test.ts`
- Modify: `test/shared/storage/providers/json.test.ts`
- Modify: `test/shared/storage/settings/index.test.ts`

- [ ] **Step 1: Add tests for Alibaba reasoning and metadata.**

Add tests that import `AlibabaProvider`, expect `reasoning.enabled` to map to `providerOptions.alibaba.enableThinking`, expect the default Alibaba provider to use `type: 'alibaba'`, and expect settings normalization to preserve `alibaba`.

- [ ] **Step 2: Run tests to verify RED.**

Run `pnpm exec vitest run test/electron/main/modules/ai/service.test.ts test/shared/storage/providers/json.test.ts test/shared/storage/settings/index.test.ts`.

Expected: tests fail because `AlibabaProvider` and the `alibaba` provider type are not implemented.

### Task 2: Provider Implementation

**Files:**
- Create: `electron/main/modules/ai/providers/alibaba.mts`
- Modify: `electron/main/modules/ai/providers/_index.mts`
- Modify: `types/ai.d.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install `@ai-sdk/alibaba`.**

Run `pnpm add @ai-sdk/alibaba`.

- [ ] **Step 2: Implement `AlibabaProvider`.**

Create a provider that calls `createAlibaba({ apiKey, baseURL })`, returns `alibaba.chatModel(modelId)`, maps explicit `reasoning.enabled` to `providerOptions.alibaba.enableThinking`, and follows the existing common error mapping pattern.

- [ ] **Step 3: Register the provider and type.**

Import and register `AlibabaProvider` in `AIProviderRegistry`, and extend `AIProviderType` with `alibaba`.

### Task 3: App Configuration

**Files:**
- Modify: `src/shared/storage/providers/defaults.ts`
- Modify: `src/shared/storage/providers/json.ts`
- Modify: `src/views/settings/constants.ts`
- Modify: `changelog/2026-06-21.md`

- [ ] **Step 1: Update provider metadata.**

Change the built-in Alibaba provider type from `openai` to `alibaba`, add `alibaba` to settings normalization, and add an Alibaba option to settings provider format labels.

- [ ] **Step 2: Record the change.**

Add a `Changed` changelog entry for Alibaba provider support and reasoning mapping.

### Task 4: Verification

**Files:**
- Read: changed files and test output.

- [ ] **Step 1: Run targeted tests.**

Run `pnpm exec vitest run test/electron/main/modules/ai/service.test.ts test/shared/storage/providers/json.test.ts test/shared/storage/settings/index.test.ts`.

- [ ] **Step 2: Run type checking.**

Run `pnpm exec tsc --noEmit`.

- [ ] **Step 3: Run lint if type checks pass.**

Run `pnpm lint`.
