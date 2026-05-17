# Table NodeView Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `BMarkdown` 富文本表格实现自定义 `Table NodeView`，支持分割线新增行列、整行整列删除入口，以及最外边框插入规则。

**Architecture:** 先把表格交互拆成两层纯逻辑模块：`tableControlsGeometry.ts` 负责命中与矩形计算，`tableControlsCommands.ts` 负责将命中目标映射为 TipTap 表格命令。随后新增 `TableView.vue` 作为 `Table` 的 Vue NodeView，把 hover、scroll、overlay 和命令调用收敛到表格宿主内部，最后在 `useExtensions.ts` 注册 NodeView 并把表格样式迁移到新的类名体系。

**Tech Stack:** Vue 3 Composition API, TipTap 3, `@tiptap/extension-table`, `@tiptap/vue-3` NodeView, TypeScript, Vitest, Vue Test Utils, jsdom

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/components/BMarkdown/extensions/tableControlsGeometry.ts` | 新建：表格分割线与行列区块命中、矩形归一化和按钮派生位置的纯函数 |
| `src/components/BMarkdown/extensions/tableControlsCommands.ts` | 新建：根据命中目标定位代表单元格、执行 `addRowBefore/After`、`addColumnBefore/After`、`deleteRow`、`deleteColumn` |
| `src/components/BMarkdown/components/TableView.vue` | 新建：`Table` NodeView 宿主，管理 `mousemove` / `mouseleave` / `scroll`、两套 overlay 与按钮点击 |
| `src/components/BMarkdown/hooks/useExtensions.ts` | 修改：为 `MarkdownTable` 注册 `VueNodeViewRenderer(TableView)` |
| `src/components/BMarkdown/components/PaneRichEditor.vue` | 修改：迁移旧 `.tableWrapper` 样式到 NodeView 类名，补齐按钮和高亮线样式 |
| `test/components/BMarkdown/tableControlsGeometry.test.ts` | 新建：纯函数测试，覆盖分割线、外边框、交叉点优先级、滚动与区块删除命中 |
| `test/components/BMarkdown/tableControlsCommands.test.ts` | 新建：命令测试，覆盖四向插入、内部单向插入、删除与 selection 落点 |
| `test/components/BMarkdown/tableNodeView.test.ts` | 新建：NodeView 组件交互测试，覆盖 hover、scroll、可编辑状态与按钮显隐 |
| `changelog/2026-05-12.md` | 修改：记录“表格 NodeView 增删控件”实现计划 |

## Scope Notes

- 不在本次计划中处理源码模式 Markdown 表格 hover 控件。
- 不在本次计划中实现合并单元格专属几何逻辑，默认普通矩形网格表格。
- 不新增额外全局 overlay 宿主；所有表格控件都收敛到 NodeView 内部。
- 内部分割线只支持“右侧新增列”和“下方新增行”，不支持双向插入。

---

### Task 1: 为表格几何命中编写失败测试

**Files:**
- Create: `test/components/BMarkdown/tableControlsGeometry.test.ts`

- [ ] **Step 1: 新建纯函数测试文件并写入分割线、外边框、交叉点与删除区块用例**

创建 `test/components/BMarkdown/tableControlsGeometry.test.ts`，写入以下完整内容：

```typescript
import { describe, expect, it } from 'vitest';
import {
  type DividerHit,
  type DOMRectLike,
  findHoveredDivider,
  findHoveredSegment,
  getAddButtonPosition,
  getRemoveButtonPosition
} from '@/components/BMarkdown/extensions/tableControlsGeometry';

/**
 * 创建矩形数据。
 * @param left - 左边界
 * @param top - 上边界
 * @param width - 宽度
 * @param height - 高度
 * @returns 纯数据矩形
 */
function createRect(left: number, top: number, width: number, height: number): DOMRectLike {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

const columnRects = [
  createRect(0, 0, 120, 120),
  createRect(120, 0, 120, 120),
  createRect(240, 0, 120, 120)
];

const rowRects = [
  createRect(0, 0, 360, 40),
  createRect(0, 40, 360, 40),
  createRect(0, 80, 360, 40)
];

describe('tableControlsGeometry', () => {
  it('hits the leading column divider only from the inside edge', () => {
    const hit = findHoveredDivider({
      clientX: 3,
      clientY: 20,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(hit).toEqual<DividerHit>({
      type: 'column',
      index: 0,
      edge: 'leading',
      lineRect: createRect(0, 0, 0, 120)
    });
  });

  it('hits an inner column divider and keeps right-side insertion semantics', () => {
    const hit = findHoveredDivider({
      clientX: 121,
      clientY: 30,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(hit?.type).toBe('column');
    expect(hit?.index).toBe(1);
    expect(hit?.edge).toBe('inner');
    expect(hit?.lineRect).toEqual(createRect(120, 0, 0, 120));
  });

  it('hits the trailing row divider for append-after behavior', () => {
    const hit = findHoveredDivider({
      clientX: 80,
      clientY: 119,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(hit).toEqual({
      type: 'row',
      index: 2,
      edge: 'trailing',
      lineRect: createRect(0, 120, 360, 0)
    });
  });

  it('prefers the closer divider at an intersection and prefers columns when distance ties', () => {
    const hit = findHoveredDivider({
      clientX: 120,
      clientY: 40,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(hit?.type).toBe('column');
    expect(hit?.index).toBe(1);
  });

  it('finds a column remove segment only when the pointer is outside divider thresholds', () => {
    const segment = findHoveredSegment({
      clientX: 180,
      clientY: 60,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(segment).toEqual({
      type: 'column',
      index: 1,
      segmentRect: createRect(120, 0, 120, 120)
    });
  });

  it('returns null for segment hover when the pointer is within a divider threshold', () => {
    const segment = findHoveredSegment({
      clientX: 120,
      clientY: 60,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(segment).toBeNull();
  });

  it('derives add button coordinates from divider geometry', () => {
    const position = getAddButtonPosition({
      type: 'column',
      index: 1,
      edge: 'inner',
      lineRect: createRect(120, 0, 0, 120)
    }, 18);

    expect(position.top).toBe(0);
    expect(position.left).toBe(111);
  });

  it('derives remove button coordinates from segment geometry', () => {
    const position = getRemoveButtonPosition({
      type: 'row',
      index: 1,
      segmentRect: createRect(0, 40, 360, 40)
    }, 18);

    expect(position.top).toBe(51);
    expect(position.left).toBe(171);
  });
});
```

- [ ] **Step 2: 运行纯函数测试，确认失败原因集中在目标模块尚未实现**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableControlsGeometry.test.ts
```

Expected: FAIL，报错应集中在 `Cannot find module '@/components/BMarkdown/extensions/tableControlsGeometry'` 或缺少导出符号。

- [ ] **Step 3: Commit**

```bash
git add test/components/BMarkdown/tableControlsGeometry.test.ts
git commit -m "test: cover table hover geometry"
```

---

### Task 2: 实现表格几何命中模块并让测试转绿

**Files:**
- Create: `src/components/BMarkdown/extensions/tableControlsGeometry.ts`
- Modify: `test/components/BMarkdown/tableControlsGeometry.test.ts`

- [ ] **Step 1: 新建几何模块并实现类型、分割线命中、区块命中和按钮位置派生**

创建 `src/components/BMarkdown/extensions/tableControlsGeometry.ts`，写入以下完整内容：

```typescript
/**
 * @file tableControlsGeometry.ts
 * @description 表格 NodeView 控件所需的几何命中与按钮位置派生逻辑。
 */

/**
 * 纯数据矩形结构，避免命中逻辑直接依赖实时 DOM 对象。
 */
export interface DOMRectLike {
  /** 顶部坐标 */
  top: number;
  /** 右侧坐标 */
  right: number;
  /** 底部坐标 */
  bottom: number;
  /** 左侧坐标 */
  left: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 分割线 hover 命中结果。
 */
export interface DividerHit {
  /** 分割线类型 */
  type: 'row' | 'column';
  /** 目标索引；内部分割线的列索引表示“分割线右侧列” */
  index: number;
  /** 分割线所处边界类型 */
  edge: 'leading' | 'inner' | 'trailing';
  /** 用于绘制高亮线的矩形 */
  lineRect: DOMRectLike;
}

/**
 * 删除目标区块命中结果。
 */
export interface SegmentHit {
  /** 区块类型 */
  type: 'row' | 'column';
  /** 命中的行或列索引 */
  index: number;
  /** 目标区块矩形 */
  segmentRect: DOMRectLike;
}

/**
 * 按钮定位结果。
 */
export interface ButtonPosition {
  /** 顶部坐标 */
  top: number;
  /** 左侧坐标 */
  left: number;
}

interface DividerInput {
  /** 鼠标横坐标 */
  clientX: number;
  /** 鼠标纵坐标 */
  clientY: number;
  /** 列矩形列表 */
  columnRects: DOMRectLike[];
  /** 行矩形列表 */
  rowRects: DOMRectLike[];
  /** 单侧命中阈值 */
  threshold: number;
}

type SegmentInput = DividerInput;

/**
 * 构造纯数据矩形。
 * @param left - 左坐标
 * @param top - 上坐标
 * @param width - 宽度
 * @param height - 高度
 * @returns 纯数据矩形
 */
function createRect(left: number, top: number, width: number, height: number): DOMRectLike {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

/**
 * 判断某个点是否落在矩形内部。
 * @param rect - 目标矩形
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 * @returns 命中时返回 true
 */
function isInsideRect(rect: DOMRectLike, clientX: number, clientY: number): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * 根据列矩形构建所有竖向分割线候选。
 * @param columnRects - 列矩形列表
 * @param rowRects - 行矩形列表
 * @returns 分割线候选
 */
function buildColumnDividers(columnRects: DOMRectLike[], rowRects: DOMRectLike[]): DividerHit[] {
  if (columnRects.length === 0 || rowRects.length === 0) {
    return [];
  }

  const top = rowRects[0].top;
  const bottom = rowRects[rowRects.length - 1].bottom;
  const hits: DividerHit[] = [
    {
      type: 'column',
      index: 0,
      edge: 'leading',
      lineRect: createRect(columnRects[0].left, top, 0, bottom - top)
    }
  ];

  for (let index = 1; index < columnRects.length; index += 1) {
    hits.push({
      type: 'column',
      index,
      edge: 'inner',
      lineRect: createRect(columnRects[index - 1].right, top, 0, bottom - top)
    });
  }

  hits.push({
    type: 'column',
    index: columnRects.length - 1,
    edge: 'trailing',
    lineRect: createRect(columnRects[columnRects.length - 1].right, top, 0, bottom - top)
  });

  return hits;
}

/**
 * 根据行矩形构建所有横向分割线候选。
 * @param columnRects - 列矩形列表
 * @param rowRects - 行矩形列表
 * @returns 分割线候选
 */
function buildRowDividers(columnRects: DOMRectLike[], rowRects: DOMRectLike[]): DividerHit[] {
  if (columnRects.length === 0 || rowRects.length === 0) {
    return [];
  }

  const left = columnRects[0].left;
  const right = columnRects[columnRects.length - 1].right;
  const hits: DividerHit[] = [
    {
      type: 'row',
      index: 0,
      edge: 'leading',
      lineRect: createRect(left, rowRects[0].top, right - left, 0)
    }
  ];

  for (let index = 1; index < rowRects.length; index += 1) {
    hits.push({
      type: 'row',
      index,
      edge: 'inner',
      lineRect: createRect(left, rowRects[index - 1].bottom, right - left, 0)
    });
  }

  hits.push({
    type: 'row',
    index: rowRects.length - 1,
    edge: 'trailing',
    lineRect: createRect(left, rowRects[rowRects.length - 1].bottom, right - left, 0)
  });

  return hits;
}

/**
 * 计算指针到分割线的距离。
 * @param hit - 分割线候选
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 * @returns 轴向距离
 */
function getDividerDistance(hit: DividerHit, clientX: number, clientY: number): number {
  return hit.type === 'column'
    ? Math.abs(clientX - hit.lineRect.left)
    : Math.abs(clientY - hit.lineRect.top);
}

/**
 * 判断鼠标是否命中分割线阈值带。
 * @param hit - 分割线候选
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 * @param threshold - 单侧阈值
 * @returns 命中时返回 true
 */
function matchesDivider(hit: DividerHit, clientX: number, clientY: number, threshold: number): boolean {
  if (hit.type === 'column') {
    const withinVerticalRange = clientY >= hit.lineRect.top && clientY <= hit.lineRect.bottom;
    if (!withinVerticalRange) {
      return false;
    }

    if (hit.edge === 'leading') {
      return clientX >= hit.lineRect.left && clientX <= hit.lineRect.left + threshold;
    }

    if (hit.edge === 'trailing') {
      return clientX <= hit.lineRect.left && clientX >= hit.lineRect.left - threshold;
    }

    return clientX >= hit.lineRect.left - threshold && clientX <= hit.lineRect.left + threshold;
  }

  const withinHorizontalRange = clientX >= hit.lineRect.left && clientX <= hit.lineRect.right;
  if (!withinHorizontalRange) {
    return false;
  }

  if (hit.edge === 'leading') {
    return clientY >= hit.lineRect.top && clientY <= hit.lineRect.top + threshold;
  }

  if (hit.edge === 'trailing') {
    return clientY <= hit.lineRect.top && clientY >= hit.lineRect.top - threshold;
  }

  return clientY >= hit.lineRect.top - threshold && clientY <= hit.lineRect.top + threshold;
}

/**
 * 查找当前命中的分割线。
 * @param input - 分割线命中输入
 * @returns 命中的分割线；不存在时返回 null
 */
export function findHoveredDivider(input: DividerInput): DividerHit | null {
  const candidates = [
    ...buildColumnDividers(input.columnRects, input.rowRects),
    ...buildRowDividers(input.columnRects, input.rowRects)
  ].filter((hit) => matchesDivider(hit, input.clientX, input.clientY, input.threshold));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const distanceDiff = getDividerDistance(left, input.clientX, input.clientY) - getDividerDistance(right, input.clientX, input.clientY);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    if (left.type === right.type) {
      return 0;
    }
    return left.type === 'column' ? -1 : 1;
  });

  return candidates[0] ?? null;
}

/**
 * 查找当前命中的删除区块。
 * @param input - 区块命中输入
 * @returns 命中的区块；不存在时返回 null
 */
export function findHoveredSegment(input: SegmentInput): SegmentHit | null {
  if (findHoveredDivider(input)) {
    return null;
  }

  const rowHit = input.rowRects.findIndex((rect) => isInsideRect(rect, input.clientX, input.clientY));
  if (rowHit !== -1) {
    const rowRect = input.rowRects[rowHit];
    const rowCenterDistance = Math.abs(input.clientY - (rowRect.top + rowRect.height / 2));
    if (rowCenterDistance <= rowRect.height / 2) {
      return {
        type: 'row',
        index: rowHit,
        segmentRect: rowRect
      };
    }
  }

  const columnHit = input.columnRects.findIndex((rect) => isInsideRect(rect, input.clientX, input.clientY));
  if (columnHit !== -1) {
    return {
      type: 'column',
      index: columnHit,
      segmentRect: input.columnRects[columnHit]
    };
  }

  return null;
}

/**
 * 根据分割线派生新增按钮位置。
 * @param hit - 分割线命中结果
 * @param buttonSize - 按钮尺寸
 * @returns 按钮左上角坐标
 */
export function getAddButtonPosition(hit: DividerHit, buttonSize: number): ButtonPosition {
  if (hit.type === 'column') {
    return {
      top: hit.lineRect.top,
      left: hit.lineRect.left - buttonSize / 2
    };
  }

  return {
    top: hit.lineRect.top - buttonSize / 2,
    left: hit.lineRect.left + hit.lineRect.width / 2 - buttonSize / 2
  };
}

/**
 * 根据区块派生删除按钮位置。
 * @param hit - 区块命中结果
 * @param buttonSize - 按钮尺寸
 * @returns 按钮左上角坐标
 */
export function getRemoveButtonPosition(hit: SegmentHit, buttonSize: number): ButtonPosition {
  return {
    top: hit.segmentRect.top + hit.segmentRect.height / 2 - buttonSize / 2,
    left: hit.segmentRect.left + hit.segmentRect.width / 2 - buttonSize / 2
  };
}
```

- [ ] **Step 2: 运行纯函数测试，确认通过**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableControlsGeometry.test.ts
```

Expected: PASS，8 个用例全部通过。

- [ ] **Step 3: Commit**

```bash
git add src/components/BMarkdown/extensions/tableControlsGeometry.ts test/components/BMarkdown/tableControlsGeometry.test.ts
git commit -m "feat: add table hover geometry helpers"
```

---

### Task 3: 为表格命令映射编写失败测试并实现命令模块

**Files:**
- Create: `test/components/BMarkdown/tableControlsCommands.test.ts`
- Create: `src/components/BMarkdown/extensions/tableControlsCommands.ts`

- [ ] **Step 1: 新建命令测试文件，覆盖四向插入、内部单向插入与删除**

创建 `test/components/BMarkdown/tableControlsCommands.test.ts`，写入以下完整内容：

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { DividerHit, SegmentHit } from '@/components/BMarkdown/extensions/tableControlsGeometry';
import {
  applyAddAction,
  applyRemoveAction,
  type TableCommandContext
} from '@/components/BMarkdown/extensions/tableControlsCommands';

interface CommandRecorder {
  focus: ReturnType<typeof vi.fn>;
  addColumnBefore: ReturnType<typeof vi.fn>;
  addColumnAfter: ReturnType<typeof vi.fn>;
  addRowBefore: ReturnType<typeof vi.fn>;
  addRowAfter: ReturnType<typeof vi.fn>;
  deleteColumn: ReturnType<typeof vi.fn>;
  deleteRow: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

/**
 * 创建可链式调用的命令记录器。
 * @returns 记录器对象
 */
function createRecorder(): CommandRecorder {
  const recorder = {
    focus: vi.fn(),
    addColumnBefore: vi.fn(),
    addColumnAfter: vi.fn(),
    addRowBefore: vi.fn(),
    addRowAfter: vi.fn(),
    deleteColumn: vi.fn(),
    deleteRow: vi.fn(),
    run: vi.fn()
  };

  recorder.focus.mockReturnValue(recorder);
  recorder.addColumnBefore.mockReturnValue(recorder);
  recorder.addColumnAfter.mockReturnValue(recorder);
  recorder.addRowBefore.mockReturnValue(recorder);
  recorder.addRowAfter.mockReturnValue(recorder);
  recorder.deleteColumn.mockReturnValue(recorder);
  recorder.deleteRow.mockReturnValue(recorder);
  recorder.run.mockReturnValue(true);

  return recorder;
}

/**
 * 创建最小编辑器上下文。
 * @param recorder - 命令记录器
 * @returns 测试上下文
 */
function createContext(recorder: CommandRecorder): TableCommandContext {
  return {
    editor: {
      chain: () => recorder
    } as unknown as Editor,
    focusCellAt: vi.fn(() => true),
    getDimensions: () => ({ rowCount: 3, columnCount: 3 })
  };
}

describe('tableControlsCommands', () => {
  it('uses addColumnBefore for the leading outer border', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'column',
      index: 0,
      edge: 'leading',
      lineRect: { top: 0, right: 0, bottom: 120, left: 0, width: 0, height: 120 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(recorder.addColumnBefore).toHaveBeenCalledTimes(1);
    expect(recorder.addColumnAfter).not.toHaveBeenCalled();
  });

  it('uses addColumnAfter for inner dividers and targets the left column', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'column',
      index: 1,
      edge: 'inner',
      lineRect: { top: 0, right: 120, bottom: 120, left: 120, width: 0, height: 120 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(recorder.addColumnAfter).toHaveBeenCalledTimes(1);
  });

  it('uses addRowBefore for the leading outer border', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'row',
      index: 0,
      edge: 'leading',
      lineRect: { top: 0, right: 360, bottom: 0, left: 0, width: 360, height: 0 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(recorder.addRowBefore).toHaveBeenCalledTimes(1);
  });

  it('uses addRowAfter for inner dividers and trailing append', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'row',
      index: 2,
      edge: 'trailing',
      lineRect: { top: 120, right: 360, bottom: 120, left: 0, width: 360, height: 0 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 2, column: 0 });
    expect(recorder.addRowAfter).toHaveBeenCalledTimes(1);
  });

  it('deletes a hovered column and keeps selection in the targeted column', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyRemoveAction(context, {
      type: 'column',
      index: 1,
      segmentRect: { top: 0, right: 240, bottom: 120, left: 120, width: 120, height: 120 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 1 });
    expect(recorder.deleteColumn).toHaveBeenCalledTimes(1);
  });

  it('skips remove actions when the table has only one row or one column left', () => {
    const recorder = createRecorder();
    const context = {
      ...createContext(recorder),
      getDimensions: () => ({ rowCount: 1, columnCount: 1 })
    };

    const columnResult = applyRemoveAction(context, {
      type: 'column',
      index: 0,
      segmentRect: { top: 0, right: 120, bottom: 120, left: 0, width: 120, height: 120 }
    } satisfies SegmentHit);

    const rowResult = applyRemoveAction(context, {
      type: 'row',
      index: 0,
      segmentRect: { top: 0, right: 120, bottom: 40, left: 0, width: 120, height: 40 }
    } satisfies SegmentHit);

    expect(columnResult).toBe(false);
    expect(rowResult).toBe(false);
    expect(recorder.deleteColumn).not.toHaveBeenCalled();
    expect(recorder.deleteRow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行命令测试，确认失败集中在目标模块缺失**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableControlsCommands.test.ts
```

Expected: FAIL，报错应集中在 `Cannot find module '@/components/BMarkdown/extensions/tableControlsCommands'`。

- [ ] **Step 3: 新建命令模块并实现表格增删命令映射**

创建 `src/components/BMarkdown/extensions/tableControlsCommands.ts`，写入以下完整内容：

```typescript
/**
 * @file tableControlsCommands.ts
 * @description 表格 NodeView 控件触发的 TipTap 表格命令映射。
 */

import type { Editor } from '@tiptap/core';
import type { DividerHit, SegmentHit } from './tableControlsGeometry';

/**
 * 表格维度信息。
 */
interface TableDimensions {
  /** 行数 */
  rowCount: number;
  /** 列数 */
  columnCount: number;
}

/**
 * 定位单元格所需的行列索引。
 */
interface TableCellPosition {
  /** 目标行索引 */
  row: number;
  /** 目标列索引 */
  column: number;
}

/**
 * 表格命令执行上下文。
 */
export interface TableCommandContext {
  /** TipTap 编辑器实例 */
  editor: Editor;
  /** 将 selection 聚焦到目标单元格 */
  focusCellAt: (position: TableCellPosition) => boolean;
  /** 读取当前表格维度 */
  getDimensions: () => TableDimensions;
}

/**
 * 计算新增行为的代表单元格。
 * @param hit - 当前命中的分割线
 * @returns 代表单元格位置
 */
function getAddFocusCell(hit: DividerHit): TableCellPosition {
  if (hit.type === 'column') {
    if (hit.edge === 'leading') {
      return { row: 0, column: 0 };
    }

    return { row: 0, column: Math.max(0, hit.index - (hit.edge === 'inner' ? 1 : 0)) };
  }

  if (hit.edge === 'leading') {
    return { row: 0, column: 0 };
  }

  return { row: Math.max(0, hit.index), column: 0 };
}

/**
 * 应用新增动作。
 * @param context - 表格命令上下文
 * @param hit - 当前命中的分割线
 * @returns 命令是否成功执行
 */
export function applyAddAction(context: TableCommandContext, hit: DividerHit): boolean {
  const focusCell = getAddFocusCell(hit);
  if (!context.focusCellAt(focusCell)) {
    return false;
  }

  const chain = context.editor.chain().focus();

  if (hit.type === 'column') {
    if (hit.edge === 'leading') {
      return chain.addColumnBefore().run();
    }

    return chain.addColumnAfter().run();
  }

  if (hit.edge === 'leading') {
    return chain.addRowBefore().run();
  }

  return chain.addRowAfter().run();
}

/**
 * 应用删除动作。
 * @param context - 表格命令上下文
 * @param hit - 当前命中的区块
 * @returns 命令是否成功执行
 */
export function applyRemoveAction(context: TableCommandContext, hit: SegmentHit): boolean {
  const dimensions = context.getDimensions();

  if (hit.type === 'column' && dimensions.columnCount <= 1) {
    return false;
  }

  if (hit.type === 'row' && dimensions.rowCount <= 1) {
    return false;
  }

  const focusCell = hit.type === 'column'
    ? { row: 0, column: hit.index }
    : { row: hit.index, column: 0 };

  if (!context.focusCellAt(focusCell)) {
    return false;
  }

  const chain = context.editor.chain().focus();
  return hit.type === 'column'
    ? chain.deleteColumn().run()
    : chain.deleteRow().run();
}
```

- [ ] **Step 4: 运行命令测试，确认通过**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableControlsCommands.test.ts
```

Expected: PASS，6 个用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/BMarkdown/extensions/tableControlsCommands.ts test/components/BMarkdown/tableControlsCommands.test.ts
git commit -m "feat: add table control command mapping"
```

---

### Task 4: 为 Table NodeView 编写失败测试

**Files:**
- Create: `test/components/BMarkdown/tableNodeView.test.ts`

- [ ] **Step 1: 新建 NodeView 交互测试，覆盖 hover、scroll 与 editable 边界**

创建 `test/components/BMarkdown/tableNodeView.test.ts`，写入以下完整内容：

```typescript
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TableView from '@/components/BMarkdown/components/TableView.vue';

const chainRecorder = {
  focus: vi.fn(),
  addColumnBefore: vi.fn(),
  addColumnAfter: vi.fn(),
  addRowBefore: vi.fn(),
  addRowAfter: vi.fn(),
  deleteColumn: vi.fn(),
  deleteRow: vi.fn(),
  run: vi.fn()
};

chainRecorder.focus.mockReturnValue(chainRecorder);
chainRecorder.addColumnBefore.mockReturnValue(chainRecorder);
chainRecorder.addColumnAfter.mockReturnValue(chainRecorder);
chainRecorder.addRowBefore.mockReturnValue(chainRecorder);
chainRecorder.addRowAfter.mockReturnValue(chainRecorder);
chainRecorder.deleteColumn.mockReturnValue(chainRecorder);
chainRecorder.deleteRow.mockReturnValue(chainRecorder);
chainRecorder.run.mockReturnValue(true);

/**
 * 构造最小 NodeView props。
 * @param editable - 是否可编辑
 * @returns NodeView props
 */
function createNodeViewProps(editable = true) {
  return {
    editor: {
      isEditable: editable,
      chain: () => chainRecorder
    },
    extension: {},
    getPos: () => 0,
    deleteNode: vi.fn(),
    updateAttributes: vi.fn(),
    node: {
      attrs: {},
      type: { name: 'table' }
    },
    decorations: [],
    selected: false
  };
}

describe('TableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows add controls when hovering a divider', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 0, configurable: true });

    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(true);
    expect(wrapper.find('.b-table-node-view__line-highlight').exists()).toBe(true);
  });

  it('shows remove controls when hovering a row segment away from dividers', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 180, clientY: 60 });

    expect(wrapper.find('.b-table-node-view__remove-button').exists()).toBe(true);
  });

  it('hides controls after mouseleave', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });
    await scroller.trigger('mouseleave');

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(false);
    expect(wrapper.find('.b-table-node-view__remove-button').exists()).toBe(false);
  });

  it('does not show controls when the editor is not editable', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps(false)
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    await scroller.trigger('mousemove', { clientX: 121, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(false);
    expect(wrapper.find('.b-table-node-view__remove-button').exists()).toBe(false);
  });

  it('recomputes hover state after horizontal scrolling', async () => {
    const wrapper = mount(TableView, {
      props: createNodeViewProps()
    });

    const scroller = wrapper.get('.b-table-node-view__scroller');
    Object.defineProperty(scroller.element, 'scrollLeft', { value: 120, configurable: true });

    await scroller.trigger('scroll');
    await scroller.trigger('mousemove', { clientX: 241, clientY: 20 });

    expect(wrapper.find('.b-table-node-view__add-button').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行 NodeView 测试，确认失败集中在组件缺失**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableNodeView.test.ts
```

Expected: FAIL，报错应集中在 `Cannot find module '@/components/BMarkdown/components/TableView.vue'`。

- [ ] **Step 3: Commit**

```bash
git add test/components/BMarkdown/tableNodeView.test.ts
git commit -m "test: cover table node view controls"
```

---

### Task 5: 实现 Table NodeView 并注册到 MarkdownTable

**Files:**
- Create: `src/components/BMarkdown/components/TableView.vue`
- Modify: `src/components/BMarkdown/hooks/useExtensions.ts`

- [ ] **Step 1: 新建 TableView.vue，搭好 NodeView 宿主、overlay、事件绑定和命令桥接**

创建 `src/components/BMarkdown/components/TableView.vue`，写入以下完整内容：

```vue
<template>
  <NodeViewWrapper class="b-table-node-view">
    <div
      ref="scrollerRef"
      class="b-table-node-view__scroller"
      @mousemove="handleMouseMove"
      @mouseleave="clearHoverState"
      @scroll="handleScroll"
    >
      <NodeViewContent as="table" class="b-table-node-view__table" />

      <div v-if="hoveredDivider" class="b-table-node-view__line-overlay" contenteditable="false">
        <div class="b-table-node-view__line-highlight" :style="lineHighlightStyle"></div>
        <button
          type="button"
          class="b-table-node-view__add-button"
          :style="addButtonStyle"
          @mousedown.prevent
          @click="handleAdd"
        >
          +
        </button>
      </div>

      <div v-if="hoveredSegment" class="b-table-node-view__segment-overlay" contenteditable="false">
        <button
          type="button"
          class="b-table-node-view__remove-button"
          :style="removeButtonStyle"
          @mousedown.prevent
          @click="handleRemove"
        >
          −
        </button>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { findParentNodeClosestToPos } from '@tiptap/core';
import {
  findHoveredDivider,
  findHoveredSegment,
  getAddButtonPosition,
  getRemoveButtonPosition,
  type DividerHit,
  type DOMRectLike,
  type SegmentHit
} from '../extensions/tableControlsGeometry';
import { applyAddAction, applyRemoveAction } from '../extensions/tableControlsCommands';

const props = defineProps(nodeViewProps);

const BUTTON_SIZE = 18;
const DIVIDER_THRESHOLD = 6;

const scrollerRef = ref<HTMLElement | null>(null);
const hoveredDivider = ref<DividerHit | null>(null);
const hoveredSegment = ref<SegmentHit | null>(null);
const lastPointer = ref<{ clientX: number; clientY: number } | null>(null);
let scrollFrame = 0;

/**
 * 清空当前 hover 状态。
 */
function clearHoverState(): void {
  hoveredDivider.value = null;
  hoveredSegment.value = null;
}

/**
 * 将 DOMRect 转成纯数据矩形。
 * @param rect - DOM 矩形
 * @returns 纯数据矩形
 */
function toRectLike(rect: DOMRect): DOMRectLike {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

/**
 * 读取当前表格的行列几何。
 * @returns 行列矩形列表
 */
function readTableGeometry(): { columnRects: DOMRectLike[]; rowRects: DOMRectLike[] } {
  const scroller = scrollerRef.value;
  const tableElement = scroller?.querySelector('table');
  if (!(tableElement instanceof HTMLTableElement)) {
    return { columnRects: [], rowRects: [] };
  }

  const rows = Array.from(tableElement.querySelectorAll('tr'));
  const rowRects = rows.map((row) => toRectLike(row.getBoundingClientRect()));

  const firstRowCells = rows[0]
    ? Array.from(rows[0].querySelectorAll('th,td'))
    : [];
  const columnRects = firstRowCells.map((cell) => toRectLike(cell.getBoundingClientRect()));

  return { columnRects, rowRects };
}

/**
 * 更新 hover 状态。
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 */
function updateHoverState(clientX: number, clientY: number): void {
  if (!props.editor.isEditable) {
    clearHoverState();
    return;
  }

  const geometry = readTableGeometry();
  const divider = findHoveredDivider({
    clientX,
    clientY,
    threshold: DIVIDER_THRESHOLD,
    ...geometry
  });

  hoveredDivider.value = divider;
  hoveredSegment.value = divider
    ? null
    : findHoveredSegment({
      clientX,
      clientY,
      threshold: DIVIDER_THRESHOLD,
      ...geometry
    });
}

/**
 * 处理鼠标移动。
 * @param event - 鼠标事件
 */
function handleMouseMove(event: MouseEvent): void {
  lastPointer.value = { clientX: event.clientX, clientY: event.clientY };
  updateHoverState(event.clientX, event.clientY);
}

/**
 * 处理横向滚动后的 hover 重算。
 */
function handleScroll(): void {
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame);
  }

  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (lastPointer.value) {
      updateHoverState(lastPointer.value.clientX, lastPointer.value.clientY);
    }
  });
}

/**
 * 聚焦到目标表格单元格。
 * @param position - 行列位置
 * @returns 定位成功时返回 true
 */
function focusCellAt(position: { row: number; column: number }): boolean {
  const { selection, tr, doc } = props.editor.state;
  const tableNodeInfo = findParentNodeClosestToPos(selection.$from, (node) => node.type.name === 'table');
  if (!tableNodeInfo) {
    return false;
  }

  const map = TableMap.get(tableNodeInfo.node);
  const row = Math.min(position.row, map.height - 1);
  const column = Math.min(position.column, map.width - 1);
  const cellStart = map.map[row * map.width + column];
  const cellPos = tableNodeInfo.pos + 1 + cellStart;

  const cellSelection = CellSelection.create(doc, cellPos);
  props.editor.view.dispatch(tr.setSelection(cellSelection));
  return true;
}

/**
 * 读取当前表格的行列数。
 * @returns 表格维度
 */
function getDimensions(): { rowCount: number; columnCount: number } {
  const { selection } = props.editor.state;
  const tableNodeInfo = findParentNodeClosestToPos(selection.$from, (node) => node.type.name === 'table');
  if (!tableNodeInfo) {
    return { rowCount: 0, columnCount: 0 };
  }

  const map = TableMap.get(tableNodeInfo.node);
  return {
    rowCount: map.height,
    columnCount: map.width
  };
}

/**
 * 处理新增动作。
 */
function handleAdd(): void {
  if (!hoveredDivider.value) {
    return;
  }

  applyAddAction({
    editor: props.editor,
    focusCellAt,
    getDimensions
  }, hoveredDivider.value);
}

/**
 * 处理删除动作。
 */
function handleRemove(): void {
  if (!hoveredSegment.value) {
    return;
  }

  applyRemoveAction({
    editor: props.editor,
    focusCellAt,
    getDimensions
  }, hoveredSegment.value);
}

const lineHighlightStyle = computed<CSSProperties>(() => {
  if (!hoveredDivider.value) {
    return {};
  }

  const rect = hoveredDivider.value.lineRect;
  return hoveredDivider.value.type === 'column'
    ? {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: '2px',
      height: `${rect.height}px`
    }
    : {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: '2px'
    };
});

const addButtonStyle = computed<CSSProperties>(() => {
  if (!hoveredDivider.value) {
    return {};
  }

  const position = getAddButtonPosition(hoveredDivider.value, BUTTON_SIZE);
  return {
    top: `${position.top}px`,
    left: `${position.left}px`
  };
});

const removeButtonStyle = computed<CSSProperties>(() => {
  if (!hoveredSegment.value) {
    return {};
  }

  const position = getRemoveButtonPosition(hoveredSegment.value, BUTTON_SIZE);
  return {
    top: `${position.top}px`,
    left: `${position.left}px`
  };
});

onBeforeUnmount(() => {
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame);
  }
});

void nextTick();
</script>
```

- [ ] **Step 2: 在 `useExtensions.ts` 中为 `MarkdownTable` 注册 Vue NodeView**

在 `src/components/BMarkdown/hooks/useExtensions.ts` 顶部新增导入：

```typescript
import TableView from '../components/TableView.vue';
```

然后在 `const MarkdownTable = Table.extend({ ... })` 内追加 `addNodeView`：

```typescript
    addNodeView: () => VueNodeViewRenderer(TableView as unknown as Component<NodeViewProps>),
```

最终该扩展片段应为：

```typescript
  const MarkdownTable = Table.extend({
    addAttributes() {
      return createSourceLineAttributes({
        ...(this.parent?.() ?? {}),
        markdownRaw: {
          default: null,
          renderHTML: () => ({})
        },
        markdownSignature: {
          default: null,
          renderHTML: () => ({})
        }
      });
    },
    addNodeView: () => VueNodeViewRenderer(TableView as unknown as Component<NodeViewProps>),
    parseMarkdown: (token: MarkdownTableTokenData, helpers: MarkdownParseHelpers): MarkdownParseResult => {
      // 保持现有 parseMarkdown 内容不变
    },
    renderMarkdown: (node: JSONContent, helpers): string => {
      // 保持现有 renderMarkdown 内容不变
    }
  });
```

- [ ] **Step 3: 运行 NodeView 测试，修正最小实现直到通过**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableNodeView.test.ts
```

Expected: PASS，5 个用例全部通过。

- [ ] **Step 4: Commit**

```bash
git add src/components/BMarkdown/components/TableView.vue src/components/BMarkdown/hooks/useExtensions.ts test/components/BMarkdown/tableNodeView.test.ts
git commit -m "feat: add table node view controls"
```

---

### Task 6: 迁移表格样式并做整体验证

**Files:**
- Modify: `src/components/BMarkdown/components/PaneRichEditor.vue`
- Modify: `changelog/2026-05-12.md`

- [ ] **Step 1: 在富文本样式中迁移旧 `.tableWrapper` 规则到 NodeView 类名体系**

将 `PaneRichEditor.vue` 样式里现有表格规则替换为下列片段，保留非表格样式不变：

```less
  .b-table-node-view {
    width: 100%;
    margin: 0.75em 0;
  }

  .b-table-node-view__scroller {
    position: relative;
    width: 100%;
    overflow-x: auto;
  }

  .b-table-node-view__table {
    width: 100%;
    margin: 0;
    overflow: hidden;
    border-spacing: 0;
    border-collapse: separate;
    border: 1px solid var(--editor-table-border);
    border-radius: 8px;

    th {
      min-width: 120px;
      padding: 0.5em 0.75em;
      font-weight: 600;
      vertical-align: top;
      color: var(--editor-text);
      text-align: left;
      background-color: var(--editor-table-header-bg);
      border-right: 1px solid var(--editor-table-border);
      border-bottom: 1px solid var(--editor-table-border);

      &:last-child {
        border-right: none;
      }
    }

    td {
      min-width: 120px;
      padding: 0.5em 0.75em;
      vertical-align: top;
      color: var(--editor-text);
      text-align: left;
      background-color: var(--bg-primary);
      border-right: 1px solid var(--editor-table-border);
      border-bottom: 1px solid var(--editor-table-border);

      &:last-child {
        border-right: none;
      }
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background-color: var(--editor-table-even-bg);
    }

    th p,
    td p {
      margin: 0;
      min-height: auto;
      color: inherit;
    }
  }

  .b-table-node-view__line-overlay,
  .b-table-node-view__segment-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .b-table-node-view__line-highlight {
    position: absolute;
    border-radius: 999px;
    background-color: color-mix(in srgb, var(--ant-color-primary) 68%, transparent);
    pointer-events: none;
  }

  .b-table-node-view__add-button,
  .b-table-node-view__remove-button {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--editor-text);
    background: var(--bg-primary);
    border: 1px solid var(--editor-table-border);
    border-radius: 999px;
    box-shadow: var(--shadow-sm);
    pointer-events: auto;
    cursor: pointer;
  }

  .b-table-node-view__remove-button {
    color: var(--ant-color-error);
  }
```

- [ ] **Step 2: 在 changelog 中补充实现计划与代码落地记录**

向 `changelog/2026-05-12.md` 的 `## Changed` 末尾追加：

```markdown
- 新增“表格 NodeView 增删控件”实现计划文档，拆分表格几何命中、命令映射、`TableView` NodeView 接入、样式迁移与交互测试步骤。
- 为富文本表格新增自定义 `Table NodeView`，支持分割线新增行列、整行整列删除入口、最外边框插入规则与滚动后的 hover 重算。
```

- [ ] **Step 3: 运行目标测试、类型检查与局部 lint**

Run:

```bash
pnpm test -- test/components/BMarkdown/tableControlsGeometry.test.ts test/components/BMarkdown/tableControlsCommands.test.ts test/components/BMarkdown/tableNodeView.test.ts
pnpm exec vue-tsc --noEmit
pnpm exec eslint src/components/BMarkdown/components/TableView.vue src/components/BMarkdown/extensions/tableControlsGeometry.ts src/components/BMarkdown/extensions/tableControlsCommands.ts src/components/BMarkdown/hooks/useExtensions.ts src/components/BMarkdown/components/PaneRichEditor.vue
```

Expected:

- `pnpm test -- ...` PASS
- `pnpm exec vue-tsc --noEmit` PASS
- `pnpm exec eslint ...` PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/BMarkdown/components/PaneRichEditor.vue changelog/2026-05-12.md
git add src/components/BMarkdown/components/TableView.vue src/components/BMarkdown/extensions/tableControlsGeometry.ts src/components/BMarkdown/extensions/tableControlsCommands.ts
git add src/components/BMarkdown/hooks/useExtensions.ts
git add test/components/BMarkdown/tableControlsGeometry.test.ts test/components/BMarkdown/tableControlsCommands.test.ts test/components/BMarkdown/tableNodeView.test.ts
git commit -m "feat: add table node view insert and remove controls"
```

---

## Self-Review

- **Spec coverage:** 计划覆盖了 spec 中的 `Table NodeView` 宿主结构、`scroller` 内部 overlay、分割线与区块双命中体系、最外边框插入、内部分割线单向插入、删除入口显隐、scroll 后 hover 重算，以及纯函数/NodeView/命令三层测试。未单列“合并单元格”实现，因为 spec 明确把它列为非本次范围。
- **Placeholder scan:** 计划中没有 `TBD`、`TODO`、`implement later` 或“类似 Task N”之类占位语句；每个代码步骤都给出了目标文件和完整命令。
- **Type consistency:** 计划统一使用 `DOMRectLike`、`DividerHit`、`SegmentHit`、`TableCommandContext`、`findHoveredDivider()`、`findHoveredSegment()`、`applyAddAction()`、`applyRemoveAction()` 这些命名，前后任务保持一致。
