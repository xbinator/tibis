import { describe, expect, it } from 'vitest';
import {
  type DividerHit,
  findHoveredDividers,
  type DOMRectLike,
  findHoveredDivider,
  findHoveredSegment,
  findHoveredSegments,
  getAddButtonPosition,
  getRemoveButtonPosition
} from '@/components/BEditor/extensions/tableControlsGeometry';

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

const columnRects = [createRect(0, 0, 120, 120), createRect(120, 0, 120, 120), createRect(240, 0, 120, 120)];

const rowRects = [createRect(0, 0, 360, 40), createRect(0, 40, 360, 40), createRect(0, 80, 360, 40)];

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

  it('returns both row and column add targets when hovering a divider intersection', () => {
    const hover = findHoveredDividers({
      clientX: 120,
      clientY: 40,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(hover).toEqual({
      row: {
        type: 'row',
        index: 1,
        edge: 'inner',
        lineRect: createRect(0, 40, 360, 0)
      },
      column: {
        type: 'column',
        index: 1,
        edge: 'inner',
        lineRect: createRect(120, 0, 0, 120)
      }
    });
  });

  it('finds a row remove segment only when the pointer is outside divider thresholds', () => {
    const segment = findHoveredSegment({
      clientX: 180,
      clientY: 60,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(segment).toEqual({
      type: 'row',
      index: 1,
      segmentRect: createRect(0, 40, 360, 40)
    });
  });

  it('finds both row and column remove targets when hovering inside a body cell', () => {
    const segment = findHoveredSegments({
      clientX: 180,
      clientY: 60,
      columnRects,
      rowRects,
      threshold: 6
    });

    expect(segment).toEqual({
      row: {
        type: 'row',
        index: 1,
        segmentRect: createRect(0, 40, 360, 40)
      },
      column: {
        type: 'column',
        index: 1,
        segmentRect: createRect(120, 0, 120, 120)
      }
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
    const position = getAddButtonPosition(
      {
        type: 'column',
        index: 1,
        edge: 'inner',
        lineRect: createRect(120, 0, 0, 120)
      },
      18
    );

    expect(position.top).toBe(0);
    expect(position.left).toBe(120);
  });

  it('derives row add button coordinates from divider geometry at the left gutter edge', () => {
    const position = getAddButtonPosition(
      {
        type: 'row',
        index: 2,
        edge: 'trailing',
        lineRect: createRect(0, 120, 360, 0)
      },
      18
    );

    expect(position.top).toBe(120);
    expect(position.left).toBe(0);
  });

  it('derives row remove button coordinates from segment geometry at the left gutter edge', () => {
    const position = getRemoveButtonPosition(
      {
        type: 'row',
        index: 1,
        segmentRect: createRect(0, 40, 360, 40)
      },
      18
    );

    expect(position.top).toBe(60);
    expect(position.left).toBe(0);
  });

  it('derives column remove button coordinates from segment geometry at the top edge', () => {
    const position = getRemoveButtonPosition(
      {
        type: 'column',
        index: 1,
        segmentRect: createRect(120, 0, 120, 120)
      },
      18
    );

    expect(position.top).toBe(0);
    expect(position.left).toBe(180);
  });
});
