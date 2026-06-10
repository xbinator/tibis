# BDrawing Infinite Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Integrate `vue3-infinite-viewer` as the BDrawing viewport shell so the drawing surface supports infinite panning and anchored zoom without moving element state into the viewer.

**Architecture:** Add a `DrawingInfiniteViewport.vue` adapter as the only direct dependency boundary for `vue3-infinite-viewer`. Keep `DrawingCanvas.vue` as the SVG renderer, keep `DrawingViewport` as `{ center, zoom }`, and route pointer projection, pan, and anchored zoom through `useDrawingViewport.ts`.

**Tech Stack:** Vue 3, TypeScript, Vitest, `vue3-infinite-viewer`, `vue3-moveable`, `selecto`, Less.

---

### Task 1: Dependency And Mock Boundary

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [x] **Step 1: Add `vue3-infinite-viewer`**

Run: `pnpm add vue3-infinite-viewer`

Expected: `package.json` and `pnpm-lock.yaml` include `vue3-infinite-viewer`.

- [x] **Step 2: Inspect installed exports**

Run: `node -e "import('vue3-infinite-viewer').then((m) => console.log(Object.keys(m)))"`

Expected: output identifies whether the package exposes `VueInfiniteViewer`, `default`, or both.

- [x] **Step 3: Add a test mock for the viewer**

Mock `vue3-infinite-viewer` in `drawing-canvas.component.test.ts` with a component that renders a stable wrapper and emits normalized pan/scroll events from buttons or native events.

Expected: existing tests still compile after the future adapter imports the package.

### Task 2: Infinite Viewport Adapter

**Files:**
- Create: `src/components/BDrawing/components/DrawingInfiniteViewport.vue`
- Modify: `src/components/BDrawing/index.vue`
- Test: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [x] **Step 1: Write failing mount test**

Add a test that mounts `BDrawing` and expects `[data-testid="drawing-infinite-viewer"]` and existing SVG content to render.

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: FAIL because the adapter does not exist yet.

- [x] **Step 2: Implement adapter**

Create `DrawingInfiniteViewport.vue` that wraps the package component, forwards slots, and exposes stable classes/test IDs.

Expected: mount test passes and existing BDrawing render remains unchanged.

### Task 3: Shared Viewport Projection And Pan

**Files:**
- Modify: `src/components/BDrawing/hooks/useDrawingViewport.ts`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/renderers/DrawingCanvas.vue`
- Test: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [x] **Step 1: Write failing pan test**

Add a test that uses the hand tool, drags the empty viewer, and verifies the SVG viewBox center changes while element transforms do not.

Expected: FAIL because the hand tool does not pan through InfiniteViewer yet.

- [x] **Step 2: Implement viewport pan helper**

Add a typed pan helper to `useDrawingViewport.ts` that converts pixel movement to board movement using current zoom.

Expected: hand drag pan test passes.

### Task 4: Wheel Zoom And Interaction Regression

**Files:**
- Modify: `src/components/BDrawing/components/DrawingInfiniteViewport.vue`
- Modify: `src/components/BDrawing/index.vue`
- Test: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [x] **Step 1: Preserve anchored zoom tests**

Run the existing anchored wheel zoom test after wrapping with InfiniteViewer.

Expected: PASS after the adapter forwards wheel events to BDrawing.

- [x] **Step 2: Add Selecto regression test**

Add or update a test proving select-mode empty drag still starts Selecto and does not pan.

Expected: PASS once pan is restricted to hand tool or normal wheel scrolling.

### Task 5: Verification

**Files:**
- Modify: `changelog/2026-06-10.md`

- [x] **Step 1: Add changelog entry**

Record InfiniteViewer infinite canvas support under `Changed`.

- [x] **Step 2: Run verification**

Run:

```bash
pnpm test test/components/BDrawing/drawing-canvas.component.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/components/BDrawing/index.vue src/components/BDrawing/hooks/useDrawingViewport.ts src/components/BDrawing/renderers/DrawingCanvas.vue src/components/BDrawing/components/DrawingInfiniteViewport.vue test/components/BDrawing/drawing-canvas.component.test.ts --ext .vue,.ts
pnpm exec stylelint src/components/BDrawing/index.vue src/components/BDrawing/renderers/DrawingCanvas.vue src/components/BDrawing/components/DrawingInfiniteViewport.vue
git diff --check
```

Expected: all commands pass.
