# BDrawing Milestone 2 Shape Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rectangle, ellipse, diamond, and text creation tools to BDrawing with click-to-create defaults, drag-to-create custom sizes, preview rendering, and undoable transform commits.

**Architecture:** Tool selection remains in `BDrawing/index.vue`. Canvas pointer events create and update a transient `DrawingInteractionDraft` on board state; only pointer up commits a real `DrawingShapeElement` through `addDrawingShape`. Shape geometry normalization and default-size fallback live in `boardTransforms.ts`, keeping renderer components stateless.

**Tech Stack:** Vue 3, TypeScript strict mode, Vitest, SVG renderers, lodash-es.

---

### Task 1: Shape Creation Transform

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `test/components/BDrawing/board-transforms.test.ts`

- [ ] **Step 1: Write failing transform tests**

Add tests for `addDrawingShape` that verify custom drag size normalization, default-size fallback for tiny drag/click, shape text defaults, selection update, and one history entry.

- [ ] **Step 2: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: FAIL because `addDrawingShape` and shape creation options do not exist.

- [ ] **Step 3: Implement types and transform**

Add `DrawingAddShapeOptions`, `DrawingInteractionDraft`, and `addDrawingShape`. Normalize start/end points so persisted size is positive. If width or height is below the creation threshold, use `DRAWING_DEFAULT_NODE_SIZE` centered on the click/drag midpoint.

- [ ] **Step 4: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: PASS.

### Task 2: Canvas Pointer Flow And Preview

**Files:**
- Create: `src/components/BDrawing/renderers/DrawingCreatePreview.vue`
- Modify: `src/components/BDrawing/renderers/DrawingCanvas.vue`
- Modify: `src/components/BDrawing/renderers/DrawingNode.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/hooks/useDrawingBoard.ts`

- [ ] **Step 1: Add failing component tests**

Extend `drawing-canvas.component.test.ts` to cover rectangle click creation, drag creation of ellipse size, preview appearing during drag, and diamond keyboard shortcut.

- [ ] **Step 2: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: FAIL because tools and preview do not exist.

- [ ] **Step 3: Implement draft commands**

Expose `startCreateShapeDraft`, `updateDraftPoint`, `commitCreateShapeDraft`, and `clearDraft` from `useDrawingBoard` using immutable state updates for draft-only changes.

- [ ] **Step 4: Implement canvas pointer events**

Emit `canvas-pointerdown`, `canvas-pointermove`, and `canvas-pointerup` with board coordinates. Use the active shape tool to start/update/commit drafts.

- [ ] **Step 5: Implement preview renderer**

Render the current draft as a dashed SVG shape using theme variables and no hard-coded colors.

- [ ] **Step 6: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: PASS.

### Task 3: Toolbar And Keyboard Tools

**Files:**
- Modify: `src/components/BDrawing/components/DrawingToolbar.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [ ] **Step 1: Add toolbar buttons**

Add icon buttons for `rect`, `ellipse`, `diamond`, and `text`, each with active state and stable `data-testid` attributes.

- [ ] **Step 2: Add keyboard shortcuts**

Map `R`, `O`, `D`, and `T` to the matching tools while preserving existing `V`, `Esc`, `H`, `P`, delete, undo, and redo behavior.

- [ ] **Step 3: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: PASS.

### Task 4: Documentation And Verification

**Files:**
- Modify: `changelog/2026-06-10.md`

- [ ] **Step 1: Add changelog entry**

Record shape tool creation under `Added` or `Changed`.

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
