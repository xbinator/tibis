/**
 * @file tableControlsGeometry.ts
 * @description 表格 NodeView 控件所需的几何命中与按钮位置派生逻辑。
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
  /** 内部分割线的列索引表示"分割线右侧列" */
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

/** 同一悬浮位置下的行列新增命中集合。 */
export interface DividerHover {
  row: DividerHit | null;
  column: DividerHit | null;
}

/** 按钮定位结果。 */
export interface ButtonPosition {
  top: number;
  left: number;
}

/** 命中检测公共入参。 */
export interface HitTestInput {
  clientX: number;
  clientY: number;
  columnRects: DOMRectLike[];
  rowRects: DOMRectLike[];
  /** 单侧命中阈值（像素） */
  threshold: number;
}

// ─── 内部工具 ─────────────────────────────────────────────────────────────────

/** 构造纯数据矩形。 */
function createRect(left: number, top: number, width: number, height: number): DOMRectLike {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** 判断点是否落在矩形内部（含边界）。 */
function isInsideRect({ left, right, top, bottom }: DOMRectLike, x: number, y: number): boolean {
  return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * 通用分割线构建器。
 *
 * 将"leading → inner × (n-1) → trailing"的模式统一处理，
 * 消除原先 buildColumnDividers / buildRowDividers 的重复结构。
 *
 * @param type      - 分割线方向
 * @param rects     - 当前轴向的矩形列表（列或行）
 * @param spanStart - 垂直轴起始坐标（列分割线取行顶，行分割线取列左）
 * @param spanEnd   - 垂直轴终止坐标
 */
function buildDividers(type: 'column' | 'row', rects: DOMRectLike[], spanStart: number, spanEnd: number): DividerHit[] {
  if (rects.length === 0) return [];

  const isColumn = type === 'column';

  /**
   * 将轴向坐标与跨度坐标组合成 lineRect：
   * - 列分割线：竖线，width=0，height=span
   * - 行分割线：横线，width=span，height=0
   */
  const makeLine = (axisPos: number): DOMRectLike =>
    isColumn ? createRect(axisPos, spanStart, 0, spanEnd - spanStart) : createRect(spanStart, axisPos, spanEnd - spanStart, 0);

  const hits: DividerHit[] = [{ type, index: 0, edge: 'leading', lineRect: makeLine(isColumn ? rects[0].left : rects[0].top) }];

  for (let i = 1; i < rects.length; i++) {
    const prevEdge = isColumn ? rects[i - 1].right : rects[i - 1].bottom;
    hits.push({ type, index: i, edge: 'inner', lineRect: makeLine(prevEdge) });
  }

  const last = rects[rects.length - 1];
  hits.push({
    type,
    index: rects.length - 1,
    edge: 'trailing',
    lineRect: makeLine(isColumn ? last.right : last.bottom)
  });

  return hits;
}

/**
 * 判断鼠标是否在分割线阈值带内。
 *
 * leading  → 仅允许"轴坐标 + threshold"方向命中
 * trailing → 仅允许"轴坐标 - threshold"方向命中
 * inner    → 双向各 threshold
 */
function matchesDivider({ type, edge, lineRect }: DividerHit, x: number, y: number, threshold: number): boolean {
  const isColumn = type === 'column';
  /** 轴向坐标：列分割线看 X，行分割线看 Y */
  const axisPos = isColumn ? lineRect.left : lineRect.top;
  /** 鼠标在当前轴向上的坐标 */
  const axisCursor = isColumn ? x : y;
  /** 鼠标是否在分割线的正交方向范围内 */
  const inSpan = isColumn ? y >= lineRect.top && y <= lineRect.bottom : x >= lineRect.left && x <= lineRect.right;

  if (!inSpan) return false;

  if (edge === 'leading') return axisCursor >= axisPos && axisCursor <= axisPos + threshold;

  if (edge === 'trailing') return axisCursor <= axisPos && axisCursor >= axisPos - threshold;

  if (edge === 'inner') return Math.abs(axisCursor - axisPos) <= threshold;

  return false;
}

/** 计算指针到分割线的轴向距离，用于最近优先排序。 */
function dividerDistance({ type, lineRect }: DividerHit, x: number, y: number): number {
  return type === 'column' ? Math.abs(x - lineRect.left) : Math.abs(y - lineRect.top);
}

/**
 * 从同方向候选中取距离最近的分割线。
 * @param hits - 同方向候选分割线
 * @param x - 指针横坐标
 * @param y - 指针纵坐标
 * @returns 最近的命中结果
 */
function findClosestDivider(hits: DividerHit[], x: number, y: number): DividerHit | null {
  if (hits.length === 0) {
    return null;
  }

  return hits.reduce((best, cur) => {
    return dividerDistance(cur, x, y) < dividerDistance(best, x, y) ? cur : best;
  });
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 查找当前命中的分割线。
 * 多个候选时取轴向距离最近者；距离相同时列优先。
 */
export function findHoveredDivider({ clientX: x, clientY: y, columnRects, rowRects, threshold }: HitTestInput): DividerHit | null {
  const hover = findHoveredDividers({ clientX: x, clientY: y, columnRects, rowRects, threshold });
  const candidates = [hover?.column, hover?.row].filter((hit): hit is DividerHit => hit !== null && hit !== undefined);

  if (candidates.length === 0) return null;

  return candidates.reduce((best, cur) => {
    const diff = dividerDistance(cur, x, y) - dividerDistance(best, x, y);
    if (diff !== 0) return diff < 0 ? cur : best;
    // 距离相同：列优先
    return best.type === 'column' ? best : cur;
  });
}

/**
 * 查找当前命中的行列新增分割线集合。
 * 交叉点附近可同时返回一条行分割线和一条列分割线。
 */
export function findHoveredDividers({ clientX: x, clientY: y, columnRects, rowRects, threshold }: HitTestInput): DividerHover | null {
  if (columnRects.length === 0 || rowRects.length === 0) return null;

  const colDividers = buildDividers('column', columnRects, rowRects[0].top, rowRects[rowRects.length - 1].bottom);
  const rowDividers = buildDividers('row', rowRects, columnRects[0].left, columnRects[columnRects.length - 1].right);

  const column = findClosestDivider(
    colDividers.filter((hit) => matchesDivider(hit, x, y, threshold)),
    x,
    y
  );
  const row = findClosestDivider(
    rowDividers.filter((hit) => matchesDivider(hit, x, y, threshold)),
    x,
    y
  );

  return row || column ? { row, column } : null;
}

/**
 * 查找当前命中的行列删除区块集合。
 * 鼠标命中分割线时返回 null（分割线优先）。
 */
export function findHoveredSegments(input: HitTestInput): SegmentHover | null {
  if (findHoveredDivider(input)) return null;

  const { clientX: x, clientY: y, rowRects, columnRects } = input;

  const rowIdx = rowRects.findIndex((r) => isInsideRect(r, x, y));
  const colIdx = columnRects.findIndex((r) => isInsideRect(r, x, y));

  const row: SegmentHit | null = rowIdx === -1 ? null : { type: 'row', index: rowIdx, segmentRect: rowRects[rowIdx] };
  const column: SegmentHit | null = colIdx === -1 ? null : { type: 'column', index: colIdx, segmentRect: columnRects[colIdx] };

  return row || column ? { row, column } : null;
}

/**
 * 查找当前命中的删除区块（行优先）。
 */
export function findHoveredSegment(input: HitTestInput): SegmentHit | null {
  const hover = findHoveredSegments(input);
  return hover?.row ?? hover?.column ?? null;
}

/**
 * 根据分割线派生新增按钮位置（按钮左上角对齐分割线起点）。
 */
export function getAddButtonPosition({ lineRect }: DividerHit): ButtonPosition {
  return { top: lineRect.top, left: lineRect.left };
}

/**
 * 根据区块派生删除按钮位置（按钮居中于区块对应轴）。
 *
 * - 列删除：水平居中，贴顶
 * - 行删除：垂直居中，贴左
 */
export function getRemoveButtonPosition({ type, segmentRect }: SegmentHit): ButtonPosition {
  return type === 'column'
    ? { top: segmentRect.top, left: segmentRect.left + segmentRect.width / 2 }
    : { top: segmentRect.top + segmentRect.height / 2, left: segmentRect.left };
}
