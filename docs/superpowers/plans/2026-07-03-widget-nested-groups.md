# Widget Nested Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User requested current-branch development with no commits; do not create a worktree and do not run `git commit`.

**Goal:** Replace Widget `metadata.groupId` grouping with a recursive `WidgetElement.children` tree where `name: 'group'` is the real container element and child movement uses the direct parent coordinate system.

**Architecture:** Add a focused tree utility layer for recursive lookup, local/absolute coordinate conversion, flattening, and same-parent edits. Then move board transforms, rendering, runtime loop/layout, and widget page panels from flat `elements` assumptions to the tree utility layer. Existing element registration continues to use `name`; no `kind`, shape model, frame model, or old group migration is introduced.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Vitest, lodash-es, existing BWidget moveable/selecto/runtime utilities.

---

## File Structure

- Create `src/components/BWidget/utils/widgetTree.ts`: recursive tree queries, render flattening, parent-local coordinate conversion, same-parent edits, subtree copy helpers.
- Modify `src/components/BWidget/types.ts`: add `children?: WidgetElement[]`, keep `WidgetShapeElement` as compatibility alias during the refactor, and document `name: 'group'`.
- Modify `src/components/BWidget/utils/boardTransforms.ts`: normalize recursive elements and implement group-aware create, group, ungroup, move, resize, copy, paste, delete, and reorder.
- Modify `src/components/BWidget/hooks/useWidgetBoard.ts`: generate group elements, store subtree clipboard, and call new transform APIs.
- Modify `src/components/BWidget/utils/widgetGroups.ts`: replace `metadata.groupId` helpers with `name: 'group'` helpers or remove imports.
- Modify `src/components/BWidget/utils/widgetGeometry.ts`: compute bounds and find elements through render-tree flattening.
- Modify `src/components/BWidget/renderers/WidgetCanvas.vue`, `MoveableLayer.vue`, `Minimap.vue`, `WidgetNode.vue`, and `Runtime.vue`: render and interact with flattened render nodes while preserving local positions in persisted data.
- Modify `src/components/BWidget/utils/widgetRuntime/layout.ts` and `src/components/BWidget/utils/widgetLoop.ts`: runtime layout and loop expansion recurse through group children.
- Modify `src/views/widget/index.vue`, `SidebarLayer.vue`, `PanelSettings.vue`, `BatchSetter.vue`, and `utils/layerOrder.ts`: operate on tree entries and same-parent selections.
- Add/update tests in `test/components/BWidget/*` and `test/views/widget/*`.
- Update `changelog/2026-07-03.md` with the nested group refactor.

## Task 1: Tree Utility Foundation

**Files:**
- Create: `src/components/BWidget/utils/widgetTree.ts`
- Test: `test/components/BWidget/widget-tree.test.ts`

- [ ] **Step 1: Write failing tree utility tests**

Add tests covering recursive lookup, render flattening, local/absolute conversion, same-parent detection, replacement, removal, and sibling insertion.

```ts
import { describe, expect, it } from 'vitest';
import type { WidgetElement } from '@/components/BWidget/types';
import {
  findWidgetElementTreeNode,
  flattenWidgetElementTree,
  getWidgetElementAbsolutePosition,
  isWidgetGroupElement,
  removeWidgetElementFromTree,
  updateWidgetElementInTree
} from '@/components/BWidget/utils/widgetTree';

function createElement(id: string, x: number, y: number, children?: WidgetElement[]): WidgetElement {
  return {
    id,
    name: children ? 'group' : 'rect',
    label: children ? '组合' : '矩形',
    icon: children ? 'lucide:group' : 'lucide:square',
    title: id,
    position: { x, y },
    size: { width: 100, height: 80 },
    rotation: 0,
    style: {},
    metadata: {},
    ...(children ? { children } : {})
  };
}

describe('widgetTree', (): void => {
  it('flattens nested elements with absolute positions', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12)])];
    const flat = flattenWidgetElementTree(elements);
    expect(flat.map((item) => [item.element.id, item.parentId, item.absolutePosition])).toEqual([
      ['group-1', null, { x: 100, y: 80 }],
      ['child-1', 'group-1', { x: 116, y: 92 }]
    ]);
  });

  it('finds and updates nested elements without changing siblings', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12), createElement('child-2', 24, 20)])];
    const found = findWidgetElementTreeNode(elements, 'child-1');
    expect(found?.path).toEqual(['group-1', 'child-1']);
    const updated = updateWidgetElementInTree(elements, 'child-1', (element) => ({ ...element, title: '更新' }));
    expect(findWidgetElementTreeNode(updated, 'child-1')?.element.title).toBe('更新');
    expect(findWidgetElementTreeNode(updated, 'child-2')?.element.title).toBe('child-2');
  });

  it('removes nested elements from their direct parent', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('child-1', 16, 12), createElement('child-2', 24, 20)])];
    const result = removeWidgetElementFromTree(elements, 'child-1');
    expect(result.removed?.id).toBe('child-1');
    expect(findWidgetElementTreeNode(result.elements, 'child-1')).toBeNull();
    expect(findWidgetElementTreeNode(result.elements, 'child-2')).not.toBeNull();
  });

  it('detects group elements by name only', (): void => {
    expect(isWidgetGroupElement(createElement('group-1', 0, 0, []))).toBe(true);
    expect(isWidgetGroupElement(createElement('rect-1', 0, 0))).toBe(false);
  });

  it('calculates absolute position from a nested tree node', (): void => {
    const elements = [createElement('group-1', 100, 80, [createElement('group-2', 20, 10, [createElement('child-1', 5, 6)])])];
    expect(getWidgetElementAbsolutePosition(elements, 'child-1')).toEqual({ x: 125, y: 96 });
  });
});
```

- [ ] **Step 2: Run the failing tree utility tests**

Run: `pnpm test test/components/BWidget/widget-tree.test.ts`

Expected: FAIL because `src/components/BWidget/utils/widgetTree.ts` does not exist.

- [ ] **Step 3: Implement the minimal tree utility module**

Create `widgetTree.ts` with explicit JSDoc comments and no `any`.

```ts
/**
 * @file widgetTree.ts
 * @description BWidget 元素树查找、坐标转换与不可变更新工具。
 */
import type { WidgetElement, WidgetPoint } from '../types';
import { cloneDeep } from 'lodash-es';

export interface WidgetElementTreeNode {
  element: WidgetElement;
  parentId: string | null;
  siblings: WidgetElement[];
  index: number;
  path: string[];
}

export interface WidgetRenderTreeNode {
  element: WidgetElement;
  parentId: string | null;
  path: string[];
  depth: number;
  absolutePosition: WidgetPoint;
}

export interface WidgetTreeRemoveResult {
  elements: WidgetElement[];
  removed: WidgetElement | null;
}

export function isWidgetGroupElement(element: Pick<WidgetElement, 'name'>): boolean {
  return element.name === 'group';
}

export function readWidgetElementChildren(element: WidgetElement): WidgetElement[] {
  return isWidgetGroupElement(element) && Array.isArray(element.children) ? element.children : [];
}

export function flattenWidgetElementTree(
  elements: WidgetElement[],
  parentId: string | null = null,
  parentPosition: WidgetPoint = { x: 0, y: 0 },
  parentPath: string[] = [],
  depth = 0
): WidgetRenderTreeNode[] {
  return elements.flatMap((element: WidgetElement): WidgetRenderTreeNode[] => {
    const absolutePosition = {
      x: parentPosition.x + element.position.x,
      y: parentPosition.y + element.position.y
    };
    const path = [...parentPath, element.id];
    const current: WidgetRenderTreeNode = { element, parentId, path, depth, absolutePosition };
    return [current, ...flattenWidgetElementTree(readWidgetElementChildren(element), element.id, absolutePosition, path, depth + 1)];
  });
}

export function findWidgetElementTreeNode(elements: WidgetElement[], elementId: string): WidgetElementTreeNode | null {
  function walk(items: WidgetElement[], parentId: string | null, parentPath: string[]): WidgetElementTreeNode | null {
    for (let index = 0; index < items.length; index += 1) {
      const element = items[index];
      if (!element) continue;
      const path = [...parentPath, element.id];
      if (element.id === elementId) return { element, parentId, siblings: items, index, path };
      const found = walk(readWidgetElementChildren(element), element.id, path);
      if (found) return found;
    }
    return null;
  }

  return walk(elements, null, []);
}

export function updateWidgetElementInTree(elements: WidgetElement[], elementId: string, update: (element: WidgetElement) => WidgetElement): WidgetElement[] {
  return elements.map((element: WidgetElement): WidgetElement => {
    if (element.id === elementId) return update(cloneDeep(element));
    const children = readWidgetElementChildren(element);
    if (!children.length) return element;
    const nextChildren = updateWidgetElementInTree(children, elementId, update);
    return nextChildren === children ? element : { ...element, children: nextChildren };
  });
}

export function removeWidgetElementFromTree(elements: WidgetElement[], elementId: string): WidgetTreeRemoveResult {
  let removed: WidgetElement | null = null;
  function walk(items: WidgetElement[]): WidgetElement[] {
    const nextItems: WidgetElement[] = [];
    items.forEach((element: WidgetElement): void => {
      if (element.id === elementId) {
        removed = cloneDeep(element);
        return;
      }
      const children = readWidgetElementChildren(element);
      nextItems.push(children.length ? { ...element, children: walk(children) } : element);
    });
    return nextItems;
  }

  return { elements: walk(elements), removed };
}

export function getWidgetElementAbsolutePosition(elements: WidgetElement[], elementId: string): WidgetPoint | null {
  return flattenWidgetElementTree(elements).find((item: WidgetRenderTreeNode): boolean => item.element.id === elementId)?.absolutePosition ?? null;
}
```

- [ ] **Step 4: Run the tree utility tests**

Run: `pnpm test test/components/BWidget/widget-tree.test.ts`

Expected: PASS.

## Task 2: Recursive Type and Snapshot Normalization

**Files:**
- Modify: `src/components/BWidget/types.ts`
- Modify: `src/components/BWidget/utils/boardTransforms.ts`
- Modify: `src/components/BWidget/hooks/useModelSync.ts`
- Test: `test/components/BWidget/board-transforms.test.ts`
- Test: `test/components/BWidget/use-model-sync.test.ts`

- [ ] **Step 1: Write failing normalization tests**

Add tests that `createWidgetBoardState` keeps `name: 'group'` children recursively, removes `children` from non-group elements, and preserves selection only when nested IDs still exist.

```ts
it('normalizes group children recursively', (): void => {
  const state = createWidgetBoardState({
    elements: [
      {
        ...createShapeElement('group-1'),
        name: 'group',
        label: '组合',
        icon: 'lucide:group',
        children: [createShapeElement('child-1')]
      }
    ]
  });
  expect(state.elements[0]?.children?.[0]?.id).toBe('child-1');
});

it('removes children from non-group elements during normalization', (): void => {
  const state = createWidgetBoardState({
    elements: [{ ...createShapeElement('node-1'), children: [createShapeElement('child-1')] }]
  });
  expect(state.elements[0]?.children).toBeUndefined();
});
```

- [ ] **Step 2: Run focused normalization tests**

Run: `pnpm test test/components/BWidget/board-transforms.test.ts test/components/BWidget/use-model-sync.test.ts`

Expected: FAIL because current normalization only clones a flat element list.

- [ ] **Step 3: Update WidgetElement type**

In `types.ts`, add `children?: WidgetElement[]` to `WidgetShapeElement`, update comments to explain `name: 'group'`, and keep `export type WidgetElement = WidgetShapeElement` while the codebase still imports both names.

- [ ] **Step 4: Make snapshot normalization recursive**

In `boardTransforms.ts`, make `createSupportedElementSnapshot` accept children and only retain them when `name === 'group'`. Add a helper like:

```ts
function cloneSupportedElementTree(elements: WidgetBoardSnapshot['elements'] | undefined, options: WidgetElementSnapshotOptions = {}): WidgetShapeElement[] {
  return (elements ?? [])
    .map((element: WidgetElementSnapshotCandidate): WidgetShapeElement | null => createSupportedElementSnapshot(element, options))
    .filter((element: WidgetShapeElement | null): element is WidgetShapeElement => element !== null);
}
```

`createSupportedElementSnapshot` should set `children` only after recursively normalizing incoming children for group elements.

- [ ] **Step 5: Make model sync selection recurse**

In `useModelSync.ts`, replace the top-level ID set with `flattenWidgetElementTree(dataItem.elements)`.

```ts
const modelElementIds = new Set(flattenWidgetElementTree(dataItem.elements).map((item) => item.element.id));
```

- [ ] **Step 6: Run normalization tests**

Run: `pnpm test test/components/BWidget/board-transforms.test.ts test/components/BWidget/use-model-sync.test.ts`

Expected: PASS for updated normalization and model sync tests.

## Task 3: Board Tree Transforms

**Files:**
- Modify: `src/components/BWidget/utils/boardTransforms.ts`
- Modify: `src/components/BWidget/hooks/useWidgetBoard.ts`
- Modify: `src/components/BWidget/utils/widgetGroups.ts`
- Test: `test/components/BWidget/board-transforms.test.ts`
- Test: `test/components/BWidget/use-widget-board.test.ts`

- [ ] **Step 1: Write failing transform tests**

Cover group, ungroup, local child movement, group resizing, subtree copy/paste, recursive delete, and same-parent reorder.

```ts
it('groups same-parent elements into a real group with local child positions', (): void => {
  const state = createWidgetBoardState({
    elements: [createShapeElement('node-1'), { ...createShapeElement('node-2'), position: { x: 140, y: 100 } }],
    selection: ['node-1', 'node-2']
  });
  const next = groupWidgetSelection(state, 'group-1');
  expect(next.elements).toHaveLength(1);
  expect(next.elements[0]?.name).toBe('group');
  expect(next.elements[0]?.children?.map((element) => element.id)).toEqual(['node-1', 'node-2']);
  expect(next.elements[0]?.children?.[0]?.position).toEqual({ x: 0, y: 0 });
});

it('moves nested children in parent-local coordinates', (): void => {
  const state = createWidgetBoardState({
    elements: [{ ...createShapeElement('group-1'), name: 'group', children: [createShapeElement('child-1')] }]
  });
  const next = moveWidgetElements(state, [{ id: 'child-1', position: { x: 24, y: 30 } }]);
  expect(next.elements[0]?.children?.[0]?.position).toEqual({ x: 24, y: 30 });
});
```

- [ ] **Step 2: Run focused transform tests**

Run: `pnpm test test/components/BWidget/board-transforms.test.ts test/components/BWidget/use-widget-board.test.ts`

Expected: FAIL because current transforms assume a flat list and `metadata.groupId`.

- [ ] **Step 3: Replace group helpers**

Refactor `widgetGroups.ts` to expose `isWidgetGroupElement`, `getWidgetGroupChildren`, `hasWidgetGroupSelection`, or remove the module and use `widgetTree.ts`. No helper should read `metadata.groupId`.

- [ ] **Step 4: Implement tree-based transforms**

Update `boardTransforms.ts` so:

- `deleteWidgetSelection` removes selected nodes recursively.
- `copyWidgetSelection` returns full selected subtrees.
- `pasteWidgetElements` inserts into the active parent or top level and recursively regenerates IDs.
- `groupWidgetSelection` requires same parent, creates `name: 'group'`, converts selected child positions to local coordinates, and inserts the group into the same sibling list.
- `ungroupWidgetSelection` promotes children into the group parent and converts positions back to that parent coordinate system.
- `moveWidgetElements` and `resizeWidgetElements` update the target node in its parent-local coordinate system.
- `reorderWidgetSelection` only reorders selected siblings within one direct parent.

- [ ] **Step 5: Update useWidgetBoard clipboard and group creation**

Change clipboard type to `WidgetElement[]`. Generate `name: 'group'`, `label: '组合'`, `icon: 'lucide:group'`, empty style, and `children: []` for new groups.

- [ ] **Step 6: Run transform tests**

Run: `pnpm test test/components/BWidget/board-transforms.test.ts test/components/BWidget/use-widget-board.test.ts`

Expected: PASS.

## Task 4: Rendering, Geometry, Moveable, and Minimap

**Files:**
- Modify: `src/components/BWidget/utils/widgetGeometry.ts`
- Modify: `src/components/BWidget/renderers/WidgetCanvas.vue`
- Modify: `src/components/BWidget/renderers/WidgetNode.vue`
- Modify: `src/components/BWidget/components/MoveableLayer.vue`
- Modify: `src/components/BWidget/components/Minimap.vue`
- Test: `test/components/BWidget/widget-geometry.test.ts`
- Test: `test/components/BWidget/widget-canvas.component.test.ts`
- Test: `test/components/BWidget/moveable-layer.component.test.ts`

- [ ] **Step 1: Write failing render/geometry tests**

Add tests for absolute-position flattening, nested node rendering, and Moveable geometry changes using parent-local coordinates.

- [ ] **Step 2: Run render/geometry tests**

Run: `pnpm test test/components/BWidget/widget-geometry.test.ts test/components/BWidget/widget-canvas.component.test.ts test/components/BWidget/moveable-layer.component.test.ts`

Expected: FAIL on nested group cases.

- [ ] **Step 3: Update geometry utilities**

Use `flattenWidgetElementTree` for bounds, lookup, viewport fit, and node target lookup. Preserve `findWidgetShapeElement` as a recursive function during the refactor to minimize call-site churn.

- [ ] **Step 4: Render flattened nodes**

In `WidgetCanvas.vue`, compute render nodes from the tree and pass a node copy whose `position` is the absolute render position to `WidgetNode`. Preserve the source element ID so events still refer to the persisted node.

- [ ] **Step 5: Make Moveable convert absolute preview back to local commits**

Moveable may preview absolute geometry, but before emitting `WidgetGeometryChange`, convert each target position to direct-parent local coordinates using `widgetTree.ts`.

- [ ] **Step 6: Update Minimap bounds**

Use flattened render nodes and absolute positions for minimap bounds.

- [ ] **Step 7: Run render/geometry tests**

Run: `pnpm test test/components/BWidget/widget-geometry.test.ts test/components/BWidget/widget-canvas.component.test.ts test/components/BWidget/moveable-layer.component.test.ts`

Expected: PASS.

## Task 5: BWidget Selection and Context Menu Semantics

**Files:**
- Modify: `src/components/BWidget/index.vue`
- Modify: `src/components/BWidget/components/ContextMenu.vue` if labels or availability need adjustment
- Test: `test/components/BWidget/node-click-selection.test.ts`
- Test: `test/components/BWidget/widget-context-menu-actions.test.ts`
- Test: `test/components/BWidget/widget-context-menu.component.test.ts`

- [ ] **Step 1: Write failing interaction tests**

Add cases:

- Clicking a group selects only the group ID.
- Double clicking or explicit child activation can edit a nested child.
- Group delete removes children.
- Context menu group/ungroup uses real group nodes.
- Mixed-parent selections disable group and same-parent layer actions.

- [ ] **Step 2: Run interaction tests**

Run: `pnpm test test/components/BWidget/node-click-selection.test.ts test/components/BWidget/widget-context-menu-actions.test.ts test/components/BWidget/widget-context-menu.component.test.ts`

Expected: FAIL on nested group interaction cases.

- [ ] **Step 3: Replace selection expansion**

Remove `expandWidgetSelectionToGroups` behavior from selection clicks. Selection should remain the clicked node ID unless multi-selecting siblings.

- [ ] **Step 4: Track active nested child**

Keep the existing `activeElementId` idea, but resolve target elements through recursive lookup. Use it for group child editing from the canvas or layer tree.

- [ ] **Step 5: Update context menu availability**

Use tree helpers to decide:

- group allowed when selected IDs are same-parent and count is greater than one.
- ungroup allowed when any selected target has `name: 'group'`.
- layer actions allowed when all selected targets share the same parent.

- [ ] **Step 6: Run interaction tests**

Run: `pnpm test test/components/BWidget/node-click-selection.test.ts test/components/BWidget/widget-context-menu-actions.test.ts test/components/BWidget/widget-context-menu.component.test.ts`

Expected: PASS.

## Task 6: Runtime Layout and Loop Rendering

**Files:**
- Modify: `src/components/BWidget/Runtime.vue`
- Modify: `src/components/BWidget/utils/widgetRuntime/layout.ts`
- Modify: `src/components/BWidget/utils/widgetLoop.ts`
- Modify: `src/components/BWidget/hooks/useElementVariables.ts`
- Test: `test/components/BWidget/widget-runtime-layout.test.ts`
- Test: `test/components/BWidget/widget-runtime-view.component.test.ts`
- Test: `test/components/BWidget/use-element-variables.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Add nested group runtime layout tests and loop tests where `metadata.loop` on `name: 'group'` repeats the full subtree.

- [ ] **Step 2: Run runtime tests**

Run: `pnpm test test/components/BWidget/widget-runtime-layout.test.ts test/components/BWidget/widget-runtime-view.component.test.ts test/components/BWidget/use-element-variables.test.ts`

Expected: FAIL on group subtree runtime cases.

- [ ] **Step 3: Make runtime layout consume render tree nodes**

Update layout inputs so bounds use absolute positions from flattened render nodes, while group children remain local in persisted data.

- [ ] **Step 4: Update widget loop templates**

If loop config is on `name: 'group'`, copy the complete subtree. Remove all `groupId` collection logic.

- [ ] **Step 5: Update element variables**

When editing a child inside a group, read sibling/template variables from the group subtree, not from a flat `groupId` lookup.

- [ ] **Step 6: Run runtime tests**

Run: `pnpm test test/components/BWidget/widget-runtime-layout.test.ts test/components/BWidget/widget-runtime-view.component.test.ts test/components/BWidget/use-element-variables.test.ts`

Expected: PASS.

## Task 7: Widget Page Sidebar, Settings, and Layer Ordering

**Files:**
- Modify: `src/views/widget/index.vue`
- Modify: `src/views/widget/components/SidebarLayer.vue`
- Modify: `src/views/widget/components/PanelSidebar.vue`
- Modify: `src/views/widget/components/PanelSettings.vue`
- Modify: `src/views/widget/components/BatchSetter.vue`
- Modify: `src/views/widget/utils/layerOrder.ts`
- Test: `test/views/widget/index.test.ts`
- Test: `test/views/widget/panel-sidebar.test.ts`
- Test: `test/views/widget/panel-settings.test.ts`
- Test: `test/views/widget/sidebar-layer-selection.test.ts`
- Test: `test/views/widget/layer-order.test.ts`

- [ ] **Step 1: Write failing page tests**

Add tests for recursive layer display, group row selection, child row activation, same-parent batch operations, group copy/delete, and same-parent layer sort.

- [ ] **Step 2: Run widget page tests**

Run: `pnpm test test/views/widget/index.test.ts test/views/widget/panel-sidebar.test.ts test/views/widget/panel-settings.test.ts test/views/widget/sidebar-layer-selection.test.ts test/views/widget/layer-order.test.ts`

Expected: FAIL because page code still expects flat arrays and `groupId`.

- [ ] **Step 3: Rewrite SidebarLayer entries from tree data**

Render recursive entries directly from `elements` and `children`. Store entry path, parent ID, depth, and element.

- [ ] **Step 4: Update page handlers**

Use tree transform helpers for copy, delete, selection, multi-selection, layout changes, style changes, and layer movement.

- [ ] **Step 5: Update settings panel selection resolution**

Resolve selected elements recursively. Show group design/style controls for `name: 'group'`. Disable same-parent-only controls for mixed-parent selections.

- [ ] **Step 6: Run widget page tests**

Run: `pnpm test test/views/widget/index.test.ts test/views/widget/panel-sidebar.test.ts test/views/widget/panel-settings.test.ts test/views/widget/sidebar-layer-selection.test.ts test/views/widget/layer-order.test.ts`

Expected: PASS.

## Task 8: Full Test Sweep, Lint, Typecheck, and Changelog

**Files:**
- Modify: `changelog/2026-07-03.md`
- Review: all touched Widget files

- [ ] **Step 1: Update changelog**

Add a `Changed` entry:

```md
## Changed
- 重构 Widget 组合数据为递归元素树，支持 `name: 'group'` 真实容器与组内局部坐标编辑。
```

- [ ] **Step 2: Run all BWidget and Widget page tests**

Run: `pnpm test test/components/BWidget test/views/widget`

Expected: PASS.

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 4: Run ESLint**

Run: `pnpm lint`

Expected: exit code 0. If auto-fixes occur, inspect the diff before continuing.

- [ ] **Step 5: Run Stylelint**

Run: `pnpm lint:style`

Expected: exit code 0. If auto-fixes occur, inspect the diff before continuing.

- [ ] **Step 6: Inspect final diff without committing**

Run: `git status --short`

Expected: only planned Widget refactor files, tests, spec/plan docs, and changelog are modified. Do not commit; the user will commit manually.
