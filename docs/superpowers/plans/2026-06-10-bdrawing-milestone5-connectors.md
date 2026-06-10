# BDrawing Milestone 5 Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add connector elements that link two shapes, render automatically between element centers, follow geometry changes, and are removed with connected shapes.

**Architecture:** New connector data lives in `DrawingElement` as `DrawingConnectorElement`. Pure transforms in `boardTransforms.ts` create connectors and remove connected connectors when deleting shapes. `DrawingConnector.vue` renders connector elements from current shape geometry. `BDrawing/index.vue` coordinates connector tool clicks by remembering the source shape in `draft` and committing on the target shape click.

**Tech Stack:** Vue 3, TypeScript strict mode, Vitest, SVG renderers, Moveable, Selecto.

---

### Task 1: Connector Element Transform

**Files:**
- Modify: `src/components/BDrawing/types.ts`
- Modify: `src/components/BDrawing/utils/boardTransforms.ts`
- Modify: `test/components/BDrawing/board-transforms.test.ts`

- [ ] **Step 1: Write failing transform tests**

Add tests for `addDrawingConnector`: creates a connector element between two shapes, rejects missing endpoints, deletes connectors when a connected shape is deleted, and undo restores both shape and connector.

- [ ] **Step 2: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: FAIL because connector element APIs do not exist.

- [ ] **Step 3: Implement connector types and transform**

Add `DrawingConnectorElement`, `DrawingConnectorAnchor`, `DrawingAddConnectorOptions`, and `addDrawingConnector`. Store source/target IDs and simple center anchors.

- [ ] **Step 4: Update delete behavior**

When selected IDs include a connector, remove it. When selected IDs include a shape, also remove connector elements whose source or target references that shape.

- [ ] **Step 5: Run transform tests**

Run: `pnpm test test/components/BDrawing/board-transforms.test.ts`

Expected: PASS.

### Task 2: Connector Renderer And Tool Interaction

**Files:**
- Create: `src/components/BDrawing/renderers/DrawingConnector.vue`
- Modify: `src/components/BDrawing/renderers/DrawingCanvas.vue`
- Modify: `src/components/BDrawing/components/DrawingToolbar.vue`
- Modify: `src/components/BDrawing/index.vue`
- Modify: `src/components/BDrawing/hooks/useDrawingBoard.ts`
- Modify: `test/components/BDrawing/drawing-canvas.component.test.ts`

- [ ] **Step 1: Write failing component tests**

Verify connector tool can click source shape then target shape to create one connector, connector follows target move, and deleting a shape removes its connector.

- [ ] **Step 2: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: FAIL because connector tool and renderer do not exist.

- [ ] **Step 3: Implement renderer**

Render connector elements before shapes. Compute path endpoints from source/target element centers. Use theme variables and the existing SVG marker.

- [ ] **Step 4: Implement connector tool state**

Add `connector` to `DrawingToolMode`. Use `draft: { kind: 'creating-connector'; sourceId }` after source click, then call `addDrawingConnector` after target click.

- [ ] **Step 5: Run component tests**

Run: `pnpm test test/components/BDrawing/drawing-canvas.component.test.ts`

Expected: PASS.

### Task 3: Basic Snapping And Verification

**Files:**
- Modify: `src/components/BDrawing/components/DrawingMoveableLayer.vue`
- Modify: `changelog/2026-06-10.md`

- [ ] **Step 1: Enable basic Moveable snapping**

Set `snappable`, `snapCenter`, `snapGap`, and `snapThreshold` on Moveable. This wires library-level alignment guides without adding custom snap state.

- [ ] **Step 2: Add changelog entry**

Record connector tool and basic Moveable snapping.

- [ ] **Step 3: Run verification**

Run:

```bash
pnpm test test/components/BDrawing/board-transforms.test.ts test/components/BDrawing/drawing-canvas.component.test.ts
pnpm exec eslint src/components/BDrawing test/components/BDrawing --ext .vue,.ts
pnpm exec stylelint 'src/components/BDrawing/**/*.{vue,less,css}'
pnpm exec tsc --noEmit
pnpm build
```

Expected: all commands exit 0. Build may print existing dynamic import warnings.
