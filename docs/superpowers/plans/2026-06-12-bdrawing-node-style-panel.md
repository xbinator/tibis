# BDrawing Node Style Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-side style panel for the currently selected BDrawing shape node.

**Architecture:** The board state remains the source of truth. A new board transform updates `DrawingElementStyle` with history support, `useDrawingBoard` exposes that command, `DrawingStylePanel.vue` emits partial style patches, and `DrawingNode.vue` maps style fields to SVG attributes.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Vitest, Vue Test Utils, Less.

---

## File Structure

- Modify `src/components/BDrawing/types.ts`: add `DrawingElementStyleChange`.
- Modify `src/components/BDrawing/utils/boardTransforms.ts`: add `updateDrawingElementStyle`.
- Modify `src/components/BDrawing/hooks/useDrawingBoard.ts`: expose `updateElementStyle`.
- Create `src/components/BDrawing/components/DrawingStylePanel.vue`: left-side single-selection style editor.
- Modify `src/components/BDrawing/renderers/DrawingNode.vue`: render style attributes.
- Modify `src/components/BDrawing/index.vue`: compute selected shape and render panel.
- Modify `test/components/BDrawing/board-transforms.test.ts`: cover style transform.
- Modify `test/components/BDrawing/drawing-canvas.component.test.ts`: cover panel interaction.
- Modify `changelog/2026-06-12.md`: record the change.

### Task 1: Board Style Transform

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Test: `test/components/BDrawing/board-transforms.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that import `updateDrawingElementStyle`, update `fill/strokeWidth`, assert history increments, and assert unknown IDs set `lastError`.

- [ ] **Step 2: Run red test**

Run: `pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts`
Expected: FAIL because `updateDrawingElementStyle` is not exported.

- [ ] **Step 3: Implement transform**

Add a typed style patch, clone state elements, find a shape element, merge style, and return `withHistory`.

- [ ] **Step 4: Run green test**

Run: `pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts`
Expected: PASS.

### Task 2: Left Style Panel UI

**Files:**
- Modify: `src/components/BDrawing/hooks/useDrawingBoard.ts`
- Create: `src/components/BDrawing/components/DrawingStylePanel.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/renderers/DrawingNode.vue`
- Test: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [ ] **Step 1: Write failing component tests**

Add tests that select a node, find the left panel, update fill input, and assert the rendered node shape receives `fill="#f97316"`.

- [ ] **Step 2: Run red test**

Run: `pnpm exec vitest run test/components/BDrawing/drawing-canvas.component.test.ts`
Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement panel and render wiring**

Expose `updateElementStyle`, compute selected shape in `index.vue`, add `DrawingStylePanel`, and map SVG style attributes in `DrawingNode.vue`.

- [ ] **Step 4: Run green component test**

Run: `pnpm exec vitest run test/components/BDrawing/drawing-canvas.component.test.ts`
Expected: PASS.

### Task 3: Verification

**Files:**
- Modify: `changelog/2026-06-12.md`

- [ ] **Step 1: Add changelog entry**

Record the BDrawing left style panel under `## Added`.

- [ ] **Step 2: Run focused checks**

Run:
- `pnpm exec vitest run test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-canvas.component.test.ts`
- `pnpm exec eslint src/components/BDrawing test/components/BDrawing --ext .vue,.ts`
- `pnpm exec tsc --noEmit`

Expected: all checks pass.

