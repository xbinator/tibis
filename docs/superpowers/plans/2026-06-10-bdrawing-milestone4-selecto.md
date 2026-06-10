# BDrawing Milestone 4 Selecto Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Selecto so BDrawing can drag-select multiple elements, replace or extend the current selection, and keep selection-only changes out of history.

**Architecture:** `DrawingSelectoLayer.vue` owns the `selecto` instance and translates `selectEnd` events into element IDs from `data-drawing-element-id`. `BDrawing/index.vue` coordinates selection updates through `useDrawingBoard.setSelection`. Selection remains a transient board field and does not write to history.

**Tech Stack:** Vue 3, TypeScript strict mode, Vitest, SVG renderers, `selecto`, lodash-es.

---

### Task 1: Selecto Dependency And Adapter Tests

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [ ] **Step 1: Install dependency**

Run: `pnpm add selecto`

- [ ] **Step 2: Inspect package API**

Check `node_modules/selecto/package.json` and type declarations to confirm constructor and event names.

- [ ] **Step 3: Write failing component tests**

Mock `selecto` and verify `selectEnd` replaces selection, Shift `selectEnd` appends selection, and undo after selection change does not remove the selected element.

- [ ] **Step 4: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: FAIL because Selecto is not mounted.

### Task 2: Selecto Layer

**Files:**
- Create: `src/components/BDrawing/components/DrawingSelectoLayer.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/renderers/DrawingNode.vue`

- [ ] **Step 1: Implement Selecto layer**

Instantiate `new Selecto({ container, dragContainer, selectableTargets: ['.b-drawing-element'], hitRate: 0 })`. Enable only when `activeTool === 'select'`.

- [ ] **Step 2: Convert selected targets to IDs**

On `selectEnd`, read `data-drawing-element-id`, merge with current selection when `inputEvent.shiftKey` is true, otherwise replace selection.

- [ ] **Step 3: Add selectable class**

Add `.b-drawing-element` to each rendered shape group.

- [ ] **Step 4: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: PASS.

### Task 3: Verification

**Files:**
- Modify: `changelog/2026-06-10.md`

- [ ] **Step 1: Add changelog entry**

Record Selecto box selection under `Added`.

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
