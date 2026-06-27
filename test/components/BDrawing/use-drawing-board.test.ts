/**
 * @file use-drawing-board.test.ts
 * @description 验证 BDrawing 画板 hook 的选区菜单命令。
 */
import { describe, expect, it } from 'vitest';
import { useDrawingBoard } from '@/components/BDrawing/hooks/useDrawingBoard';
import type { DrawingShapeElement } from '@/components/BDrawing/types';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @param x - 元素横坐标
 * @param y - 元素纵坐标
 * @returns 测试形状元素
 */
function createShapeElement(id: string, x: number, y: number): DrawingShapeElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    position: { x, y },
    size: { width: 100, height: 60 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

describe('useDrawingBoard selection commands', (): void => {
  it('copies and pastes the current selection through the board clipboard', (): void => {
    const board = useDrawingBoard({
      elements: [createShapeElement('node-1', 10, 20), createShapeElement('node-2', 50, 70)],
      selection: ['node-1', 'node-2']
    });

    expect(board.hasClipboard.value).toBe(false);
    board.copySelection();
    board.pasteClipboard({ x: 200, y: 300 });

    expect(board.hasClipboard.value).toBe(true);
    expect(board.state.value.elements.map((element: DrawingShapeElement): string => element.id)).toEqual([
      'node-1',
      'node-2',
      'drawing-shape-1',
      'drawing-shape-2'
    ]);
    expect(board.state.value.elements[2]?.position).toEqual({ x: 200, y: 300 });
    expect(board.state.value.elements[3]?.position).toEqual({ x: 240, y: 350 });
    expect(board.state.value.selection).toEqual(['drawing-shape-1', 'drawing-shape-2']);
  });

  it('groups, ungroups and reorders the current selection', (): void => {
    const board = useDrawingBoard({
      elements: [
        createShapeElement('node-1', 10, 20),
        createShapeElement('node-2', 50, 70),
        createShapeElement('node-3', 90, 120),
        createShapeElement('node-4', 130, 170)
      ],
      selection: ['node-2', 'node-3']
    });

    board.groupSelection();
    expect(board.state.value.elements[1]?.metadata.groupId).toBe('drawing-group-1');
    expect(board.state.value.elements[2]?.metadata.groupId).toBe('drawing-group-1');

    board.reorderSelection('bringToFront');
    expect(board.state.value.elements.map((element: DrawingShapeElement): string => element.id)).toEqual(['node-1', 'node-4', 'node-2', 'node-3']);

    board.setSelection(['node-2']);
    board.ungroupSelection();
    expect(board.state.value.elements[2]?.metadata.groupId).toBeUndefined();
    expect(board.state.value.elements[3]?.metadata.groupId).toBeUndefined();
  });
});
