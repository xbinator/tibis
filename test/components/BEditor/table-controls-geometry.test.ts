/**
 * @file table-controls-geometry.test.ts
 * @description BEditor 表格控制区几何计算回归测试。
 */
import { describe, expect, it } from 'vitest';
import {
  createLogicalColumnRects,
  createSelectedSegmentHover,
  getColumnSegmentActionPlacement,
  getRowSegmentActionPlacement,
  type DOMRectLike,
  type TableCellGeometryRow
} from '@/components/BEditor/extensions/tableControlsGeometry';

/**
 * 删除按钮浮层尺寸与间距选项。
 */
const ACTION_OPTIONS = {
  controlSize: 14,
  actionOffset: 8,
  actionGroupSize: 38
} as const;

/**
 * 创建纯数据矩形。
 * @param left - 左边界
 * @param top - 上边界
 * @param width - 宽度
 * @param height - 高度
 * @returns 纯数据矩形
 */
function createRect(left: number, top: number, width: number, height: number): DOMRectLike {
  return {
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height
  };
}

/**
 * 创建测试用单元格几何。
 * @param left - 左边界
 * @param right - 右边界
 * @param colSpan - 跨列数
 * @param rowSpan - 跨行数
 * @returns 单元格几何
 */
function createCell(left: number, right: number, colSpan = 1, rowSpan = 1): TableCellGeometryRow[number] {
  return {
    left,
    right,
    width: right - left,
    colSpan,
    rowSpan
  };
}

describe('table controls geometry', (): void => {
  it('prefers real cell edges over equal split fallbacks for non-uniform colspan columns', (): void => {
    const rows: TableCellGeometryRow[] = [
      [createCell(0, 220, 2), createCell(220, 300)],
      [createCell(0, 100), createCell(100, 220), createCell(220, 300)]
    ];

    const rects = createLogicalColumnRects(rows, 10, 210);

    expect(rects).toEqual([
      { top: 10, right: 100, bottom: 210, left: 0, width: 100, height: 200 },
      { top: 10, right: 220, bottom: 210, left: 100, width: 120, height: 200 },
      { top: 10, right: 300, bottom: 210, left: 220, width: 80, height: 200 }
    ]);
  });

  it('skips columns occupied by row-spanned cells when reading lower row edges', (): void => {
    const rows: TableCellGeometryRow[] = [[createCell(0, 120, 1, 2), createCell(120, 260)], [createCell(120, 260)]];

    const rects = createLogicalColumnRects(rows, 0, 160);

    expect(rects).toEqual([
      { top: 0, right: 120, bottom: 160, left: 0, width: 120, height: 160 },
      { top: 0, right: 260, bottom: 160, left: 120, width: 140, height: 160 }
    ]);
  });

  it('derives selected segment hits from the latest geometry snapshot', (): void => {
    const firstGeometry = {
      columnRects: [createRect(0, 0, 80, 100), createRect(80, 0, 120, 100)],
      rowRects: [createRect(0, 0, 200, 40), createRect(0, 40, 200, 60)]
    };
    const nextGeometry = {
      columnRects: [createRect(0, 0, 90, 100), createRect(90, 0, 180, 100)],
      rowRects: [createRect(0, 0, 270, 40), createRect(0, 40, 270, 60)]
    };

    const firstHover = createSelectedSegmentHover({ type: 'column', index: 1 }, firstGeometry.columnRects, firstGeometry.rowRects);
    const nextHover = createSelectedSegmentHover({ type: 'column', index: 1 }, nextGeometry.columnRects, nextGeometry.rowRects);

    expect(firstHover?.column?.segmentRect).toEqual(firstGeometry.columnRects[1]);
    expect(nextHover?.column?.segmentRect).toEqual(nextGeometry.columnRects[1]);
  });

  it('moves row action placement inside when the selected row touches the left boundary', (): void => {
    const placement = getRowSegmentActionPlacement(createRect(0, 20, 360, 44), ACTION_OPTIONS);

    expect(placement).toEqual({
      top: 42,
      left: 8,
      transform: 'translate(0, -50%)',
      side: 'inside'
    });
  });

  it('keeps row action placement outside when the viewport has enough left space', (): void => {
    const placement = getRowSegmentActionPlacement(createRect(0, 20, 360, 44), {
      ...ACTION_OPTIONS,
      viewportStartOffset: 100
    });

    expect(placement).toEqual({
      top: 42,
      left: -22,
      transform: 'translate(-100%, -50%)',
      side: 'outside'
    });
  });

  it('keeps row action placement outside when the selected row has enough left space', (): void => {
    const placement = getRowSegmentActionPlacement(createRect(80, 20, 360, 44), ACTION_OPTIONS);

    expect(placement).toEqual({
      top: 42,
      left: 58,
      transform: 'translate(-100%, -50%)',
      side: 'outside'
    });
  });

  it('moves column action placement inside when the selected column touches the top boundary', (): void => {
    const placement = getColumnSegmentActionPlacement(createRect(40, 0, 120, 240), ACTION_OPTIONS);

    expect(placement).toEqual({
      top: 8,
      left: 100,
      transform: 'translate(-50%, 0)',
      side: 'inside'
    });
  });

  it('keeps column action placement outside when the viewport has enough top space', (): void => {
    const placement = getColumnSegmentActionPlacement(createRect(40, 0, 120, 240), {
      ...ACTION_OPTIONS,
      viewportStartOffset: 100
    });

    expect(placement).toEqual({
      top: -22,
      left: 100,
      transform: 'translate(-50%, -100%)',
      side: 'outside'
    });
  });

  it('keeps column action placement outside when the selected column has enough top space', (): void => {
    const placement = getColumnSegmentActionPlacement(createRect(40, 80, 120, 240), ACTION_OPTIONS);

    expect(placement).toEqual({
      top: 58,
      left: 100,
      transform: 'translate(-50%, -100%)',
      side: 'outside'
    });
  });
});
