# BDrawing Milestone 3 Moveable Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Moveable so selected BDrawing elements can be dragged, resized, and rotated, with final geometry committed once to board history.

**Architecture:** Pure geometry transforms live in `boardTransforms.ts` and remain independent of Moveable. `DrawingMoveableLayer.vue` owns the third-party controller and translates Moveable end events into `DrawingGeometryChange[]`. `BDrawing/index.vue` coordinates selected DOM targets and commits geometry through `useDrawingBoard`.

**Tech Stack:** Vue 3, TypeScript strict mode, Vitest, SVG renderers, `moveable`, `vue3-moveable`, lodash-es.

---

### Task 1: Geometry Transform API

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `test/components/BDrawing/board-transforms.test.ts`

- [ ] **Step 1: Write failing transform tests**

Add tests for `moveDrawingElements`, `resizeDrawingElements`, and `rotateDrawingElements`. Verify single and multi-element changes commit one history entry, min size clamps to `16 x 16`, and rotation normalizes to `0 <= rotation < 360`.

- [ ] **Step 2: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: FAIL because the geometry APIs do not exist.

- [ ] **Step 3: Implement geometry types and transforms**

Add `DrawingGeometryChange`, `DRAWING_MIN_ELEMENT_SIZE`, `moveDrawingElements`, `resizeDrawingElements`, and `rotateDrawingElements`. Keep legacy `moveDrawingNode` backed by `moveDrawingElements`.

- [ ] **Step 4: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: PASS.

### Task 2: Moveable Dependency And Layer

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/components/BDrawing/components/DrawingMoveableLayer.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/hooks/useDrawingBoard.ts`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [ ] **Step 1: Install dependencies**

Run: `pnpm add moveable vue3-moveable`

- [ ] **Step 2: Inspect installed type/API surface**

Check package types in `node_modules/vue3-moveable` and use its actual component export shape.

- [ ] **Step 3: Write failing component tests with a mock Moveable**

Mock `vue3-moveable` as a test button/component that can emit `dragEnd`, `resizeEnd`, and `rotateEnd`. Verify selecting an element renders the controller and emitted events update geometry with one undoable state change.

- [ ] **Step 4: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: FAIL because the Moveable layer is not mounted.

- [ ] **Step 5: Implement Moveable layer**

Render `VueMoveable` when selection has targets. Resolve targets from `[data-drawing-element-id]`. Convert drag/resize/rotate end payloads into `DrawingGeometryChange[]` and emit `commit-geometry`.

- [ ] **Step 6: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: PASS.

### Task 3: Verification

**Files:**
- Modify: `changelog/2026-06-10.md`

- [ ] **Step 1: Add changelog entry**

Record Moveable integration and geometry transform support under `Added` or `Changed`.

- [ ] **Step 2: Run verification**

Run:

```bash
pnpm test test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-canvas.component.test.ts
pnpm exec eslint src/components/BDrawing test/components/BDrawing --ext .vue,.ts
pnpm exec stylelint 'src/components/BDrawing/**/*.{vue,less,css}'
pnpm exec tsc --noEmit
pnpm build
```

Expected: all commands exit 0. Build may print existing dynamic import warnings.
