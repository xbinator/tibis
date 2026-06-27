/**
 * @file tableControlsGeometry.ts
 * @description 表格 NodeView 控件所需的几何派生逻辑。
 */

// ─── 数据结构 ────────────────────────────────────────────────────────────────

/** 纯数据矩形结构，避免命中逻辑直接依赖实时 DOM 对象。 */
export interface DOMRectLike {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/** 分割线 hover 命中结果。 */
export interface DividerHit {
  type: 'row' | 'column';
  /** 内部分割线的索引表示“分割线右侧列”或“分割线下方行”。 */
  index: number;
  edge: 'leading' | 'inner' | 'trailing';
  /** 用于绘制高亮线的矩形 */
  lineRect: DOMRectLike;
}

/** 删除目标区块命中结果。 */
export interface SegmentHit {
  type: 'row' | 'column';
  index: number;
  segmentRect: DOMRectLike;
}

/** 同一悬浮位置下的行列删除命中集合。 */
export interface SegmentHover {
  row: SegmentHit | null;
  column: SegmentHit | null;
}

/**
 * 删除浮层相对表格区段的定位结果。
 */
export interface SegmentActionPlacement {
  /** 浮层锚点顶部坐标。 */
  top: number;
  /** 浮层锚点左侧坐标。 */
  left: number;
  /** CSS transform，用于表达外侧悬挂或内侧回落。 */
  transform: string;
  /** 浮层位于表格区段外侧还是内侧。 */
  side: 'outside' | 'inside';
}

/**
 * 删除浮层定位所需的尺寸配置。
 */
export interface SegmentActionPlacementOptions {
  /** 行列控制条宽度。 */
  controlSize: number;
  /** 控制条与删除浮层之间的间距。 */
  actionOffset: number;
  /** 删除浮层在单按钮场景下的外框尺寸。 */
  actionGroupSize: number;
  /** 当前 overlay 起点到浏览器视口起点的距离，用于判断真实可见空间。 */
  viewportStartOffset?: number;
}

/**
 * 当前被控制区选中的行或列。
 */
export interface SelectedTableSegment {
  /** 选中区段类型。 */
  type: 'row' | 'column';
  /** 选中区段索引。 */
  index: number;
}

/**
 * DOM 单元格投影后的几何信息。
 */
export interface TableCellGeometry {
  /** 单元格左边界。 */
  left: number;
  /** 单元格右边界。 */
  right: number;
  /** 单元格宽度。 */
  width: number;
  /** 单元格跨列数量。 */
  colSpan: number;
  /** 单元格跨行数量。 */
  rowSpan: number;
}

/**
 * 一行单元格几何。
 */
export type TableCellGeometryRow = TableCellGeometry[];

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

/**
 * 确保边界候选列表存在对应索引的桶。
 * @param candidates - 边界候选列表
 * @param index - 逻辑列边界索引
 */
function ensureBoundaryBucket(candidates: number[][], index: number): void {
  while (candidates.length <= index) {
    candidates.push([]);
  }
}

/**
 * 写入一个有效的列边界候选值。
 * @param candidates - 边界候选列表
 * @param index - 逻辑列边界索引
 * @param value - 边界横坐标
 */
function pushBoundaryCandidate(candidates: number[][], index: number, value: number): void {
  if (index < 0 || !Number.isFinite(value)) {
    return;
  }

  ensureBoundaryBucket(candidates, index);
  candidates[index].push(value);
}

/**
 * 对同一逻辑边界的多个候选取中位数，降低跨行/子像素差异带来的抖动。
 * @param values - 边界候选值
 * @returns 中位数边界；无候选时返回 null
 */
function readMedianBoundary(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((first, second) => first - second);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }

  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}

/**
 * 为跨列单元格补充内部逻辑列边界兜底候选。
 * @param candidates - 兜底边界候选列表
 * @param startColumnIndex - 单元格起始逻辑列
 * @param cell - 单元格几何
 */
function pushSplitBoundaryFallbacks(candidates: number[][], startColumnIndex: number, cell: TableCellGeometry): void {
  if (cell.colSpan <= 1) {
    return;
  }

  const columnWidth = cell.width / cell.colSpan;
  for (let offset = 1; offset < cell.colSpan; offset += 1) {
    pushBoundaryCandidate(candidates, startColumnIndex + offset, cell.left + columnWidth * offset);
  }
}

/**
 * 根据边界列表创建列矩形。
 * @param boundaries - 逻辑列边界横坐标列表
 * @param tableTop - 表格顶部坐标
 * @param tableBottom - 表格底部坐标
 * @returns 列矩形列表
 */
function createColumnRectsFromBoundaries(boundaries: number[], tableTop: number, tableBottom: number): DOMRectLike[] {
  return boundaries.slice(0, -1).map((left, index) => {
    const right = boundaries[index + 1];
    return {
      top: tableTop,
      right,
      bottom: tableBottom,
      left,
      width: right - left,
      height: tableBottom - tableTop
    };
  });
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 从全表单元格采样逻辑列边界，优先使用真实单元格边缘，跨列内部再使用均分兜底。
 * @param rows - 表格单元格几何行
 * @returns 逻辑列边界横坐标列表
 */
export function readLogicalColumnBoundaries(rows: TableCellGeometryRow[]): number[] {
  const edgeCandidates: number[][] = [];
  const splitFallbackCandidates: number[][] = [];
  const occupiedUntil: number[] = [];

  rows.forEach((row, rowIndex) => {
    let columnIndex = 0;

    row.forEach((cell) => {
      while ((occupiedUntil[columnIndex] ?? 0) > rowIndex) {
        columnIndex += 1;
      }

      const colSpan = Math.max(1, cell.colSpan);
      const rowSpan = Math.max(1, cell.rowSpan);
      const startColumnIndex = columnIndex;
      const endColumnIndex = startColumnIndex + colSpan;
      const safeCell = { ...cell, colSpan, rowSpan };

      pushBoundaryCandidate(edgeCandidates, startColumnIndex, safeCell.left);
      pushBoundaryCandidate(edgeCandidates, endColumnIndex, safeCell.right);
      pushSplitBoundaryFallbacks(splitFallbackCandidates, startColumnIndex, safeCell);

      for (let index = startColumnIndex; index < endColumnIndex; index += 1) {
        occupiedUntil[index] = Math.max(occupiedUntil[index] ?? 0, rowIndex + rowSpan);
      }

      columnIndex = endColumnIndex;
    });
  });

  const boundaryCount = Math.max(edgeCandidates.length, splitFallbackCandidates.length);
  return Array.from({ length: boundaryCount }, (_, index) => {
    return readMedianBoundary(edgeCandidates[index] ?? []) ?? readMedianBoundary(splitFallbackCandidates[index] ?? []) ?? 0;
  });
}

/**
 * 根据全表单元格几何创建逻辑列矩形。
 * @param rows - 表格单元格几何行
 * @param tableTop - 表格顶部坐标
 * @param tableBottom - 表格底部坐标
 * @returns 逻辑列矩形列表
 */
export function createLogicalColumnRects(rows: TableCellGeometryRow[], tableTop: number, tableBottom: number): DOMRectLike[] {
  return createColumnRectsFromBoundaries(readLogicalColumnBoundaries(rows), tableTop, tableBottom);
}

/**
 * 根据当前几何快照创建区段命中结果。
 * @param type - 区段类型
 * @param index - 区段索引
 * @param columnRects - 列几何列表
 * @param rowRects - 行几何列表
 * @returns 区段命中结果；索引越界时返回 null
 */
export function createSegmentHit(type: SelectedTableSegment['type'], index: number, columnRects: DOMRectLike[], rowRects: DOMRectLike[]): SegmentHit | null {
  const rects = type === 'row' ? rowRects : columnRects;
  const segmentRect = rects[index];

  return segmentRect ? { type, index, segmentRect } : null;
}

/**
 * 将当前选中区段投影到最新几何快照。
 * @param selectedSegment - 当前选中的行或列
 * @param columnRects - 列几何列表
 * @param rowRects - 行几何列表
 * @returns 当前选中区段命中集合；没有有效选中时返回 null
 */
export function createSelectedSegmentHover(
  selectedSegment: SelectedTableSegment | null,
  columnRects: DOMRectLike[],
  rowRects: DOMRectLike[]
): SegmentHover | null {
  if (!selectedSegment) {
    return null;
  }

  const hit = createSegmentHit(selectedSegment.type, selectedSegment.index, columnRects, rowRects);
  if (!hit) {
    return null;
  }

  return {
    row: hit.type === 'row' ? hit : null,
    column: hit.type === 'column' ? hit : null
  };
}

/**
 * 计算行删除浮层定位；左侧空间不足时回落到行内，避免被编辑器边界裁切。
 * @param segmentRect - 选中行的区段矩形
 * @param options - 控制条与浮层尺寸
 * @returns 删除浮层定位结果
 */
export function getRowSegmentActionPlacement(segmentRect: DOMRectLike, options: SegmentActionPlacementOptions): SegmentActionPlacement {
  const outsideLeft = segmentRect.left - options.controlSize - options.actionOffset;
  const viewportStartOffset = options.viewportStartOffset ?? 0;
  const hasOutsideSpace = viewportStartOffset + outsideLeft - options.actionGroupSize >= 0;

  if (hasOutsideSpace) {
    return {
      top: segmentRect.top + segmentRect.height / 2,
      left: outsideLeft,
      transform: 'translate(-100%, -50%)',
      side: 'outside'
    };
  }

  return {
    top: segmentRect.top + segmentRect.height / 2,
    left: segmentRect.left + options.actionOffset,
    transform: 'translate(0, -50%)',
    side: 'inside'
  };
}

/**
 * 计算列删除浮层定位；上方空间不足时回落到列内，避免被编辑器边界裁切。
 * @param segmentRect - 选中列的区段矩形
 * @param options - 控制条与浮层尺寸
 * @returns 删除浮层定位结果
 */
export function getColumnSegmentActionPlacement(segmentRect: DOMRectLike, options: SegmentActionPlacementOptions): SegmentActionPlacement {
  const outsideTop = segmentRect.top - options.controlSize - options.actionOffset;
  const viewportStartOffset = options.viewportStartOffset ?? 0;
  const hasOutsideSpace = viewportStartOffset + outsideTop - options.actionGroupSize >= 0;

  if (hasOutsideSpace) {
    return {
      top: outsideTop,
      left: segmentRect.left + segmentRect.width / 2,
      transform: 'translate(-50%, -100%)',
      side: 'outside'
    };
  }

  return {
    top: segmentRect.top + options.actionOffset,
    left: segmentRect.left + segmentRect.width / 2,
    transform: 'translate(-50%, 0)',
    side: 'inside'
  };
}
