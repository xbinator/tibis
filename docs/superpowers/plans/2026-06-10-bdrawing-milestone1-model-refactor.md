# BDrawing Milestone 1 Model Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor BDrawing from `nodes` as the primary board model to `elements`, while preserving current process-node behavior and removing Plait Core usage from BDrawing.

**Architecture:** `DrawingBoardState` stores `elements`, `edges`, `selection`, `viewport`, and `history`. Legacy node commands stay as compatibility wrappers that create `DrawingShapeElement` records. Renderers receive `elements` and dispatch shape rendering through the existing `DrawingNode.vue` component until later milestones split shape renderers.

**Tech Stack:** Vue 3, TypeScript strict mode, Vitest, lodash-es.

---

### Task 1: Element Types And Transform Tests

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `test/components/BDrawing/board-transforms.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that `createDrawingBoardState` initializes `elements`, `addDrawingNode` creates a `shape` element with `rotation: 0`, and duplicate IDs are checked against `elements`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: FAIL because `DrawingBoardState` does not expose `elements` yet.

- [ ] **Step 3: Add element model types**

Define `DrawingElementKind`, `DrawingShapeType`, `DrawingElementStyle`, `DrawingElementBase`, `DrawingShapeElement`, `DrawingElement`, and update snapshots to use `elements`.

- [ ] **Step 4: Run test to verify types and tests compile**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: tests still fail until transforms are migrated.

### Task 2: Transform Migration

**Files:**
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `test/components/BDrawing/board-transforms.test.ts`

- [ ] **Step 1: Implement element-backed transforms**

Update snapshot cloning, initial state creation, add, move, delete, text update, undo, and redo to use `elements`.

- [ ] **Step 2: Preserve legacy command names**

Keep `addDrawingNode`, `moveDrawingNode`, and `updateDrawingNodeText` as compatibility APIs backed by `DrawingShapeElement`.

- [ ] **Step 3: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: PASS.

### Task 3: Vue Component Migration

**Files:**
- Modify: `src/components/BDrawing/hooks/useDrawingBoard.ts`
- Modify: `src/components/BDrawing/renderers/DrawingCanvas.vue`
- Modify: `src/components/BDrawing/renderers/DrawingNode.vue`
- Modify: `src/components/BDrawing/renderers/DrawingEdge.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [ ] **Step 1: Update hook state access**

Switch `useDrawingBoard` node index and commands from `state.value.nodes` to `state.value.elements`.

- [ ] **Step 2: Update render props**

Pass `elements` into `DrawingCanvas`, render each shape element through `DrawingNode.vue`, and update edge center lookup to use elements.

- [ ] **Step 3: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: PASS.

### Task 4: Plait Removal And Quality Gate

**Files:**
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `changelog/2026-06-10.md`

- [ ] **Step 1: Remove BDrawing Plait imports and adapters**

Delete `@plait/core` imports and `createPlaitChildrenSnapshot` conversion helpers from `boardTransforms.ts`.

- [ ] **Step 2: Remove package dependency**

Run: `pnpm remove @plait/core` if available; otherwise edit dependency files consistently.

- [ ] **Step 3: Add changelog entry**

Record the model migration under `Changed`.

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm test test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-canvas.component.test.ts
rg -n "@plait/core|createBoard" src/components/BDrawing package.json
pnpm exec tsc --noEmit
```

Expected: tests pass, search returns no BDrawing/package references, and TypeScript exits 0.
