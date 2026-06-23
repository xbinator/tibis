# WebView Interaction Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance WebView DOM engine clickability detection with page-agent style interactive signals, hit testing, and nested interaction filtering.

**Architecture:** Keep the change inside `src/views/webview/web/automation/engine/runtime.ts`, because it owns page-injected DOM collection and action indexing. Add focused regression tests in `test/views/webview/web-use-webview.test.ts` to prove newly detected elements are indexed and blocked elements are ignored.

**Tech Stack:** TypeScript, Vitest, JSDOM, WebView automation page scripts.

---

### Task 1: Cover Expanded Interaction Signals

**Files:**
- Modify: `test/views/webview/web-use-webview.test.ts`
- Modify: `src/views/webview/web/automation/engine/runtime.ts`

- [ ] **Step 1: Write failing tests**

Add tests that verify:
- elements with interactive cursors such as `grab` are indexed as click targets.
- elements with ARIA roles such as `switch` are indexed as click targets.
- elements with inline interaction event attributes such as `onkeydown` are indexed as click targets.
- child elements inside `<a>` can become click targets when the hit target points to the child.

- [ ] **Step 2: Run focused test**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: at least one new test fails before runtime changes.

- [ ] **Step 3: Implement signal helpers**

Update `runtime.ts` to add:
- `INTERACTIVE_CURSORS`
- `NON_INTERACTIVE_CURSORS`
- expanded native interactive tags
- expanded ARIA roles
- common event listener and event attribute detection
- parent anchor child detection

- [ ] **Step 4: Run focused test**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: all WebView tests pass.

### Task 2: Cover Visibility And Nested Interaction Filtering

**Files:**
- Modify: `test/views/webview/web-use-webview.test.ts`
- Modify: `src/views/webview/web/automation/engine/runtime.ts`

- [ ] **Step 1: Write failing tests**

Add tests that verify:
- disabled or `aria-disabled` elements are not indexed.
- `aria-hidden`, hidden, inert, and zero-size elements are not indexed.
- nested child controls are indexed only when they represent a distinct interaction.

- [ ] **Step 2: Run focused test**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: at least one new test fails before runtime changes.

- [ ] **Step 3: Implement filtering helpers**

Update `runtime.ts` to add:
- stricter disabled and hidden checks.
- multi-point top hit test using center, top-left, and bottom-right points.
- `isElementDistinctInteraction` style filtering when a parent interactive element is already indexed.

- [ ] **Step 4: Run focused test**

Run:

```bash
pnpm test test/views/webview/web-use-webview.test.ts
```

Expected: all WebView tests pass.

### Task 3: Final Verification

**Files:**
- Modify: `changelog/2026-06-23.md`

- [ ] **Step 1: Update changelog**

Add a `Changed` entry describing the enhanced WebView DOM interaction detection.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx
pnpm test test/views/webview/web-use-webview.test.ts
pnpm test test/components/BChat/tool-result-summary.test.ts
pnpm exec tsc --noEmit
git diff --check
```

Expected: all commands exit 0.
